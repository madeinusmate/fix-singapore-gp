import { describe, expect, it } from 'vitest'
import { carAt } from './car.js'
import { buildCourse, CAR_HALF_M, locate } from './course.js'
import { buildWalls, hitWalls, KERB_M, RUN_OFF_M } from './walls.js'

const loop = (n, at) => {
  const x = []
  const y = []
  for (let i = 0; i < n; i += 1) {
    const [px, py] = at((i / n) * 2 * Math.PI)
    x.push(px)
    y.push(py)
  }
  const edges = { lx: [], ly: [], rx: [], ry: [] }
  let length = 0
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n
    const k = (i - 1 + n) % n
    const tx = x[j] - x[k]
    const ty = y[j] - y[k]
    const tl = Math.hypot(tx, ty)
    edges.lx.push(x[i] - (ty / tl) * 6)
    edges.ly.push(y[i] + (tx / tl) * 6)
    edges.rx.push(x[i] + (ty / tl) * 6)
    edges.ry.push(y[i] - (tx / tl) * 6)
    length += Math.hypot(x[j] - x[i], y[j] - y[i])
  }
  return buildCourse({ features: { prep: { x, y, edges, length }, centerline: [] } })
}

const ring = () => loop(1200, (t) => [400 * Math.cos(t), 400 * Math.sin(t)])
const eight = () => loop(1200, (t) => [300 * Math.sin(t), 150 * Math.sin(2 * t)])

describe('walls', () => {
  it('stand past the kerb and run-off on both sides', () => {
    const course = ring()
    const walls = buildWalls(course)
    expect(walls.left[10]).toBeCloseTo(course.left[10] + KERB_M + RUN_OFF_M)
    expect(walls.right[10]).toBeCloseTo(course.right[10] + KERB_M + RUN_OFF_M)
    expect(walls.openLeft.some(Boolean) || walls.openRight.some(Boolean)).toBe(false)
  })

  it('open where the lap crosses itself at the same level', () => {
    const course = eight()
    const walls = buildWalls(course)
    const open = (i) => walls.openLeft[i] && walls.openRight[i]
    expect(open(0)).toBe(true)
    expect(open(600)).toBe(true)
    expect(open(300)).toBe(false)
    expect(open(900)).toBe(false)
  })

  it('keep the walls where the crossing is a bridge', () => {
    const course = eight()
    course.h = course.h.map((_, i) => (i > 450 && i < 750 ? 7 : 0))
    const walls = buildWalls(course)
    expect(walls.openLeft[0] || walls.openRight[0]).toBe(false)
  })

  it('bounce a car back off the wall and slow it', () => {
    const course = ring()
    const walls = buildWalls(course)
    const i = 300
    const offset = walls.left[i] - CAR_HALF_M + 0.5
    const px = course.x[i] + course.nx[i] * offset
    const py = course.y[i] + course.ny[i] * offset
    const along = Math.atan2(course.ny[i], course.nx[i]) - Math.PI / 2
    const car = { ...carAt({ x: px, y: py, heading: along + 0.3 }), u: 40 }
    const where = locate(course, px, py, i)
    const { car: next, impact } = hitWalls(car, course, walls, where)
    expect(impact).toBeGreaterThan(5)
    expect(Math.hypot(next.u, next.v)).toBeLessThan(40)
    const after = locate(course, next.x, next.y, i)
    expect(after.offset + CAR_HALF_M).toBeLessThanOrEqual(walls.left[i] + 1e-6)
    const vx = next.u * Math.cos(next.heading) - next.v * Math.sin(next.heading)
    const vy = next.u * Math.sin(next.heading) + next.v * Math.cos(next.heading)
    expect(vx * course.nx[i] + vy * course.ny[i]).toBeLessThan(0)
  })

  it('leave a car alone inside the walls or well past an open gap', () => {
    const course = ring()
    const walls = buildWalls(course)
    const car = { ...carAt({ x: course.x[50], y: course.y[50], heading: 0 }), u: 30 }
    expect(hitWalls(car, course, walls, locate(course, car.x, car.y, 50)).impact).toBe(0)
    const far = walls.left[50] + 10
    const outside = { ...car, x: course.x[50] + course.nx[50] * far, y: course.y[50] + course.ny[50] * far }
    expect(hitWalls(outside, course, walls, locate(course, outside.x, outside.y, 50)).car).toBe(outside)
  })
})
