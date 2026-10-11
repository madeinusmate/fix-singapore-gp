// Areas the bake's window filter would otherwise lose. Parks, land use and the
// bay itself (Marina Reservoir) reach past the window, so they are clipped to
// it instead of dropped. OSM2World draws no sea from coastline ways, so the sea
// is built here from the coastline, which keeps land on its left.
import polygonClipping from 'polygon-clipping'

const AREA_KEYS = ['landuse', 'leisure', 'natural', 'water']
const NOT_AREAS = new Set(['coastline', 'tree_row', 'cliff', 'ridge', 'arete'])

export const isArea = (tags) => !!tags && !tags.building && !tags['building:part']
  && AREA_KEYS.some((key) => tags[key] && !NOT_AREAS.has(tags[key]))

// Joins node-id chains end to end. With `flip`, a chain may be reversed to fit.
export const joinChains = (chains, flip) => {
  const left = chains.map((ids) => [...ids])
  const out = []
  while (left.length) {
    let chain = left.pop()
    let grew = true
    while (grew && chain[0] !== chain.at(-1)) {
      grew = false
      for (let k = 0; k < left.length; k += 1) {
        const next = left[k]
        if (next[0] === chain.at(-1)) chain = chain.concat(next.slice(1))
        else if (next.at(-1) === chain[0]) chain = next.concat(chain.slice(1))
        else if (flip && next.at(-1) === chain.at(-1)) chain = chain.concat([...next].reverse().slice(1))
        else if (flip && next[0] === chain[0]) chain = [...next].reverse().concat(chain.slice(1))
        else continue
        left.splice(k, 1)
        grew = true
        break
      }
    }
    out.push(chain)
  }
  return out
}

const rectOf = ([south, west, north, east]) => [[[west, south], [east, south], [east, north], [west, north], [west, south]]]

const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

// Liang–Barsky: the part of segment a→b inside the window, as [t0, t1], or null.
const clipSegment = (a, b, [south, west, north, east]) => {
  let t0 = 0
  let t1 = 1
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  for (const [p, q] of [[-dx, a[0] - west], [dx, east - a[0]], [-dy, a[1] - south], [dy, north - a[1]]]) {
    if (p === 0) {
      if (q < 0) return null
      continue
    }
    const t = q / p
    if (p < 0) t0 = Math.max(t0, t)
    else t1 = Math.min(t1, t)
    if (t0 > t1) return null
  }
  return [t0, t1]
}

// Cuts a polyline at the window edge into the pieces inside it.
export const clipLine = (points, bounds) => {
  const pieces = []
  let current = null
  let entered = false
  for (let i = 0; i + 1 < points.length; i += 1) {
    const seg = clipSegment(points[i], points[i + 1], bounds)
    if (!seg) continue
    const [t0, t1] = seg
    if (!current || t0 > 0) {
      current = [lerp(points[i], points[i + 1], t0)]
      entered = t0 > 0 || i > 0
    }
    if (t1 < 1) {
      current.push(lerp(points[i], points[i + 1], t1))
      pieces.push({ points: current, entry: entered, exit: true })
      current = null
    } else current.push(points[i + 1])
  }
  if (current) pieces.push({ points: current, entry: entered, exit: false })
  const closed = points.length > 2 && points[0][0] === points.at(-1)[0] && points[0][1] === points.at(-1)[1]
  if (closed && pieces.length > 1 && !pieces[0].entry && !pieces.at(-1).exit) {
    const last = pieces.pop()
    pieces[0] = { points: last.points.concat(pieces[0].points.slice(1)), entry: last.entry, exit: pieces[0].exit }
  }
  return pieces
}

// Distance clockwise round the window edge from its north-west corner.
const perimeterAt = ([x, y], [south, west, north, east]) => {
  const w = east - west
  const h = north - south
  const d = [Math.abs(y - north), Math.abs(x - east), Math.abs(y - south), Math.abs(x - west)]
  const edge = d.indexOf(Math.min(...d))
  if (edge === 0) return x - west
  if (edge === 1) return w + (north - y)
  if (edge === 2) return w + h + (east - x)
  return 2 * w + h + (y - south)
}

const cornersBetween = (from, to, [south, west, north, east]) => {
  const w = east - west
  const h = north - south
  const total = 2 * (w + h)
  const corners = [[0, [west, north]], [w, [east, north]], [w + h, [east, south]], [2 * w + h, [west, south]]]
  const span = (to - from + total) % total
  return corners
    .map(([s, point]) => [(s - from + total) % total, point])
    .filter(([ahead]) => ahead > 0 && ahead < span)
    .sort((a, b) => a[0] - b[0])
    .map(([, point]) => point)
}

