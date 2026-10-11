import { toMetres } from './project.js'

const pop = (heap) => {
  const top = heap[0]
  const last = heap.pop()
  if (heap.length && last) {
    heap[0] = last
    let i = 0
    for (;;) {
      const l = i * 2 + 1
      const r = l + 1
      let smallest = i
      if (l < heap.length && before(heap[l], heap[smallest])) smallest = l
      if (r < heap.length && before(heap[r], heap[smallest])) smallest = r
      if (smallest === i) break
      const swap = heap[i]
      heap[i] = heap[smallest]
      heap[smallest] = swap
      i = smallest
    }
  }
  return top
}

const before = (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1])

const push = (heap, item) => {
  heap.push(item)
  let i = heap.length - 1
  while (i > 0) {
    const parent = (i - 1) >> 1
    if (!before(heap[i], heap[parent])) break
    const swap = heap[i]
    heap[i] = heap[parent]
    heap[parent] = swap
    i = parent
  }
}

const pairKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`)
const coordKey = (lng, lat) => `${lng.toFixed(7)},${lat.toFixed(7)}`

export const loadGraph = (doc) => {
  const nodes = []
  for (let i = 0; i < doc.nodes.length; i += 2) nodes.push([doc.nodes[i], doc.nodes[i + 1]])
  const xy = nodes.map(([lng, lat]) => toMetres(lng, lat))
  const at = new Map(nodes.map(([lng, lat], i) => [coordKey(lng, lat), i]))
  const edges = []
  const adj = nodes.map(() => [])
  const pairs = new Map()
  for (let i = 0; i < doc.edges.length; i += 6) {
    const a = doc.edges[i]
    const b = doc.edges[i + 1]
    const len = doc.edges[i + 2] / 100
    const name = doc.names[doc.edges[i + 3]]
    const layer = doc.edges[i + 4]
    const flags = doc.edges[i + 5]
    const id = edges.length
    const edge = { id, a, b, len, name, layer, bridge: Boolean(flags & 1), grid: Boolean(flags & 2) }
    edges.push(edge)
    adj[a].push({ n: b, len, id })
    adj[b].push({ n: a, len, id })
    pairs.set(pairKey(a, b), id)
  }
  return { nodes, xy, at, edges, adj, pairs, gridSouth: doc.gridSouth, gridNorth: doc.gridNorth }
}

const xyOf = (graph, id) => graph.xy?.[id] || toMetres(...graph.nodes[id])

const search = (graph, start, goal, allow, extra) => {
  const dist = new Map([[start, 0]])
  const prev = new Map()
  const heap = [[0, start]]
  while (heap.length) {
    const [d, node] = pop(heap)
    if (d !== dist.get(node)) continue
    if (node === goal) break
    graph.adj[node].forEach((link) => {
      const edge = graph.edges[link.id]
      if (!allow(edge)) return
      const nd = d + link.len + (extra ? extra(edge) : 0)
      if (nd < (dist.get(link.n) ?? 1e18)) {
        dist.set(link.n, nd)
        prev.set(link.n, { node, id: link.id })
        push(heap, [nd, link.n])
      }
    })
  }
  if (!prev.has(goal) && start !== goal) return null
  const nodes = [goal]
  const edgeIds = []
  let node = goal
  while (node !== start) {
    const step = prev.get(node)
    if (!step) return null
    edgeIds.push(step.id)
    node = step.node
    nodes.push(node)
  }
  nodes.reverse()
  edgeIds.reverse()
  return { nodes, edgeIds }
}

export const gridChain = (graph) => search(graph, graph.gridSouth, graph.gridNorth, (edge) => edge.grid)

const toSegment = (p, a, b) => {
  const abx = b[0] - a[0]
  const aby = b[1] - a[1]
  const L2 = abx * abx + aby * aby || 1e-9
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / L2))
  return { d: Math.hypot(a[0] + abx * t - p[0], a[1] + aby * t - p[1]), t }
}

// Snaps to the nearest road rather than the nearest node, so a click on a
// street never lands on a side street whose junction node happens to be closer.
// The start/finish straight is not a road a waypoint can sit on.
export const snapNode = (graph, lng, lat, maxM = 40) => {
  const p = toMetres(lng, lat)
  let best = null
  graph.edges.forEach((edge) => {
    if (edge.grid) return
    const hit = toSegment(p, xyOf(graph, edge.a), xyOf(graph, edge.b))
    if (!best || hit.d < best.d) best = { ...hit, edge }
  })
  if (!best || best.d > maxM) return null
  const id = best.t < 0.5 ? best.edge.a : best.edge.b
  return { id, dist: best.d }
}

export const nodeAt = (graph, lng, lat) => graph.at?.get(coordKey(lng, lat)) ?? snapNode(graph, lng, lat, 5)?.id ?? null

// A waypoint further than this from the trimmed lap is reported as skipped.
const SKIP_M = 25
// Detour the return leg will take rather than drive a road the lap already used.
const REUSE_PENALTY_M = 5000

const offGrid = (edge) => !edge.grid

const edgeBetween = (graph, a, b) => graph.pairs?.get(pairKey(a, b)) ?? graph.adj[a].find((link) => link.n === b)?.id ?? null

// Drops out-and-back spurs: a leg that ends by driving A→B and a next leg that
// starts B→A. They come from clicks that land just past a junction or up a dead end.
const trimSpurs = (graph, stops, found) => {
  const runs = []
  let run = [{ node: stops[0], leg: -1, edge: null }]
  found.forEach((leg, i) => {
    if (!leg) {
      runs.push(run)
      run = [{ node: stops[i + 1], leg: -1, edge: null }]
      return
    }
    leg.nodes.slice(1).forEach((node) => {
      if (run.length >= 2 && run[run.length - 2].node === node) run.pop()
      else run.push({ node, leg: i, edge: edgeBetween(graph, run[run.length - 1].node, node) })
    })
  })
  runs.push(run)
  return runs
}

const reusedEdges = (steps, gridEdges) => {
  const seen = new Map(gridEdges.map((id) => [id, 1]))
  steps.forEach((step) => {
    if (step.edge != null) seen.set(step.edge, (seen.get(step.edge) || 0) + 1)
  })
  return [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id)
}

const nearestM = (graph, id, nodes) => {
  const [x, y] = xyOf(graph, id)
  let best = Infinity
  nodes.forEach((n) => {
    const [xn, yn] = xyOf(graph, n)
    best = Math.min(best, Math.hypot(xn - x, yn - y))
  })
  return best
}

// Unnamed OSM ways carry their highway tag (e.g. "tertiary_link") as the name.
const streetName = (name) => {
  if (!name || !/^[a-z_]+$/.test(name)) return name
  return name.endsWith('_link') ? 'a slip road' : 'an unnamed road'
}

const streetNames = (graph, edgeIds) => [...new Set(edgeIds.map((id) => streetName(graph.edges[id].name)).filter(Boolean))]

const pointName = (i, count) => (i === 0 || i === count - 1 ? 'the grid' : `point ${i}`)

export const buildLap = (graph, waypointIds, sense) => {
  const grid = gridChain(graph)
  if (!grid) return { ok: false, issues: [{ type: 'gap', message: 'The starting grid is missing from the street graph.' }], path: [], edgeIds: [], legs: [], skipped: [] }
  const exit = sense === 'cw' ? graph.gridSouth : graph.gridNorth
  const entry = sense === 'cw' ? graph.gridNorth : graph.gridSouth
  const gridNodes = sense === 'cw' ? [...grid.nodes].reverse() : grid.nodes
  const gridEdges = sense === 'cw' ? [...grid.edgeIds].reverse() : grid.edgeIds
  const stops = [exit, ...waypointIds, entry]
  const closingLeg = stops.length - 2

  const settle = (legs) => {
    const runs = trimSpurs(graph, stops, legs)
    const onLap = new Set(runs.flat().map((step) => step.node))
    const skipped = waypointIds
      .map((id, i) => (onLap.has(id) || nearestM(graph, id, onLap) <= SKIP_M ? -1 : i))
      .filter((i) => i >= 0)
    return { found: legs, runs, skipped, reused: reusedEdges(runs.flat(), gridEdges) }
  }
  const faults = (attempt) => attempt.reused.length + attempt.skipped.length

  let best = settle(stops.slice(0, -1).map((from, i) => search(graph, from, stops[i + 1], offGrid)))
  // The route home is ours to choose, so steer it off roads the lap already
  // drives rather than doubling back or skipping the last point.
  if (faults(best) && best.found[closingLeg]) {
    const used = new Set(best.found.flatMap((leg, i) => (leg && i !== closingLeg ? leg.edgeIds : [])))
    const retry = [...best.found]
    retry[closingLeg] = search(graph, stops[closingLeg], entry, offGrid, (edge) => (used.has(edge.id) ? REUSE_PENALTY_M : 0))
    const attempt = settle(retry)
    if (faults(attempt) < faults(best)) best = attempt
  }
  const { found, runs, reused, skipped } = best

  const issues = []
  found.forEach((leg, i) => {
    if (leg) return
    issues.push({
      type: 'gap',
      leg: i,
      line: [graph.nodes[stops[i]], graph.nodes[stops[i + 1]]],
      message: `No street links ${pointName(i, stops.length)} to ${pointName(i + 1, stops.length)} without using the start/finish straight.`,
    })
  })

  const legs = found.map((leg, i) => ({ ok: Boolean(leg), auto: i === closingLeg, coords: [] }))
  runs.forEach((steps) => steps.forEach((step, k) => {
    if (!k) return
    const coords = legs[step.leg].coords
    if (!coords.length) coords.push(graph.nodes[steps[k - 1].node])
    coords.push(graph.nodes[step.node])
  }))
  found.forEach((leg, i) => {
    if (!leg) legs[i].coords = [graph.nodes[stops[i]], graph.nodes[stops[i + 1]]]
  })

  const ok = found.every(Boolean)
  const midNodes = ok ? runs[0].map((step) => step.node) : []
  const midEdges = runs.flat().filter((step) => step.edge != null).map((step) => step.edge)
  const nodes = ok ? [...gridNodes, ...midNodes.slice(1)] : []
  const edgeIds = [...gridEdges, ...midEdges]
  const path = nodes.map((id) => graph.nodes[id])
  if (path.length && path[0][0] === path[path.length - 1][0] && path[0][1] === path[path.length - 1][1]) path.pop()

  if (reused.length) {
    const closingEdges = new Set(runs.flat().filter((step) => step.leg === closingLeg).map((step) => step.edge))
    issues.push({ type: 'reuse', edgeIds: reused, names: streetNames(graph, reused), closing: reused.every((id) => closingEdges.has(id)), message: 'The lap drives the same road twice.' })
  }
  const crosses = crossings(graph, edgeIds)
  if (crosses.length) issues.push({ type: 'cross', edgeIds: crosses, names: streetNames(graph, crosses), message: 'The lap crosses itself at street level.' })
  return {
    ok: ok && issues.length === 0,
    issues,
    path,
    nodes,
    edgeIds,
    legs,
    skipped,
  }
}

const orient = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])

const properCross = (a, b, c, d) => {
  const o1 = orient(a, b, c)
  const o2 = orient(a, b, d)
  const o3 = orient(c, d, a)
  const o4 = orient(c, d, b)
  return o1 * o2 < 0 && o3 * o4 < 0
}

export const crossings = (graph, edgeIds) => {
  const bad = []
  for (let i = 0; i < edgeIds.length; i += 1) {
    const e1 = graph.edges[edgeIds[i]]
    const a = xyOf(graph, e1.a)
    const b = xyOf(graph, e1.b)
    for (let j = i + 1; j < edgeIds.length; j += 1) {
      const e2 = graph.edges[edgeIds[j]]
      if (e1.a === e2.a || e1.a === e2.b || e1.b === e2.a || e1.b === e2.b) continue
      if (e1.layer !== e2.layer) continue
      const c = xyOf(graph, e2.a)
      const d = xyOf(graph, e2.b)
      if (properCross(a, b, c, d)) bad.push(e1.id, e2.id)
    }
  }
  return bad
}

export const edgeLine = (graph, edgeIds) => edgeIds.flatMap((id) => {
  const edge = graph.edges[id]
  return [graph.nodes[edge.a], graph.nodes[edge.b]]
})
