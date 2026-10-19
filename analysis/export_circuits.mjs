// Street graphs for the circuits that are not Marina Bay.
// Each city gets the same files Singapore already has: a road graph, the lap
// raced today, and an elevation grid. OpenStreetMap supplies the streets.

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildLap, loadGraph } from '../src/sim/route.js'

const ROOT = dirname(fileURLToPath(import.meta.url))
const OUT = join(ROOT, '..', 'public', 'data')
const OVERPASS = 'https://overpass.openstreetmap.fr/api/interpreter'
const OSM = '© OpenStreetMap contributors, ODbL 1.0'
const DEM_ATTRIBUTION = 'Open-Meteo Elevation API (CC BY 4.0). Produced using Copernicus WorldDEM-90 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved.'

const HIGHWAYS = '^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|raceway|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$'
const LANE_M = 3.3
const DEFAULT_LANES = { motorway: 3, trunk: 3, primary: 3, secondary: 2, tertiary: 2 }

// racingSense is the direction the race is driven. Relation members are not
// stored in that order: the lap is chained by shared ends, then turned to face
// the race. Miami's relation only holds a fragment, so the lap is the raceway
// loop around the stadium, keeping the long line where two ways share ends.
const CIRCUITS = [
  { slug: 'azerbaijan', relation: 11266687, racingSense: 'ccw', title: 'Baku City Circuit, as raced', lengthKm: 6.003 },
  { slug: 'monaco', relation: 148194, racingSense: 'cw', title: 'Circuit de Monaco, as raced', lengthKm: 3.337 },
  { slug: 'las-vegas', relation: 16696508, racingSense: 'ccw', title: 'Las Vegas Strip Circuit, as raced', lengthKm: 6.201 },
  { slug: 'miami', racingSense: 'ccw', title: 'Miami International Autodrome, as raced', lengthKm: 5.412, raceways: [25.94, -80.26, 25.98, -80.22] },
  { slug: 'madrid', relation: 18813472, racingSense: 'ccw', title: 'Madring, as raced', lengthKm: 5.414 },
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const overpass = async (query) => {
  let last = 'overpass failed'
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const res = await fetch(`${OVERPASS}?data=${encodeURIComponent(query)}`, {
      headers: { 'user-agent': 'street-circuits-export/1.0' },
    })
    if (res.ok) return res.json()
    last = `${res.status} ${await res.text()}`
    await sleep(4000 * (attempt + 1))
  }
  throw new Error(last.slice(0, 300))
}

const round = (value) => Math.round(value * 1e7) / 1e7
const keyOf = (lon, lat) => `${round(lon).toFixed(7)},${round(lat).toFixed(7)}`

const metres = (lon, lat, origin) => {
  const cos = Math.cos((origin[1] * Math.PI) / 180)
  return [(lon - origin[0]) * 111320 * cos, (lat - origin[1]) * 110540]
}

const distM = (a, b, origin) => {
  const [x0, y0] = metres(a.lon, a.lat, origin)
  const [x1, y1] = metres(b.lon, b.lat, origin)
  return Math.hypot(x1 - x0, y1 - y0)
}

const layerOf = (tags) => {
  const raw = String(tags.layer || '0')
  return raw.replace('-', '').match(/^\d+$/) ? Number(raw) : 0
}

const widthOf = (tags) => {
  const highway = tags.highway || ''
  if (highway === 'raceway') return 14
  if (/^\d+$/.test(String(tags.lanes || '')) && Number(tags.lanes) > 0) return Number(tags.lanes) * LANE_M
  const oneway = tags.oneway === 'yes' || tags.oneway === '1'
  if (highway.endsWith('_link')) return (oneway ? 1 : 2) * LANE_M
  return (DEFAULT_LANES[highway] || (oneway ? 1 : 2)) * LANE_M
}

const bboxOf = (points, pad = 0.008) => {
  const lons = points.map((point) => point.lon)
  const lats = points.map((point) => point.lat)
  return {
    west: Math.min(...lons) - pad,
    south: Math.min(...lats) - pad,
    east: Math.max(...lons) + pad,
    north: Math.max(...lats) + pad,
  }
}

const wayLength = (way, origin) => way.geometry.reduce((sum, point, index) => (
  sum + (index ? distM(way.geometry[index - 1], point, origin) : 0)
), 0)

