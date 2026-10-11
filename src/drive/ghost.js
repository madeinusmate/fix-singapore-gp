import { TRACE_EVERY } from '../sim/analyze.js'

const searchTimes = (times, t) => {
  let lo = 0
  let hi = times.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (times[mid] <= t) lo = mid
    else hi = mid
  }
  return lo
}

// Fractional lap sample the sim reaches at time t (seconds since the line).
// The sim ghost stops at the line once its lap is done.
const sampleAt = (trace, n, t) => {
  const times = trace.t
  const last = times.length - 1
  const tail = last * TRACE_EVERY
  const at = Math.max(0, Math.min(trace.lap, t))
  if (at >= times[last]) return tail + ((at - times[last]) / Math.max(1e-6, trace.lap - times[last])) * (n - tail)
  const lo = searchTimes(times, at)
  return (lo + (at - times[lo]) / Math.max(1e-6, times[lo + 1] - times[lo])) * TRACE_EVERY
}

export const ghostAt = (course, trace, t) => {
  const { n, x, y, h } = course
  const s = sampleAt(trace, n, t) % n
  const i = Math.floor(s)
  const j = (i + 1) % n
  const f = s - i
  return {
    x: x[i] + (x[j] - x[i]) * f,
    y: y[i] + (y[j] - y[i]) * f,
    h: h[i] + (h[j] - h[i]) * f,
    heading: Math.atan2(y[j] - y[i], x[j] - x[i]),
  }
}

// Seconds the sim took from the line to lap sample `index`.
export const simTimeAt = (trace, n, index) => {
  const times = trace.t
  const last = times.length - 1
  const k = index / TRACE_EVERY
  if (k >= last) return times[last] + ((index - last * TRACE_EVERY) / (n - last * TRACE_EVERY)) * (trace.lap - times[last])
  const lo = Math.floor(k)
  return times[lo] + (k - lo) * (times[lo + 1] - times[lo])
}
