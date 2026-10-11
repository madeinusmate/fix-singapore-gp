import { smoothWrap } from './filter.js'
import { toMetres } from './project.js'

const CELL_M = 50
// A sample further than this from every street is not on the graph, so it gets no width.
const OFF_ROAD_M = 8

const indexes = new WeakMap()

const cellKey = (x, y) => `${Math.floor(x / CELL_M)},${Math.floor(y / CELL_M)}`

const edgeIndex = (graph) => {
  if (indexes.has(graph)) return indexes.get(graph)
  const xy = graph.xy || graph.nodes.map(([lng, lat]) => toMetres(lng, lat))
  const cells = new Map()
  graph.edges.forEach((edge) => {
    const [ax, ay] = xy[edge.a]
    const [bx, by] = xy[edge.b]
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (CELL_M / 2)))
    const keys = new Set()
    for (let k = 0; k <= steps; k += 1) keys.add(cellKey(ax + ((bx - ax) * k) / steps, ay + ((by - ay) * k) / steps))
    keys.forEach((key) => {
      const list = cells.get(key)
      if (list) list.push(edge)
      else cells.set(key, [edge])
    })
  })
  const index = { xy, cells }
  indexes.set(graph, index)
  return index
}

const nearby = ({ cells }, x, y) => {
  const cx = Math.floor(x / CELL_M)
  const cy = Math.floor(y / CELL_M)
  const found = new Set()
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      cells.get(`${cx + dx},${cy + dy}`)?.forEach((edge) => found.add(edge))
    }
  }
  return found
}

const closest = (index, edge, p) => {
  const a = index.xy[edge.a]
  const b = index.xy[edge.b]
  const abx = b[0] - a[0]
  const aby = b[1] - a[1]
  const len = Math.hypot(abx, aby) || 1e-9
  const u = Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / (len * len)))
  return { x: a[0] + abx * u, y: a[1] + aby * u, ux: abx / len, uy: aby / len }
}

// The street under a lap sample: the nearest edge, preferring one that runs the
// way the lap does over a cross street meeting it at a junction.
const streetAt = (index, p, t) => {
  let best = null
  nearby(index, p[0], p[1]).forEach((edge) => {
    const c = closest(index, edge, p)
    const d = Math.hypot(c.x - p[0], c.y - p[1])
    const score = d + (Math.abs(c.ux * t[0] + c.uy * t[1]) < 0.7 ? 2 : 0)
    if (d <= OFF_ROAD_M && (!best || score < best.score)) best = { edge, score }
  })
  return best?.edge || null
}

// Kerbs of the street under each sample of a closed loop of street centreline
// samples (metres). A sample off the street graph has both kerbs on its centre.
// Kerbs are laid across a smoothed centreline: across the raw polyline the
// inside kerb folds over itself at a sharp junction.
export const kerbsOf = (graph, xs, ys) => {
  const n = xs.length
  const index = edgeIndex(graph)
  const [qx, qy] = smoothWrap(xs, ys, 7)
  const kerbs = { lx: new Array(n), ly: new Array(n), rx: new Array(n), ry: new Array(n) }
  for (let i = 0; i < n; i += 1) {
    const a = (i - 2 + n) % n
    const b = (i + 2) % n
    const tl = Math.hypot(qx[b] - qx[a], qy[b] - qy[a]) || 1e-9
    const t = [(qx[b] - qx[a]) / tl, (qy[b] - qy[a]) / tl]
    const nrm = [-t[1], t[0]]
    const edge = streetAt(index, [xs[i], ys[i]], t)
    let left = 0
    let right = 0
    if (edge) {
      const c = closest(index, edge, [qx[i], qy[i]])
      const across = (c.x - qx[i]) * nrm[0] + (c.y - qy[i]) * nrm[1]
      left = across + edge.width / 2
      right = across - edge.width / 2
    }
    kerbs.lx[i] = qx[i] + nrm[0] * left
    kerbs.ly[i] = qy[i] + nrm[1] * left
    kerbs.rx[i] = qx[i] + nrm[0] * right
    kerbs.ry[i] = qy[i] + nrm[1] * right
  }
  return kerbs
}