const sameEnds = (a, b, origin) => {
  const direct = distM(a.geometry[0], b.geometry[0], origin) + distM(a.geometry.at(-1), b.geometry.at(-1), origin)
  const flipped = distM(a.geometry[0], b.geometry.at(-1), origin) + distM(a.geometry.at(-1), b.geometry[0], origin)
  return Math.min(direct, flipped) < 2
}

// Two ways that meet at both ends are the same stretch drawn twice, or a
// shortcut beside the raced line. The raced line is the longer one.
const dropShorterParallels = (ways, origin) => {
  const drop = new Set()
  ways.forEach((way, i) => {
    ways.forEach((other, j) => {
      if (j <= i || drop.has(i) || drop.has(j) || !sameEnds(way, other, origin)) return
      drop.add(wayLength(way, origin) >= wayLength(other, origin) ? j : i)
    })
  })
  return ways.filter((_, index) => !drop.has(index))
}

const isPit = (tags = {}) => /pit/i.test(tags.name || '') || tags.service === 'pit'

const asLapWay = (way) => ({
  id: way.ref || way.id,
  geometry: way.geometry,
  tags: { highway: 'raceway', name: way.tags?.name && !isPit(way.tags) ? way.tags.name : 'circuit' },
})

const lapWaysOf = (relation) => {
  const ways = relation.members.filter((member) => member.type === 'way' && member.geometry?.length >= 2 && member.role !== 'pit_lane' && member.role !== 'pit' && member.role !== 'alternative')
  const directed = ways.some((member) => member.role === 'forward' || member.role === 'backward')
  const chosen = directed ? ways.filter((member) => member.role === 'forward' || member.role === 'backward') : ways
  return chosen.map(asLapWay)
}

const pitIdsOf = (relation) => new Set(
  relation.members.filter((member) => member.role === 'pit_lane' || member.role === 'pit').map((member) => member.ref),
)

const startOf = (relation) => {
  const node = relation?.members.find((member) => member.type === 'node' && (member.role === 'start' || member.role === 'start-finish') && member.lat != null)
  return node ? { lon: node.lon, lat: node.lat } : null
}

// Walk the ways into one loop. Member order is not the race direction.
const chainWays = (ways, origin) => {
  const pool = dropShorterParallels(ways, origin)
  if (pool.length < 2) throw new Error('the lap relation has no circuit')
  const used = new Set()
  let seq = pool[0].geometry.map((point) => ({ lon: point.lon, lat: point.lat }))
  used.add(0)
  const gaps = []
  while (used.size < pool.length) {
    const cursor = seq[seq.length - 1]
    let best = null
    pool.forEach((way, index) => {
      if (used.has(index)) return
      const forward = distM(cursor, way.geometry[0], origin)
      const backward = distM(cursor, way.geometry.at(-1), origin)
      const gap = Math.min(forward, backward)
      if (!best || gap < best.gap) best = { index, gap, reverse: backward + 0.5 < forward }
    })
    if (!best || best.gap > 40) {
      throw new Error(`lap breaks by ${best ? best.gap.toFixed(0) : '?'}m with ${pool.length - used.size} ways left`)
    }
    const next = pool[best.index].geometry.map((point) => ({ lon: point.lon, lat: point.lat }))
    if (best.reverse) next.reverse()
    if (best.gap >= 1) gaps.push([cursor, next[0]])
    seq.push(...(distM(cursor, next[0], origin) < 1 ? next.slice(1) : next))
    used.add(best.index)
  }
  const close = distM(seq[0], seq[seq.length - 1], origin)
  if (close > 40) throw new Error(`lap does not close (${close.toFixed(0)}m)`)
  if (close < 1) seq.pop()
  else gaps.push([seq[seq.length - 1], seq[0]])
  return { points: seq, gaps }
}

const signedArea = (points) => {
  let area = 0
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    area += a.lon * b.lat - b.lon * a.lat
  }
  return area
}

const orientLap = (points, sense) => {
  const ccw = signedArea(points) > 0
  if ((sense === 'ccw') === ccw) return points
  return [...points].reverse()
}

