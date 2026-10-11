import { smoothWrap } from './filter.js'
import { toMetres } from './project.js'

// Half the car plus a kerb, kept clear of every road edge.
const CAR_M = 1.5
// Widest strip between two carriageways of one street the line may cross: a
// painted or flush divider, not a planted median.
const MEDIAN_M = 4
// Furthest a carriageway can sit from the lap and still count as the same road.
const REACH_M = 45
const CELL_M = 50
// A sample further than this from every street is not on the graph, so it gets no width.
const OFF_ROAD_M = 8
const MAX_SIDE_M = 30
// The line is solved on every second 2 m sample. Any finer and the three-point
// curvature chases noise instead of settling.
const EVERY = 2
const PASSES = 50

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

// Unnamed OSM ways carry their highway tag as the name, so two of them are not one street.
const named = (name) => Boolean(name) && !/^[a-z_]+$/.test(name)

// Lateral extent of the road at p: [right, left] in metres along the left normal n.
const sides = (index, p, t, n) => {
  const near = []
  let own = null
  nearby(index, p[0], p[1]).forEach((edge) => {
    const a = index.xy[edge.a]
    const b = index.xy[edge.b]
    const abx = b[0] - a[0]
    const aby = b[1] - a[1]
    const len = Math.hypot(abx, aby) || 1e-9
    const u = Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / (len * len)))
    const vx = a[0] + abx * u - p[0]
    const vy = a[1] + aby * u - p[1]
    const hit = { edge, d: Math.hypot(vx, vy), along: vx * t[0] + vy * t[1], across: vx * n[0] + vy * n[1], cos: (abx * t[0] + aby * t[1]) / len }
    if (hit.d <= REACH_M) near.push(hit)
    if (!own || hit.d < own.d) own = hit
  })
  if (!own || own.d > OFF_ROAD_M) return [0, 0]
  const half = own.edge.width / 2
  const spans = [[own.across - half, own.across + half]]
  if (named(own.edge.name)) {
    near.forEach((hit) => {
      if (hit.edge === own.edge || hit.edge.name !== own.edge.name || hit.edge.layer !== own.edge.layer) return
      if (Math.abs(hit.cos) < 0.85 || Math.abs(hit.along) > 2) return
      spans.push([hit.across - hit.edge.width / 2, hit.across + hit.edge.width / 2])
    })
  }
  spans.sort((x, y) => x[0] - y[0])
  let lo = own.across - half
  let hi = own.across + half
  let grew = true
  while (grew) {
    grew = false
    spans.forEach(([s0, s1]) => {
      if (s0 < lo && s1 >= lo - MEDIAN_M) { lo = s0; grew = true }
      if (s1 > hi && s0 <= hi + MEDIAN_M) { hi = s1; grew = true }
    })
  }
  return [Math.min(0, Math.max(-MAX_SIDE_M, lo + CAR_M)), Math.max(0, Math.min(MAX_SIDE_M, hi - CAR_M))]
}

// Signed 1/R of the circle through three points; positive turns left.
const inverseRadius = (ax, ay, x, y, bx, by) => {
  const x1 = bx - x
  const y1 = by - y
  const x2 = ax - x
  const y2 = ay - y
  const x3 = bx - ax
  const y3 = by - ay
  const nnn = Math.sqrt((x1 * x1 + y1 * y1) * (x2 * x2 + y2 * y2) * (x3 * x3 + y3 * y3))
  return nnn ? (2 * (x1 * y2 - x2 * y1)) / nnn : 0
}

// Rémi Coulom's K1999 line: each point is moved across the road until its
// curvature is the average of its neighbours', coarse to fine.
const k1999 = (lx, ly, rx, ry, lane) => {
  const n = lane.length
  const x = new Float64Array(n)
  const y = new Float64Array(n)
  const place = (i) => {
    x[i] = lx[i] + lane[i] * (rx[i] - lx[i])
    y[i] = ly[i] + lane[i] * (ry[i] - ly[i])
  }
  for (let i = 0; i < n; i += 1) place(i)
  const width = (i) => Math.hypot(rx[i] - lx[i], ry[i] - ly[i])
  const ir = (p, i, q) => inverseRadius(x[p], y[p], x[i], y[i], x[q], y[q])

  const adjust = (p, i, q, target, security) => {
    const w = width(i)
    if (w < 0.05) return
    const old = lane[i]
    const dx = x[q] - x[p]
    const dy = y[q] - y[p]
    const den = dy * (rx[i] - lx[i]) - dx * (ry[i] - ly[i])
    if (Math.abs(den) > 1e-9) lane[i] = Math.max(-0.2, Math.min(1.2, (-dy * (lx[i] - x[p]) + dx * (ly[i] - y[p])) / den))
    place(i)
    const dLane = 1e-4
    const dIr = inverseRadius(x[p], y[p], x[i] + dLane * (rx[i] - lx[i]), y[i] + dLane * (ry[i] - ly[i]), x[q], y[q])
    if (dIr > 1e-9) {
      lane[i] += (dLane / dIr) * target
      const edge = Math.min(0.5, security / w)
      if (target >= 0) {
        if (lane[i] < edge) lane[i] = edge
        if (1 - lane[i] < edge) lane[i] = 1 - old < edge ? Math.min(old, lane[i]) : 1 - edge
      } else {
        if (1 - lane[i] < edge) lane[i] = 1 - edge
        if (lane[i] < edge) lane[i] = old < edge ? Math.max(old, lane[i]) : edge
      }
    }
    lane[i] = Math.max(0, Math.min(1, lane[i]))
    place(i)
  }

  for (let step = 64; step >= 1; step /= 2) {
    const idx = []
    for (let i = 0; i < n; i += step) idx.push(i)
    const m = idx.length
    if (m < 8) continue
    const at = (j) => idx[((j % m) + m) % m]
    for (let pass = Math.round(PASSES * Math.sqrt(step)); pass > 0; pass -= 1) {
      for (let j = 0; j < m; j += 1) {
        const p = at(j - 1)
        const i = idx[j]
        const q = at(j + 1)
        const lPrev = Math.hypot(x[i] - x[p], y[i] - y[p])
        const lNext = Math.hypot(x[i] - x[q], y[i] - y[q])
        const target = (lNext * ir(at(j - 2), p, i) + lPrev * ir(i, q, at(j + 2))) / (lNext + lPrev || 1e-9)
        adjust(p, i, q, target, (lPrev * lNext) / 800)
      }
    }
    if (step > 1) {
      for (let j = 0; j < m; j += 1) {
        const a = idx[j]
        const b = j + 1 < m ? idx[j + 1] : n
        const ir0 = ir(at(j - 1), a, b % n)
        const ir1 = ir(a, b % n, at(j + 2))
        for (let k = a + 1; k < b; k += 1) {
          const f = (k - a) / (b - a)
          adjust(a, k, b % n, f * ir1 + (1 - f) * ir0, 0)
        }
      }
    }
  }
  return lane
}