// Water is on the right of a coastline, and the window edge walked clockwise
// keeps its inside on the right too, so each sea ring follows a coastline piece
// out of the window, then the edge clockwise to the next piece coming in.
export const seaOf = (coastlines, bounds) => {
  const crossing = []
  const islands = []
  for (const line of coastlines) {
    for (const piece of clipLine(line, bounds)) {
      const [first, last] = [piece.points[0], piece.points.at(-1)]
      const closed = piece.points.length > 3 && first[0] === last[0] && first[1] === last[1]
      if (piece.entry && piece.exit) crossing.push(piece)
      else if (!piece.entry && !piece.exit && closed) islands.push(piece.points)
      else return null
    }
  }
  if (!crossing.length) return null
  const total = 2 * ((bounds[3] - bounds[1]) + (bounds[2] - bounds[0]))
  crossing.forEach((piece) => {
    piece.in = perimeterAt(piece.points[0], bounds)
    piece.out = perimeterAt(piece.points.at(-1), bounds)
  })
  const used = new Set()
  const rings = []
  for (const start of crossing) {
    if (used.has(start)) continue
    const ring = []
    let piece = start
    while (!used.has(piece)) {
      used.add(piece)
      ring.push(...piece.points)
      const from = piece.out
      const next = crossing.reduce((best, other) => {
        const ahead = (other.in - from + total) % total
        return !best || ahead < best.ahead ? { other, ahead } : best
      }, null).other
      ring.push(...cornersBetween(from, next.in, bounds))
      piece = next
    }
    ring.push(ring[0])
    rings.push([ring])
  }
  const sea = polygonClipping.union(...rings)
  return islands.length ? polygonClipping.difference(sea, ...islands.map((ring) => [ring])) : sea
}

const ringArea = (ring) => {
  let sum = 0
  for (let i = 0; i + 1 < ring.length; i += 1) sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
  return Math.abs(sum) / 2
}

export const multiPolygonArea = (multi) => multi.reduce((sum, [outer, ...holes]) => (
  sum + ringArea(outer) - holes.reduce((h, ring) => h + ringArea(ring), 0)
), 0)

// Synthetic OSM elements for a clipped multipolygon: a closed way per simple
// polygon, a multipolygon relation where there are holes.
const emitter = () => {
  let next = -1
  const elements = []
  const way = (ring, tags) => {
    const ids = ring.slice(0, -1).map(([lon, lat]) => {
      const id = next
      next -= 1
      elements.push({ type: 'node', id, lat, lon })
      return id
    })
    const id = next
    next -= 1
    elements.push({ type: 'way', id, nodes: [...ids, ids[0]], ...(tags ? { tags } : {}) })
    return id
  }
  const area = (multi, tags) => {
    for (const [outer, ...holes] of multi) {
      if (outer.length < 4) continue
      if (!holes.length) {
        way(outer, tags)
        continue
      }
      const members = [{ type: 'way', ref: way(outer), role: 'outer' }, ...holes.map((ring) => ({ type: 'way', ref: way(ring), role: 'inner' }))]
      const id = next
      next -= 1
      elements.push({ type: 'relation', id, members, tags: { ...tags, type: 'multipolygon' } })
    }
  }
  return { elements, area }
}

// Returns the elements to add to the extract: every dropped area clipped to
// the window, and the sea.
export const restoreAreas = ({ elements, bounds, keptWays, keptRelations }) => {
  const nodes = new Map(elements.filter((e) => e.type === 'node').map((n) => [n.id, [n.lon, n.lat]]))
  const ways = new Map(elements.filter((e) => e.type === 'way').map((w) => [w.id, w]))
  const pointsOf = (ids) => (ids.every((id) => nodes.has(id)) ? ids.map((id) => nodes.get(id)) : null)
  const window = rectOf(bounds)
  const out = emitter()
  const report = { ways: 0, relations: 0, sea: 0 }
  const clipTo = (multi, tags) => {
    const clipped = polygonClipping.intersection(multi, window)
    if (clipped.length) out.area(clipped, tags)
    return clipped.length > 0
  }

  for (const way of ways.values()) {
    if (keptWays.has(way.id) || !isArea(way.tags) || way.nodes[0] !== way.nodes.at(-1)) continue
    const ring = pointsOf(way.nodes)
    if (ring && clipTo([[ring]], way.tags)) report.ways += 1
  }

  for (const relation of elements) {
    if (relation.type !== 'relation' || keptRelations.has(relation.id)) continue
    if (relation.tags?.type !== 'multipolygon' || !isArea(relation.tags)) continue
    const ringsOf = (role) => joinChains(relation.members
      .filter((m) => m.type === 'way' && (m.role || 'outer') === role && ways.has(m.ref))
      .map((m) => ways.get(m.ref).nodes), true)
      .filter((ids) => ids.length > 3 && ids[0] === ids.at(-1))
      .map(pointsOf)
      .filter(Boolean)
    const outers = ringsOf('outer')
    if (!outers.length) continue
    const inners = ringsOf('inner')
    let shape = polygonClipping.union(...outers.map((ring) => [ring]))
    if (inners.length) shape = polygonClipping.difference(shape, ...inners.map((ring) => [ring]))
    const { type: _type, ...tags } = relation.tags
    if (clipTo(shape, tags)) report.relations += 1
  }

  const coast = joinChains([...ways.values()].filter((w) => w.tags?.natural === 'coastline').map((w) => w.nodes), false)
    .map(pointsOf)
    .filter(Boolean)
  const sea = seaOf(coast, bounds)
  if (sea && multiPolygonArea(sea) < 0.5 * multiPolygonArea([window])) {
    out.area(sea, { natural: 'water', water: 'sea' })
    report.sea = sea.length
  }
  return { elements: out.elements, report }
}
