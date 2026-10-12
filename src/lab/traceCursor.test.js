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
  it('places the car on the overtake clock', () => {
    const at = sampleAtTime(trace, 0.75)
    expect(at.t).toBe(0.75)
    expect(at.lap).toBe(5)
    expect(at.s).toBeCloseTo(50)
    expect(at.v).toBeCloseTo(55)
    expect(at.lng).toBeCloseTo(0.5)
    expect(at.lat).toBeCloseTo(0)
    expect(at.xm).toBe(0)
  })

  it('maps a dragged distance back onto the same point', () => {
    const t = timeAtDistance(trace, 200)
    expect(t).toBeCloseTo(2.75)
    expect(sampleAtTime(trace, t).s).toBeCloseTo(200)
    expect(sampleAtTime(trace, t).lng).toBeCloseTo(1)
    expect(sampleAtTime(trace, t).lat).toBeCloseTo(0.5)
  })

  it('reads the overtake speed at a sample', () => {
    expect(timeAtDistance(trace, 100)).toBeCloseTo(1.5)
    expect(sampleAtTime(trace, 1.5).s).toBeCloseTo(100)
    expect(sampleAtTime(trace, 1.5).v).toBeCloseTo(110)
  })

  it('keeps the playhead inside the trace', () => {
    expect(timeAtDistance(trace, -10)).toBe(0)
    expect(timeAtDistance(trace, 9999)).toBe(4)
    expect(sampleAtTime(trace, 5).t).toBe(0)
    expect(sampleAtTime(trace, 4).s).toBeCloseTo(300)
  })
})
