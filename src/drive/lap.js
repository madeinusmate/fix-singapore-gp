// Samples either side of the line that count as being at it.
const AT_LINE = 30
// A checkpoint is passed when the car's sample comes this close to it.
const AT_CHECKPOINT = 15
export const OFF_ROAD_LIMIT_S = 2

export const startLap = () => ({
  phase: 'outLap',
  time: 0,
  index: null,
  behind: false,
  hits: [],
  offFor: 0,
  offTooLong: false,
  completed: null,
})

const timedFrom = (lap, count) => ({ ...lap, phase: 'timed', time: 0, hits: new Array(count).fill(false), offFor: 0, offTooLong: false })

// Advance the lap by one frame. `completed` is set only on the frame a timed
// lap ends: { time, clean }.
export const stepLap = (lap, { index, fullyOff }, dt, course) => {
  const { n, checkpoints } = course
  const prev = lap.index ?? index
  const forward = prev >= n - AT_LINE && index < AT_LINE
  const backward = prev < AT_LINE && index >= n - AT_LINE
  let next = { ...lap, index, completed: null }
  if (next.phase === 'timed') {
    next.time += dt
    next.offFor = fullyOff ? next.offFor + dt : 0
    if (next.offFor > OFF_ROAD_LIMIT_S) next.offTooLong = true
    const reached = checkpoints.findIndex((cp, k) => !next.hits[k] && Math.abs(index - cp) <= AT_CHECKPOINT)
    if (reached >= 0) next.hits = next.hits.map((hit, k) => hit || k === reached)
  }
  if (backward) return { ...next, behind: true }
  if (!forward) return next
  if (next.behind) return { ...next, behind: false }
  const completed = next.phase === 'timed'
    ? { time: next.time, clean: next.hits.every(Boolean) && !next.offTooLong }
    : null
  next = timedFrom(next, checkpoints.length)
  return { ...next, completed }
}

export const bestKey = (id, revision) => `drive-best:${id}:${revision}`

export const readBest = (key) => {
  try {
    const value = Number(window.localStorage.getItem(key))
    return value > 0 ? value : null
  } catch {
    return null
  }
}

// Stores `time` if it beats the saved personal best. Returns the best after saving.
export const saveBest = (key, time) => {
  const best = readBest(key)
  if (best != null && best <= time) return best
  try {
    window.localStorage.setItem(key, String(time))
  } catch {
    return best
  }
  return time
}