// Lays a racing line inside the real road around a closed loop of evenly spaced
// centreline samples (metres), using both carriageways of a divided street.
// The returned edges are the kerbs of the road, not the strip the line may use.
// A sample off the street graph has both edges on the centreline.
// Offsets are measured across a smoothed centreline: across the raw polyline
// the inside kerb folds over itself at a sharp junction.
export const racingLine = (graph, rawX, rawY) => {
  const n = rawX.length
  if (n < 16) return { x: rawX, y: rawY, edges: null }
  const [xs, ys] = smoothWrap(rawX, rawY, 7)
  const index = edgeIndex(graph)
  const lx = new Float64Array(n)
  const ly = new Float64Array(n)
  const rx = new Float64Array(n)
  const ry = new Float64Array(n)
  const kerbs = { lx: new Array(n), ly: new Array(n), rx: new Array(n), ry: new Array(n) }
  const lane = new Float64Array(n)
  const nx = new Float64Array(n)
  const ny = new Float64Array(n)
  const lo = new Float64Array(n)
  const hi = new Float64Array(n)
  for (let i = 0; i < n; i += 1) {
    const a = (i - 2 + n) % n
    const b = (i + 2) % n
    const tx = xs[b] - xs[a]
    const ty = ys[b] - ys[a]
    const tl = Math.hypot(tx, ty) || 1e-9
    const t = [tx / tl, ty / tl]
    const nrm = [-t[1], t[0]]
    const [right, left] = sides(index, [xs[i], ys[i]], t, nrm)
    ;[nx[i], ny[i], lo[i], hi[i]] = [nrm[0], nrm[1], right, left]
    lx[i] = xs[i] + nrm[0] * left
    ly[i] = ys[i] + nrm[1] * left
    rx[i] = xs[i] + nrm[0] * right
    ry[i] = ys[i] + nrm[1] * right
    lane[i] = left - right > 1e-6 ? left / (left - right) : 0
    const pad = left - right > 1e-6 ? CAR_M : 0
    kerbs.lx[i] = xs[i] + nrm[0] * (left + pad)
    kerbs.ly[i] = ys[i] + nrm[1] * (left + pad)
    kerbs.rx[i] = xs[i] + nrm[0] * (right - pad)
    kerbs.ry[i] = ys[i] + nrm[1] * (right - pad)
  }
  const every = (arr) => arr.filter((_, i) => i % EVERY === 0)
  const coarse = k1999(every(lx), every(ly), every(rx), every(ry), every(lane))
  const outX = new Array(n)
  const outY = new Array(n)
  for (let i = 0; i < n; i += 1) {
    const j = Math.floor(i / EVERY)
    const f = (i % EVERY) / EVERY
    const u = coarse[j] * (1 - f) + coarse[(j + 1) % coarse.length] * f
    outX[i] = lx[i] + u * (rx[i] - lx[i])
    outY[i] = ly[i] + u * (ry[i] - ly[i])
  }
  // Light smoothing takes the kinks out of the interpolated line; clamping puts
  // back any corner it pulled over the inside kerb.
  const [sx, sy] = smoothWrap(outX, outY, 3)
  for (let i = 0; i < n; i += 1) {
    const off = Math.max(lo[i], Math.min(hi[i], (sx[i] - xs[i]) * nx[i] + (sy[i] - ys[i]) * ny[i]))
    const along = (sx[i] - xs[i]) * -ny[i] + (sy[i] - ys[i]) * nx[i]
    sx[i] = xs[i] + nx[i] * off - ny[i] * along
    sy[i] = ys[i] + ny[i] * off + nx[i] * along
  }
  return { x: sx, y: sy, edges: kerbs }
}
