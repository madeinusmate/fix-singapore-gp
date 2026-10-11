import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { analyze } from '../sim/analyze.js'
import { loadGraph } from '../sim/route.js'
import { corridorMask, decodeHeight, encodeHeight, sampleMask } from './corridor.js'
import { buildCourse } from './course.js'
import { WALL_THICK_M } from './meshes.js'
import { buildWalls } from './walls.js'

const graph = loadGraph(JSON.parse(readFileSync(new URL('../../public/data/graph.json', import.meta.url), 'utf8')))
const current = JSON.parse(readFileSync(new URL('../../public/data/current.json', import.meta.url), 'utf8'))
const course = buildCourse(analyze(current.path, null, graph), graph)
const walls = buildWalls(course)
const mask = corridorMask(course, walls)
const across = (i, offset) => [course.x[i] + course.nx[i] * offset, course.y[i] + course.ny[i] * offset]

describe('corridor mask', () => {
  it('round-trips road heights to a tenth of a metre', () => {
    ;[-1, 0, 4.5, 12.3].forEach((h) => expect(decodeHeight(encodeHeight(h))).toBeCloseTo(h, 1))
  })

  it('covers the lap out to the walls, at the road height', () => {
    expect(mask.width).toBeLessThanOrEqual(4096)
    expect(mask.height).toBeLessThanOrEqual(4096)
    let bridge = 0
    for (let i = 0; i < course.n; i += 7) {
      const levels = sampleMask(mask, ...across(i, 0))
      expect(levels).not.toBeNull()
      expect(levels[0] - 0.15).toBeLessThanOrEqual(course.h[i])
      expect(levels[1] + 0.15).toBeGreaterThanOrEqual(course.h[i])
      expect(sampleMask(mask, ...across(i, walls.left[i] + WALL_THICK_M))).not.toBeNull()
      expect(sampleMask(mask, ...across(i, -walls.right[i] - WALL_THICK_M))).not.toBeNull()
      if (course.h[i] > 4) bridge += 1
    }
    expect(bridge).toBeGreaterThan(0)
  })

  it('stops a few metres past the walls', () => {
    let outside = 0
    let samples = 0
    for (let i = 0; i < course.n; i += 7) {
      ;[walls.left[i] + WALL_THICK_M + 3.5, -(walls.right[i] + WALL_THICK_M + 3.5)].forEach((offset) => {
        samples += 1
        if (!sampleMask(mask, ...across(i, offset))) outside += 1
      })
    }
    expect(outside / samples).toBeGreaterThan(0.9)
  })
})