const loopLength = (points, origin) => points.reduce((sum, point, index) => (
  sum + distM(index ? points[index - 1] : points[points.length - 1], point, origin)
), 0)

const straightRun = (points, startAt, origin) => {
  const xy = points.map((point) => metres(point.lon, point.lat, origin))
  const n = points.length
  const step = (i) => {
    const a = xy[i]
    const b = xy[(i + 1) % n]
    return { head: Math.atan2(b[1] - a[1], b[0] - a[0]), len: Math.hypot(b[0] - a[0], b[1] - a[1]) }
  }
  const nearest = points.reduce((best, point, index) => {
    const d = distM(point, startAt, origin)
    return d < best.d ? { d, index } : best
  }, { d: Infinity, index: 0 })
  if (nearest.d > 30) throw new Error(`start line is ${nearest.d.toFixed(0)}m from the lap`)
  const base = step(nearest.index).head
  const aligned = (head) => {
    let delta = Math.abs(head - base) % (Math.PI * 2)
    if (delta > Math.PI) delta = Math.PI * 2 - delta
    return delta < (12 * Math.PI) / 180
  }
  let back = nearest.index
  let exit = (nearest.index + 1) % n
  let guard = 0
  while (guard < n && aligned(step((back - 1 + n) % n).head)) {
    back = (back - 1 + n) % n
    guard += 1
  }
  guard = 0
  while (guard < n && aligned(step(exit).head)) {
    exit = (exit + 1) % n
    guard += 1
  }
  return { back, exit, start: points[nearest.index] }
}

const build = (streets, lapWays, pitIds, origin) => {
  const nodes = new Map()
  const edges = []
  const seen = new Set()
  const nodeId = (lon, lat) => {
    const key = keyOf(lon, lat)
    if (!nodes.has(key)) nodes.set(key, { lon: round(lon), lat: round(lat) })
    return key
  }
  const add = (a, b, name, layer, bridge, raceway, width) => {
    if (a === b) return
    const pair = a < b ? `${a}|${b}` : `${b}|${a}`
    if (seen.has(pair)) {
      if (raceway) edges.find((edge) => edge.pair === pair).raceway = 1
      return
    }
    seen.add(pair)
    const pa = nodes.get(a)
    const pb = nodes.get(b)
    edges.push({
      pair, a, b, name, layer, bridge, raceway, width,
      len: distM(pa, pb, origin),
      grid: 0,
    })
  }
  const addWay = (way, raceway) => {
    const geom = way.geometry || []
    const tags = way.tags || {}
    const name = tags.name || tags.highway || (raceway ? 'circuit' : 'road')
    const ids = geom.map((point) => nodeId(point.lon, point.lat))
    for (let i = 0; i < ids.length - 1; i += 1) {
      add(ids[i], ids[i + 1], name, layerOf(tags), tags.bridge ? 1 : 0, raceway ? 1 : 0, widthOf(tags))
    }
  }
  lapWays.forEach((way) => addWay(way, true))
  streets.forEach((way) => {
    if (pitIds.has(way.id)) return
    const tags = way.tags || {}
    if (tags.access === 'private' || tags.service === 'driveway' || tags.service === 'parking_aisle') return
    addWay(way, tags.highway === 'raceway')
  })
  return { nodes, edges }
}

const linkStreets = (graph, lapPoints, origin) => {
  const street = []
  graph.edges.forEach((edge) => {
    if (edge.raceway) return
    street.push(graph.nodes.get(edge.a), graph.nodes.get(edge.b))
  })
  if (!street.length) return
  let since = 0
  for (let i = 0; i < lapPoints.length; i += 1) {
    const point = lapPoints[i]
    const step = i ? distM(lapPoints[i - 1], point, origin) : 0
    since += step
    if (since < 80 && i !== 0) continue
    since = 0
    let best = null
    street.forEach((node) => {
      const d = distM(point, node, origin)
      if (!best || d < best.d) best = { d, node }
    })
    if (!best || best.d < 2 || best.d > 18) continue
    const a = keyOf(point.lon, point.lat)
    const b = keyOf(best.node.lon, best.node.lat)
    if (!graph.nodes.has(a) || !graph.nodes.has(b)) continue
    const pair = a < b ? `${a}|${b}` : `${b}|${a}`
    if (graph.edges.some((edge) => edge.pair === pair)) continue
    graph.edges.push({
      pair, a, b, name: 'street link', layer: 0, bridge: 0, raceway: 0, width: 8,
      len: best.d, grid: 0,
    })
  }
}

