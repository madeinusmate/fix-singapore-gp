const clamp01 = (value) => Math.min(1, Math.max(0, value))

const lapClock = (trace) => ({
  lap: Math.max(1e-6, trace.lapo),
  times: trace.to,
  speeds: trace.vo,
})

// Same search the lap playback uses. Past the last sample, `f` is greater than 1.
const atTime = (times, t) => {
  const last = times.length - 1
  if (last <= 0) return { lo: 0, hi: 0, f: 0 }
  let lo = 0
  let hi = last
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (times[mid] <= t) lo = mid
    else hi = mid
  }
  const span = Math.max(1e-6, times[hi] - times[lo])
  return { lo, hi, f: (t - times[lo]) / span }
}

const atDistance = (dist, metres) => {
  const last = dist.length - 1
  if (last <= 0) return { lo: 0, hi: 0, f: 0 }
  const target = Number.isFinite(metres) ? metres : 0
  if (target <= dist[0]) return { lo: 0, hi: 0, f: 0 }
  if (target >= dist[last]) return { lo: last, hi: last, f: 0 }
  let lo = 0
  let hi = last
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (dist[mid] <= target) lo = mid
    else hi = mid
  }
  const span = dist[hi] - dist[lo]
  return { lo, hi, f: span > 1e-6 ? (target - dist[lo]) / span : 0 }
}

// Where the car is at a lap time, in seconds.
export const sampleAtTime = (trace, time) => {
  const { lap, times, speeds } = lapClock(trace)
  const t = ((time % lap) + lap) % lap
  const { lo, hi, f } = times?.length ? atTime(times, t) : { lo: 0, hi: 0, f: 0 }
  const held = clamp01(f)
  const a = trace.ll?.[lo] || [0, 0]
  const b = trace.ll?.[hi] || a
  const sLo = trace.s?.[lo] || 0
  const sHi = trace.s?.[hi] ?? sLo
  const vLo = speeds?.[lo] || 0
  const vHi = speeds?.[hi] ?? vLo
  return {
    v: vLo + (vHi - vLo) * held,
    t,
    lap,
    xm: trace.xm?.[lo] || 0,
    s: sLo + (sHi - sLo) * held,
    lng: a[0] + (b[0] - a[0]) * f,
    lat: a[1] + (b[1] - a[1]) * f,
  }
}

// Lap time for a distance along the trace, in metres.
export const timeAtDistance = (trace, metres) => {
  const { times } = lapClock(trace)
  const dist = trace.s || []
  if (!dist.length || !times?.length) return 0
  const { lo, hi, f } = atDistance(dist, metres)
  return (times[lo] || 0) + ((times[hi] || 0) - (times[lo] || 0)) * f
}
