import { describe, expect, it } from 'vitest'
import { shotFrame } from './frameShot.js'

const padding = { top: 40, right: 40, bottom: 40, left: 40 }
const view = { width: 1200, height: 630, padding }

describe('shot framing', () => {
  it('leaves a lap that already fills the padded frame', () => {
    const frame = shotFrame([
      { x: 40, y: 40 },
      { x: 1160, y: 590 },
    ], view)
    expect(frame.scale).toBeCloseTo(1)
    expect(frame.shiftX).toBeCloseTo(0)
    expect(frame.shiftY).toBeCloseTo(0)
  })

  it('zooms in and recenters a lap sitting small in the top left', () => {
    const frame = shotFrame([
      { x: 200, y: 80 },
      { x: 500, y: 260 },
    ], view)
    expect(frame.scale).toBeGreaterThan(1.5)
    expect(frame.shiftX).toBeLessThan(0)
    expect(frame.shiftY).toBeLessThan(0)
  })

  it('zooms out when the lap runs past the frame', () => {
    const frame = shotFrame([
      { x: -100, y: -40 },
      { x: 1400, y: 700 },
    ], view)
    expect(frame.scale).toBeLessThan(1)
  })

  it('ignores a point that did not project onto the map', () => {
    const frame = shotFrame([
      { x: 40, y: 40 },
      { x: Number.NaN, y: 100 },
      { x: 1e9, y: 1e9 },
      { x: 1160, y: 590 },
    ], view)
    expect(frame.scale).toBeCloseTo(1)
    expect(frame.shiftX).toBeCloseTo(0)
  })

  it('returns nothing when the lap has no extent', () => {
    expect(shotFrame([{ x: 10, y: 10 }], view)).toBeNull()
    expect(shotFrame([], view)).toBeNull()
  })
})