const indexesOf = (points, from, to) => {
  const ids = []
  let i = from
  ids.push(i)
  while (i !== to) {
    i = (i + 1) % points.length
    ids.push(i)
    if (ids.length > points.length + 1) throw new Error('grid straight did not close')
  }
  return ids
}

const toDoc = (graph, gridKeys, origin, bounds) => {
  const keys = [...graph.nodes.keys()]
  const index = new Map(keys.map((key, i) => [key, i]))
  const names = []
  const nameId = new Map()
  const nid = (name) => {
    if (!nameId.has(name)) {
      nameId.set(name, names.length)
      names.push(name)
    }
    return nameId.get(name)
  }
  const flatNodes = []
  keys.forEach((key) => {
    const node = graph.nodes.get(key)
    flatNodes.push(node.lon, node.lat)
  })
  const flatEdges = []
  graph.edges.forEach((edge) => {
    const flags = (edge.bridge ? 1 : 0) | (edge.grid ? 2 : 0) | (edge.raceway ? 4 : 0)
    flatEdges.push(
      index.get(edge.a),
      index.get(edge.b),
      Math.max(1, Math.round(edge.len * 100)),
      nid(edge.name),
      edge.layer,
      flags,
      Math.round(edge.width * 10),
    )
  })
  const [south, north] = gridKeys
  return {
    license: 'ODbL-1.0',
    attribution: `${OSM}. Pit lane left out.`,
    origin,
    start: [graph.start.lon, graph.start.lat],
    gridAnchors: gridKeys.map((key) => {
      const node = graph.nodes.get(key)
      return [node.lon, node.lat]
    }),
    bounds: [[bounds.west, bounds.south], [bounds.east, bounds.north]],
    center: origin,
    names,
    nodes: flatNodes,
    edges: flatEdges,
    gridSouth: index.get(south),
    gridNorth: index.get(north),
  }
}

const popMin = (heap) => {
  const top = heap[0]
  const last = heap.pop()
  if (heap.length && last) {
    heap[0] = last
    let i = 0
    for (;;) {
      const left = i * 2 + 1
      const right = left + 1
      let smallest = i
      if (left < heap.length && heap[left][0] < heap[smallest][0]) smallest = left
      if (right < heap.length && heap[right][0] < heap[smallest][0]) smallest = right
      if (smallest === i) break
      const swap = heap[i]
      heap[i] = heap[smallest]
      heap[smallest] = swap
      i = smallest
    }
  }
  return top
}

const pushMin = (heap, item) => {
  heap.push(item)
  let i = heap.length - 1
  while (i > 0) {
    const parent = (i - 1) >> 1
    if (heap[parent][0] <= heap[i][0]) break
    const swap = heap[i]
    heap[i] = heap[parent]
    heap[parent] = swap
    i = parent
  }
}

const routeBetween = (graph, start, goal) => {
  const dist = new Map([[start, 0]])
  const prev = new Map()
  const heap = [[0, start]]
  while (heap.length) {
    const [d, node] = popMin(heap)
    if (d !== dist.get(node)) continue
    if (node === goal) break
    graph.adj[node].forEach((link) => {
      if (graph.edges[link.id].grid) return
      const next = d + link.len
      if (next < (dist.get(link.n) ?? 1e18)) {
        dist.set(link.n, next)
        prev.set(link.n, { node, id: link.id })
        pushMin(heap, [next, link.n])
      }
    })
  }
  if (!prev.has(goal)) return null
  const edgeIds = []
  let node = goal
  while (node !== start) {
    const step = prev.get(node)
    if (!step) return null
    edgeIds.push(step.id)
    node = step.node
  }
  edgeIds.reverse()
  return edgeIds
}

