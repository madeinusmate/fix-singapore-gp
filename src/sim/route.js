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

export const loadGraph = (doc) => {
  const nodes = []
  for (let i = 0; i < doc.nodes.length; i += 2) nodes.push([doc.nodes[i], doc.nodes[i + 1]])
  const edges = []
  const adj = nodes.map(() => [])
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
  }
  return { nodes, edges, adj, gridSouth: doc.gridSouth, gridNorth: doc.gridNorth }
}

const search = (graph, start, goal, allow) => {
  const dist = new Map([[start, 0]])
  const prev = new Map()
  const heap = [[0, start]]
  while (heap.length) {
    const [d, node] = pop(heap)
    if (d !== dist.get(node)) continue
    if (node === goal) break
    graph.adj[node].forEach((link) => {
      if (!allow(graph.edges[link.id])) return
      const nd = d + link.len
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

export const snapNode = (graph, lng, lat, maxM = 40) => {
  const [x, y] = toMetres(lng, lat)
  let best = -1
  let dist = Infinity
  graph.nodes.forEach(([lngN, latN], i) => {
    const [xn, yn] = toMetres(lngN, latN)
    const d = Math.hypot(xn - x, yn - y)
    if (d < dist) {
      dist = d
      best = i
    }
  })
  return dist <= maxM ? { id: best, dist } : null
}

const dedupe = (ids) => {
  const out = []
  ids.forEach((id) => {
    if (out[out.length - 1] !== id) out.push(id)
  })
  return out
}

export const buildLap = (graph, waypointIds, sense) => {
  const grid = gridChain(graph)
  if (!grid) return { ok: false, issues: [{ type: 'gap', message: 'The starting grid is missing from the street graph.' }], path: [], stretches: [], edgeIds: [], legs: [] }
  const exit = sense === 'cw' ? graph.gridSouth : graph.gridNorth
  const entry = sense === 'cw' ? graph.gridNorth : graph.gridSouth
  const gridNodes = sense === 'cw' ? [...grid.nodes].reverse() : grid.nodes
  const gridEdges = sense === 'cw' ? [...grid.edgeIds].reverse() : grid.edgeIds
  const stops = dedupe([exit, ...waypointIds, entry])
  const legs = []
  const midNodes = [stops[0]]
  const midEdges = []
  const stretches = [gridNodes.map((id) => graph.nodes[id])]
  let open = stretches[0]
  const issues = []
  let ok = true
  for (let i = 0; i < stops.length - 1; i += 1) {
    const found = search(graph, stops[i], stops[i + 1], (edge) => !edge.grid)
    if (!found) {
      ok = false
      legs.push({ ok: false, from: stops[i], to: stops[i + 1] })
      issues.push({
        type: 'gap',
        leg: i,
        line: [graph.nodes[stops[i]], graph.nodes[stops[i + 1]]],
        message: 'No street connects these points without using the starting grid.',
      })
      open = null
      continue
    }
    legs.push({ ok: true, edgeIds: found.edgeIds })
    midNodes.push(...found.nodes.slice(1))
    midEdges.push(...found.edgeIds)
    const coords = found.nodes.map((id) => graph.nodes[id])
    if (!open) {
      open = coords
      stretches.push(open)
    } else open.push(...coords.slice(1))
  }
  const nodes = dedupe([...gridNodes, ...midNodes.slice(1)])
  const edgeIds = [...gridEdges, ...midEdges]
  const path = nodes.map((id) => graph.nodes[id])
  if (path.length && path[0][0] === path[path.length - 1][0] && path[0][1] === path[path.length - 1][1]) path.pop()
  const seen = new Map()
  edgeIds.forEach((id) => seen.set(id, (seen.get(id) || 0) + 1))
  const reused = [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id)
  if (reused.length) issues.push({ type: 'reuse', edgeIds: reused, message: 'The lap drives the same road twice.' })
  const crosses = crossings(graph, edgeIds)
  if (crosses.length) issues.push({ type: 'cross', edgeIds: crosses, message: 'The lap crosses itself at street level.' })
  return {
    ok: ok && issues.length === 0,
    issues,
    path,
    stretches,
    nodes,
    edgeIds,
    legs,
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
    const a = toMetres(...graph.nodes[e1.a])
    const b = toMetres(...graph.nodes[e1.b])
    for (let j = i + 1; j < edgeIds.length; j += 1) {
      const e2 = graph.edges[edgeIds[j]]
      if (e1.a === e2.a || e1.a === e2.b || e1.b === e2.a || e1.b === e2.b) continue
      if (e1.layer !== e2.layer) continue
      const c = toMetres(...graph.nodes[e2.a])
      const d = toMetres(...graph.nodes[e2.b])
      if (properCross(a, b, c, d)) bad.push(e1.id, e2.id)
    }
  }
  return bad
}

export const edgeLine = (graph, edgeIds) => edgeIds.flatMap((id) => {
  const edge = graph.edges[id]
  return [graph.nodes[edge.a], graph.nodes[edge.b]]
})
