import { ASSUME, START_LL } from './const.js'
import { despike, smoothWrap } from './filter.js'
import { toMetres } from './project.js'
import { racingLine } from './racingline.js'

const hypot = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])

const interp = (s, values, at) => {
  let lo = 0
  let hi = s.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (s[mid] <= at) lo = mid
    else hi = mid
  }
  const span = s[hi] - s[lo] || 1e-9
  const f = (at - s[lo]) / span
  return values[lo] + (values[hi] - values[lo]) * f
}

const FALLBACK_HALF_M = 7

// Kerbs on both sides of every lap sample. Without a street graph the road is a
// fixed strip around the line.
const edgesOf = (kerbs, rolled, x, y, heading) => {
  if (kerbs) {
    const [lx, ly] = smoothWrap(kerbs.lx, kerbs.ly, 7)
    const [rx, ry] = smoothWrap(kerbs.rx, kerbs.ry, 7)
    return { lx: rolled(lx), ly: rolled(ly), rx: rolled(rx), ry: rolled(ry) }
  }
  const nx = heading.map((h) => -Math.sin(h) * FALLBACK_HALF_M)
  const ny = heading.map((h) => Math.cos(h) * FALLBACK_HALF_M)
  return {
    lx: x.map((v, i) => v + nx[i]),
    ly: y.map((v, i) => v + ny[i]),
    rx: x.map((v, i) => v - nx[i]),
    ry: y.map((v, i) => v - ny[i]),
  }
}

// With a street graph the lap is driven on a racing line that uses the road's
// width; without one it follows the street centreline, as the Python lab does.
export const prepare = (pathLngLat, graph = null) => {
  let raw = despike(pathLngLat.map(([lng, lat]) => toMetres(lng, lat)))
  if (raw.length > 1 && hypot(raw[0], raw[raw.length - 1]) < 1) raw = raw.slice(0, -1)
  const closed = raw.concat([raw[0]])
  const s = [0]
  for (let i = 1; i < closed.length; i += 1) s.push(s[i - 1] + hypot(closed[i], closed[i - 1]))
  const total = s[s.length - 1]
  let xs = []
  let ys = []
  for (let d = 0; d < total; d += 2) {
    xs.push(interp(s, closed.map((p) => p[0]), d))
    ys.push(interp(s, closed.map((p) => p[1]), d))
  }
  let kerbs = null
  if (graph) {
    const line = racingLine(graph, xs, ys)
    xs = line.x
    ys = line.y
    kerbs = line.edges
  }
  const [sx, sy] = graph ? [xs, ys] : smoothWrap(xs, ys, 7)
  const start = toMetres(START_LL[0], START_LL[1])
  let roll = 0
  let best = Infinity
  for (let i = 0; i < sx.length; i += 1) {
    const d = Math.hypot(sx[i] - start[0], sy[i] - start[1])
    if (d < best) {
      best = d
      roll = i
    }
  }
  const n = sx.length
  const rolled = (values) => values.map((_, i) => values[(i + roll) % n])
  const x = rolled(sx)
  const y = rolled(sy)
  const seg = new Array(n)
  const heading = new Array(n)
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n
    const dx = x[j] - x[i]
    const dy = y[j] - y[i]
    seg[i] = Math.hypot(dx, dy)
    heading[i] = Math.atan2(dy, dx)
  }
  const dh = new Array(n)
  for (let i = 0; i < n; i += 1) {
    const delta = heading[(i + 1) % n] - heading[i]
    dh[i] = Math.atan2(Math.sin(delta), Math.cos(delta))
  }
  const ratio = dh.map((v, i) => v / (seg[i] || 1e-9))
  const [smoothK] = [smoothWrap(ratio, ratio, 3)[0]]
  const rmin = 1 / ASSUME.RMIN_m
  const k = smoothK.map((v) => Math.max(-rmin, Math.min(rmin, v)))
  const length = seg.reduce((a, b) => a + b, 0)
  return { x, y, seg, k, length, rawLength: s[s.length - 1], edges: edgesOf(kerbs, rolled, x, y, heading) }
}