const pinch = (doc, middleKeys, sense) => {
  const graph = loadGraph(doc)
  const idOf = (key) => graph.at.get(key)
  const nodeAt = (key) => {
    const id = idOf(key)
    const [lon, lat] = graph.nodes[id]
    return { lon, lat }
  }
  const spaced = (spacing) => {
    const keep = [middleKeys[0]]
    let since = 0
    for (let i = 1; i < middleKeys.length - 1; i += 1) {
      since += distM(nodeAt(middleKeys[i - 1]), nodeAt(middleKeys[i]), doc.origin)
      const a = nodeAt(middleKeys[i - 1])
      const b = nodeAt(middleKeys[i])
      const c = nodeAt(middleKeys[i + 1])
      const ab = metres(b.lon, b.lat, doc.origin).map((value, k) => value - metres(a.lon, a.lat, doc.origin)[k])
      const bc = metres(c.lon, c.lat, doc.origin).map((value, k) => value - metres(b.lon, b.lat, doc.origin)[k])
      const turn = Math.hypot(...ab) > 1 && Math.hypot(...bc) > 1
        ? Math.abs(Math.atan2(ab[0] * bc[1] - ab[1] * bc[0], ab[0] * bc[0] + ab[1] * bc[1])) * 180 / Math.PI
        : 0
      if (since >= spacing || turn >= 22) {
        keep.push(middleKeys[i])
        since = 0
      }
    }
    keep.push(middleKeys[middleKeys.length - 1])
    return keep
  }
  const edgeOf = new Map()
  graph.edges.forEach((edge) => {
    edgeOf.set(edge.a < edge.b ? `${edge.a}-${edge.b}` : `${edge.b}-${edge.a}`, edge.id)
  })
  const wanted = []
  for (let i = 0; i < middleKeys.length - 1; i += 1) {
    const a = idOf(middleKeys[i])
    const b = idOf(middleKeys[i + 1])
    const id = edgeOf.get(a < b ? `${a}-${b}` : `${b}-${a}`)
    if (id == null) throw new Error('lap leaves the graph')
    wanted.push(id)
  }
  const sameEdges = (left, right) => left.length === right.length && left.every((id, index) => id === right[index])
  let spacing = 150
  let waypoints = spaced(spacing)
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const legs = []
    let routed = []
    let broken = false
    for (let i = 0; i < waypoints.length - 1; i += 1) {
      const found = routeBetween(graph, idOf(waypoints[i]), idOf(waypoints[i + 1]))
      legs.push(found)
      if (!found) {
        broken = true
        break
      }
      routed = routed.concat(found)
    }
    if (!broken && sameEdges(routed, wanted)) {
      const lap = buildLap(graph, waypoints.slice(1, -1).map(idOf), sense)
      const gridCount = graph.edges.filter((edge) => edge.grid).length
      const body = lap.edgeIds.slice(gridCount)
      if (lap.ok && sameEdges(body, wanted)) return waypoints.slice(1, -1)
    }
    let cursor = 0
    let inserted = false
    for (let i = 0; i < waypoints.length - 1 && !inserted; i += 1) {
      const found = legs[i]
      const matched = found && wanted.slice(cursor, cursor + found.length).every((id, index) => id === found[index])
      if (!matched) {
        const from = middleKeys.indexOf(waypoints[i])
        const to = middleKeys.indexOf(waypoints[i + 1])
        if (to > from + 1) {
          const extra = middleKeys[from + Math.floor((to - from) / 2)]
          if (!waypoints.includes(extra)) {
            waypoints.splice(i + 1, 0, extra)
            inserted = true
          }
        }
        break
      }
      cursor += found.length
    }
    if (!inserted) {
      spacing *= 0.65
      if (spacing < 20) break
      waypoints = spaced(spacing)
    }
  }
  throw new Error('could not lock waypoints to the raced lap')
}

