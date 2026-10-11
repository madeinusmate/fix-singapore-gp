import { describe, expect, it } from 'vitest'
import { bigWheelGeometry } from './bigWheel.js'

const FLYER = { hub: 91.3, radius: 73.7, width: 8.1 }

describe('big wheel', () => {
  const { frame, capsules } = bigWheelGeometry(FLYER)
  frame.computeBoundingBox()
  capsules.computeBoundingBox()

  it('fits the OSM outline, with legs down to the ground', () => {
    expect(capsules.boundingBox.max.y).toBeCloseTo(FLYER.radius, 1)
    expect(capsules.boundingBox.min.y).toBeCloseTo(-FLYER.radius, 1)
    expect(Math.max(-capsules.boundingBox.min.x, capsules.boundingBox.max.x)).toBeLessThanOrEqual(FLYER.radius + 0.01)
    expect(frame.boundingBox.max.y).toBeLessThan(FLYER.radius)
    expect(frame.boundingBox.min.y).toBeLessThan(-FLYER.hub + 0.5)
    expect(frame.boundingBox.min.y).toBeGreaterThan(-FLYER.hub - 2)
  })

  it('stays a light mesh', () => {
    const triangles = (geometry) => geometry.index.count / 3
    expect(triangles(frame) + triangles(capsules)).toBeLessThan(40000)
  })
})
