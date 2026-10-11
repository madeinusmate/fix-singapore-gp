import { ASSUME, START_LL } from './const.js'
import { despike, smoothWrap } from './filter.js'
import { toMetres } from './project.js'

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

export const prepare = (pathLngLat) => {
  let raw = despike(pathLngLat.map(([lng, lat]) => toMetres(lng, lat)))
  if (raw.length > 1 && hypot(raw[0], raw[raw.length - 1]) < 1) raw = raw.slice(0, -1)
  const closed = raw.concat([raw[0]])
  const s = [0]
  for (let i = 1; i < closed.length; i += 1) s.push(s[i - 1] + hypot(closed[i], closed[i - 1]))
  const total = s[s.length - 1]
  const xs = []
  const ys = []
  for (let d = 0; d < total; d += 2) {
    xs.push(interp(s, closed.map((p) => p[0]), d))
    ys.push(interp(s, closed.map((p) => p[1]), d))
  }
  const [sx, sy] = smoothWrap(xs, ys, 7)
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
  const x = new Array(n)
  const y = new Array(n)
  for (let i = 0; i < n; i += 1) {
    x[i] = sx[(i + roll) % n]
    y[i] = sy[(i + roll) % n]
  }
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
  return { x, y, seg, k, length, rawLength: s[s.length - 1] }
}
