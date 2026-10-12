import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { simTimeAt, ghostAt } from './ghost.js'
import { bestKey, OFF_ROAD_LIMIT_S, readBest, saveBest, startLap, stepLap } from './lap.js'

const course = { n: 1000, checkpoints: [100, 200, 300, 400, 500, 600, 700, 800, 900] }

// Drives samples from..to (inclusive, wrapping) one sample per frame.
const drive = (lap, from, to, { dt = 0.01, offAt = () => false } = {}) => {
  let state = lap
  const done = []
  for (let k = 0; ; k += 1) {
    const index = (from + k) % course.n
    state = stepLap(state, { index, fullyOff: offAt(index) }, dt, course)
    if (state.completed) done.push(state.completed)
    if (index === to) break
  }
  return { state, done }
}

describe('lap', () => {
  it('starts timing at the first crossing and finishes a clean lap at the next', () => {
    const out = drive(startLap(), 960, 5)
    expect(out.state.phase).toBe('timed')
    expect(out.done).toEqual([])
    const lap = drive(out.state, 6, 5)
    expect(lap.done).toHaveLength(1)
    expect(lap.done[0].clean).toBe(true)
    expect(lap.done[0].time).toBeCloseTo(10, 1)
  })

  it('marks a lap that skips a checkpoint as not clean', () => {
    const out = drive(startLap(), 960, 5).state
    const before = drive(out, 6, 380).state
    const after = drive(before, 520, 5)
    expect(after.done[0].clean).toBe(false)
  })

  it('allows short trips off the road but not long ones', () => {
    const out = drive(startLap(), 960, 5).state
    const brief = drive(out, 6, 5, { offAt: (i) => i >= 300 && i < 300 + (OFF_ROAD_LIMIT_S - 0.5) / 0.01 })
    expect(brief.done[0].clean).toBe(true)
    const long = drive(brief.state, 6, 5, { offAt: (i) => i >= 300 && i < 300 + (OFF_ROAD_LIMIT_S + 0.5) / 0.01 })
    expect(long.done[0].clean).toBe(false)
  })

  it('does not count backing over the line and driving on as a lap', () => {
    const timed = drive(startLap(), 960, 10).state
    let state = timed
    for (let index = 10; index >= 0; index -= 1) state = stepLap(state, { index, fullyOff: false }, 0.01, course)
    state = stepLap(state, { index: 995, fullyOff: false }, 0.01, course)
    const forward = drive(state, 996, 20)
    expect(forward.done).toEqual([])
    expect(forward.state.phase).toBe('timed')
  })
})

describe('personal best', () => {
  const store = new Map()
  beforeEach(() => {
    globalThis.window = { localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) } }
  })
  afterEach(() => {
    store.clear()
    delete globalThis.window
  })

  it('keeps the fastest time per layout and revision', () => {
    const key = bestKey('abc', 'rev-a')
    expect(readBest(key)).toBeNull()
    expect(saveBest(key, 92.5)).toBe(92.5)
    expect(saveBest(key, 95)).toBe(92.5)
    expect(saveBest(key, 90)).toBe(90)
    expect(readBest(bestKey('abc', 'rev-b'))).toBeNull()
  })
})

describe('sim ghost', () => {
  const ghostCourse = { n: 9, x: [0, 1, 2, 3, 4, 5, 6, 7, 8], y: new Array(9).fill(0), h: new Array(9).fill(0) }
  const trace = { t: [0, 3, 6], lap: 9 }

  it('maps sim time to lap samples and back', () => {
    expect(ghostAt(ghostCourse, trace, 1.5).x).toBeCloseTo(1.5)
    expect(ghostAt(ghostCourse, trace, 7.5).x).toBeCloseTo(7.5)
    expect(simTimeAt(trace, 9, 4.5)).toBeCloseTo(4.5)
    expect(simTimeAt(trace, 9, 7.5)).toBeCloseTo(7.5)
  })

  it('waits at the line before and after its lap', () => {
    expect(ghostAt(ghostCourse, trace, -1).x).toBe(0)
    expect(ghostAt(ghostCourse, trace, 20).x).toBe(0)
  })
})