const writeDem = async (dir, bounds) => {
  const originLat = (bounds.south + bounds.north) / 2
  const dlat = 120 / 110540
  const dlon = 120 / (111320 * Math.cos((originLat * Math.PI) / 180))
  const lats = []
  const lons = []
  for (let lat = bounds.south; lat <= bounds.north + 1e-9; lat += dlat) lats.push(lat)
  for (let lon = bounds.west; lon <= bounds.east + 1e-9; lon += dlon) lons.push(lon)
  const points = lats.flatMap((lat) => lons.map((lon) => [lon, lat]))
  const elev = []
  for (let i = 0; i < points.length; i += 80) {
    const chunk = points.slice(i, i + 80)
    const params = new URLSearchParams({
      latitude: chunk.map(([, lat]) => lat.toFixed(5)).join(','),
      longitude: chunk.map(([lon]) => lon.toFixed(5)).join(','),
    })
    let got = false
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const res = await fetch(`https://api.open-meteo.com/v1/elevation?${params}`)
      if (res.status === 429) {
        await sleep(5000 + attempt * 2000)
        continue
      }
      if (!res.ok) throw new Error(`elevation ${res.status}`)
      elev.push(...(await res.json()).elevation)
      got = true
      break
    }
    if (!got) throw new Error('elevation request failed')
    await sleep(400)
  }
  const doc = {
    license: 'CC-BY-4.0',
    attribution: DEM_ATTRIBUTION,
    source: 'https://api.open-meteo.com/v1/elevation',
    west: bounds.west,
    south: bounds.south,
    east: lons[lons.length - 1],
    north: lats[lats.length - 1],
    cols: lons.length,
    rows: lats.length,
    z: elev.map((value) => (value == null ? null : Math.round(value * 10) / 10)),
  }
  await writeFile(join(dir, 'dem.json'), JSON.stringify(doc))
  console.log(`dem ${doc.cols}x${doc.rows}`)
}

const racewaysIn = async (box) => {
  const [south, west, north, east] = box
  const doc = await overpass(`[out:json][timeout:120];way["highway"="raceway"](${south},${west},${north},${east});out geom;`)
  const ways = doc.elements.filter((element) => element.type === 'way' && element.geometry?.length >= 2 && !isPit(element.tags))
  const pitIds = new Set(doc.elements.filter((element) => element.type === 'way' && isPit(element.tags)).map((element) => element.id))
  return { ways: ways.map(asLapWay), pitIds }
}

const longestStraight = (points, origin) => {
  const xy = points.map((point) => metres(point.lon, point.lat, origin))
  const n = points.length
  const step = (i) => {
    const a = xy[i]
    const b = xy[(i + 1) % n]
    return { head: Math.atan2(b[1] - a[1], b[0] - a[0]), len: Math.hypot(b[0] - a[0], b[1] - a[1]) }
  }
  let best = { len: 0, at: 0 }
  for (let i = 0; i < n; i += 1) {
    const base = step(i).head
    let len = 0
    let guard = 0
    let j = i
    while (guard < n) {
      const part = step(j)
      let delta = Math.abs(part.head - base) % (Math.PI * 2)
      if (delta > Math.PI) delta = Math.PI * 2 - delta
      if (delta > (12 * Math.PI) / 180) break
      len += part.len
      j = (j + 1) % n
      guard += 1
    }
    if (len > best.len) best = { len, at: i, span: guard }
  }
  return points[(best.at + Math.floor(best.span / 2)) % n]
}

