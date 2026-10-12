import { describe, expect, it } from 'vitest'
import { revisionFromPoints, revisionOf } from './revision.js'

describe('revision', () => {
  it('is stable for the same path and racing sense', () => {
    expect(revisionOf('abc', 'ccw')).toBe(revisionOf('abc', 'ccw'))
    expect(revisionOf('abc', 'ccw')).not.toBe(revisionOf('abd', 'ccw'))
    expect(revisionOf('abc', 'ccw')).not.toBe(revisionOf('abc', 'cw'))
  })

  it('hashes a coordinate path the same way twice', () => {
    const points = [[103.86, 1.28], [103.87, 1.29]]
    expect(revisionFromPoints(points, 'ccw')).toBe(revisionFromPoints(points, 'ccw'))
    expect(revisionFromPoints(points, 'ccw')).toHaveLength(16)
  })
})
