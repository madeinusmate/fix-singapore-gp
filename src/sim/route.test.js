import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { decodePath, encodePath } from './polyline.js'
import { toMetres } from './project.js'
import { analyze } from './analyze.js'
import { buildLap, crossings, loadGraph, snapNode } from './route.js'

const graph = loadGraph(JSON.parse(readFileSync(new URL('../../public/data/graph.json', import.meta.url), 'utf8')))
const current = JSON.parse(readFileSync(new URL('../../public/data/current.json', import.meta.url), 'utf8'))

const metres = (lng, lat) => toMetres(lng, lat)

const pathM = (path) => path.reduce((sum, point, i) => {
  if (!i) return 0
  const [x0, y0] = metres(...path[i - 1])
  const [x1, y1] = metres(...point)
  return sum + Math.hypot(x1 - x0, y1 - y0)
}, 0)

const hausdorff = (a, b) => {
  const far = (from, to) => from.reduce((max, p) => {
    const [x, y] = metres(p[0], p[1])
    let best = Infinity
    to.forEach((q) => {
      const [xq, yq] = metres(q[0], q[1])
      best = Math.min(best, Math.hypot(xq - x, yq - y))
    })
    return Math.max(max, best)
  }, 0)
  return Math.max(far(a, b), far(b, a))
}

describe('street routing', () => {
  it('reproduces the current lap from its waypoints', () => {
    const ids = current.waypoints.map(([lng, lat]) => snapNode(graph, lng, lat, 5).id)
    const lap = buildLap(graph, ids, 'ccw')
    expect(lap.issues.filter((issue) => issue.type === 'gap')).toEqual([])
    expect(hausdorff(lap.path, current.path)).toBeLessThanOrEqual(8)
  })

  it('accepts the current lap and flips the grid when the sense changes', () => {
    const ids = current.waypoints.map(([lng, lat]) => snapNode(graph, lng, lat, 5).id)
    const ccw = buildLap(graph, ids, 'ccw')
    const cw = buildLap(graph, [...ids].reverse(), 'cw')
    expect(ccw.ok).toBe(true)
    expect(ccw.path[0]).toEqual(graph.nodes[graph.gridSouth])
    expect(cw.path[0]).toEqual(graph.nodes[graph.gridNorth])
    expect(cw.ok).toBe(true)
  })

  it('blocks a dead-end, a grid-only point, a same-level crossing, and a short lap', () => {
    const gridOnly = graph.adj.findIndex((links, i) => i !== graph.gridSouth && i !== graph.gridNorth && links.length > 0 && links.every((link) => graph.edges[link.id].grid))
    expect(gridOnly).toBeGreaterThan(-1)
    const gap = buildLap(graph, [gridOnly], 'ccw')
    expect(gap.issues.some((issue) => issue.type === 'gap' && issue.line.length === 2)).toBe(true)

    const dead = graph.adj.findIndex((links) => links.filter((link) => !graph.edges[link.id].grid).length === 1)
    expect(dead).toBeGreaterThan(-1)
    const spur = buildLap(graph, [dead], 'ccw')
    expect(spur.issues.some((issue) => issue.type === 'reuse')).toBe(false)
    expect(spur.skipped).toEqual([0])

    const crossGraph = {
      nodes: [[103.85, 1.29], [103.86, 1.3], [103.85, 1.3], [103.86, 1.29]],
      edges: [
        { id: 0, a: 0, b: 1, layer: 0 },
        { id: 1, a: 2, b: 3, layer: 0 },
        { id: 2, a: 0, b: 1, layer: 0 },
        { id: 3, a: 2, b: 3, layer: 1 },
      ],
    }
    expect(crossings(crossGraph, [0, 1]).length).toBeGreaterThan(0)
    expect(crossings(crossGraph, [2, 3])).toEqual([])

    const [sx, sy] = metres(...graph.nodes[graph.gridNorth])
    const gridNodes = new Set()
    graph.edges.forEach((edge) => {
      if (!edge.grid) return
      gridNodes.add(edge.a)
      gridNodes.add(edge.b)
    })
    let short = null
    for (let i = 0; i < graph.nodes.length && !short; i += 1) {
      if (gridNodes.has(i)) continue
      const [x, y] = metres(...graph.nodes[i])
      if (Math.hypot(x - sx, y - sy) > 400) continue
      const lap = buildLap(graph, [i], 'ccw')
      if (lap.ok && !lap.skipped.length && pathM(lap.path) < 3000) short = lap
    }
    expect(short).toBeTruthy()
    expect(analyze(short.path).metrics.length_km * 1000).toBeLessThan(3500)
  })

  it('builds every partial lap while the current lap is drawn point by point', () => {
    const ids = current.waypoints.map(([lng, lat]) => snapNode(graph, lng, lat, 5).id)
    ids.forEach((_, k) => {
      const lap = buildLap(graph, ids.slice(0, k + 1), 'ccw')
      expect(lap.issues).toEqual([])
      expect(lap.skipped).toEqual([])
    })
  })

  it('routes home around the last point instead of skipping it', () => {
    const ids = current.waypoints.map(([lng, lat]) => snapNode(graph, lng, lat, 5).id)
    const sparse = ids.filter((_, i) => i % 2 === 0).slice(0, 5)
    const lap = buildLap(graph, sparse, 'ccw')
    expect(lap.skipped).toEqual([])
    expect(lap.issues.filter((issue) => issue.type === 'reuse')).toEqual([])
  })

  it('ignores a click that lands just past a junction', () => {
    const ids = current.waypoints.map(([lng, lat]) => snapNode(graph, lng, lat, 5).id)
    const onLap = new Set(buildLap(graph, ids, 'ccw').nodes)
    const sideStreet = (id) => graph.adj[id].find((link) => !graph.edges[link.id].grid && !onLap.has(link.n))
    const at = ids.findIndex((id) => sideStreet(id))
    expect(at).toBeGreaterThan(-1)
    const overshoot = [...ids.slice(0, at), sideStreet(ids[at]).n, ...ids.slice(at + 1)]
    const lap = buildLap(graph, overshoot, 'ccw')
    expect(lap.issues).toEqual([])
    expect(lap.skipped).toEqual([])
  })

  it('snaps a click to the road under it, not a closer node on a side street', () => {
    const road = {
      nodes: [[103.85, 1.29], [103.851, 1.29], [103.8503, 1.29008], [103.8503, 1.2905]],
      edges: [{ id: 0, a: 0, b: 1 }, { id: 1, a: 2, b: 3 }],
    }
    expect(snapNode(road, 103.8504, 1.29002, 40).id).toBe(0)
  })

  it('round-trips a path through the polyline encoding', () => {
    const back = decodePath(encodePath(current.grid))
    back.forEach((point, i) => {
      expect(point[0]).toBeCloseTo(current.grid[i][0], 5)
      expect(point[1]).toBeCloseTo(current.grid[i][1], 5)
    })
  })
})