const one = async (circuit, withDem) => {
  console.log(`\n${circuit.slug}`)
  let lapWays
  let pitIds
  let start = null
  if (circuit.raceways) {
    const found = await racewaysIn(circuit.raceways)
    lapWays = found.ways
    pitIds = found.pitIds
  } else {
    const relationDoc = await overpass(`[out:json][timeout:120];relation(${circuit.relation});out geom;`)
    const relation = relationDoc.elements.find((element) => element.type === 'relation')
    if (!relation) throw new Error(`${circuit.slug} relation missing`)
    lapWays = lapWaysOf(relation)
    pitIds = pitIdsOf(relation)
    start = startOf(relation)
  }
  const rough = lapWays.flatMap((way) => way.geometry)
  const origin = [
    round(rough.reduce((sum, point) => sum + point.lon, 0) / rough.length),
    round(rough.reduce((sum, point) => sum + point.lat, 0) / rough.length),
  ]
  const chained = chainWays(lapWays, origin)
  const lapPoints = orientLap(chained.points, circuit.racingSense)
  const length = loopLength(lapPoints, origin)
  console.log(`lap ${(length / 1000).toFixed(3)} km, published ${circuit.lengthKm}`)
  if (Math.abs(length / 1000 - circuit.lengthKm) / circuit.lengthKm > 0.08) {
    throw new Error(`${circuit.slug} length ${(length / 1000).toFixed(3)} is not the published lap`)
  }
  const bounds = bboxOf(lapPoints)
  const streetDoc = await overpass(`[out:json][timeout:180];way["highway"~"${HIGHWAYS}"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});out geom;`)
  const streets = streetDoc.elements.filter((element) => element.type === 'way')
  const connectors = chained.gaps.map((gap, index) => ({
    id: -(index + 1),
    geometry: gap,
    tags: { highway: 'raceway', name: 'circuit' },
  }))
  const graph = build(streets, [...lapWays, ...connectors], pitIds, origin)
  linkStreets(graph, lapPoints, origin)
  if (!start) start = longestStraight(lapPoints, origin)
  graph.start = start
  const run = straightRun(lapPoints, start, origin)
  const gridIdx = indexesOf(lapPoints, run.back, run.exit)
  const gridKeys = []
  gridIdx.forEach((index) => {
    const key = keyOf(lapPoints[index].lon, lapPoints[index].lat)
    if (gridKeys.at(-1) !== key) gridKeys.push(key)
  })
  const gridSet = new Set()
  for (let i = 0; i < gridKeys.length - 1; i += 1) {
    const a = gridKeys[i]
    const b = gridKeys[i + 1]
    const pair = a < b ? `${a}|${b}` : `${b}|${a}`
    const edge = graph.edges.find((item) => item.pair === pair)
    if (!edge) throw new Error('grid straight is not an edge')
    edge.grid = 1
    gridSet.add(pair)
  }
  const backKey = gridKeys[0]
  const exitKey = gridKeys[gridKeys.length - 1]
  const southKey = circuit.racingSense === 'ccw' ? backKey : exitKey
  const northKey = circuit.racingSense === 'ccw' ? exitKey : backKey
  const lapKeys = []
  let cursor = run.back
  do {
    const key = keyOf(lapPoints[cursor].lon, lapPoints[cursor].lat)
    if (lapKeys.at(-1) !== key) lapKeys.push(key)
    cursor = (cursor + 1) % lapPoints.length
  } while (cursor !== run.back)
  lapKeys.push(backKey)
  const middle = lapKeys.slice(gridKeys.length - 1)
  if (middle[0] !== exitKey || middle[middle.length - 1] !== backKey) {
    throw new Error('middle of the lap does not run from the exit back to the grid')
  }
  const doc = toDoc(graph, [southKey, northKey], origin, bounds)
  const loaded = loadGraph(doc)
  const waypointKeys = pinch(doc, circuit.racingSense === 'ccw' ? middle : middle, circuit.racingSense)
  const waypointIds = waypointKeys.map((key) => loaded.at.get(key))
  const lap = buildLap(loaded, waypointIds, circuit.racingSense)
  if (!lap.ok) throw new Error(`${circuit.slug} lap did not rebuild: ${lap.issues.map((issue) => issue.message).join('; ')}`)
  const km = lap.path.reduce((sum, point, index) => {
    if (!index) return 0
    return sum + distM({ lon: lap.path[index - 1][0], lat: lap.path[index - 1][1] }, { lon: point[0], lat: point[1] }, origin)
  }, 0) / 1000
  console.log(`rebuild ${km.toFixed(3)} km, waypoints ${waypointIds.length}, nodes ${loaded.nodes.length}, edges ${loaded.edges.length}`)
  const dir = join(OUT, circuit.slug)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'graph.json'), JSON.stringify(doc))
  const current = {
    license: 'ODbL-1.0',
    attribution: OSM,
    title: circuit.title,
    short: 'Current',
    color: '#e10600',
    racingSense: circuit.racingSense,
    path: lap.path,
    waypoints: waypointKeys.map((key) => {
      const node = graph.nodes.get(key)
      return [node.lon, node.lat]
    }),
    grid: gridKeys.map((key) => {
      const node = graph.nodes.get(key)
      return [node.lon, node.lat]
    }),
  }
  await writeFile(join(dir, 'current.json'), JSON.stringify(current))
  if (withDem) await writeDem(dir, bounds)
}

const wanted = process.argv.slice(2).filter((arg) => arg !== '--dem')
const withDem = process.argv.includes('--dem')
const list = CIRCUITS.filter((circuit) => !wanted.length || wanted.includes(circuit.slug))
for (const circuit of list) {
  await one(circuit, withDem)
}
