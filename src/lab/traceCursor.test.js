import { describe, expect, it } from 'vitest'
import { sampleAtTime, timeAtDistance } from './traceCursor.js'

const trace = {
  s: [0, 100, 300],
  v: [0, 100, 200],
  vo: [0, 110, 220],
  t: [0, 2, 5],
  to: [0, 1.5, 4],
  lap: 6,
  lapo: 5,
  ll: [[0, 0], [1, 0], [1, 1]],
  xm: [0, 1, 1],
}

describe('trace cursor', () => {
  it('places the car between speed samples', () => {
    const at = sampleAtTime(trace, false, 1)
    expect(at.t).toBe(1)
    expect(at.s).toBeCloseTo(50)
    expect(at.v).toBeCloseTo(50)
    expect(at.lng).toBeCloseTo(0.5)
    expect(at.lat).toBeCloseTo(0)
    expect(at.xm).toBe(0)
  })

  it('maps a dragged distance back onto the same point', () => {
    const t = timeAtDistance(trace, false, 200)
    expect(t).toBeCloseTo(3.5)
    expect(sampleAtTime(trace, false, t).s).toBeCloseTo(200)
    expect(sampleAtTime(trace, false, t).lng).toBeCloseTo(1)
    expect(sampleAtTime(trace, false, t).lat).toBeCloseTo(0.5)
  })

  it('uses the overtake clock without moving the distance', () => {
    expect(timeAtDistance(trace, true, 100)).toBeCloseTo(1.5)
    expect(sampleAtTime(trace, true, 1.5).s).toBeCloseTo(100)
    expect(sampleAtTime(trace, true, 1.5).v).toBeCloseTo(110)
  })

  it('keeps the playhead inside the trace', () => {
    expect(timeAtDistance(trace, false, -10)).toBe(0)
    expect(timeAtDistance(trace, false, 9999)).toBe(5)
    expect(sampleAtTime(trace, false, 6).t).toBe(0)
    expect(sampleAtTime(trace, false, 5).s).toBeCloseTo(300)
  })
})
