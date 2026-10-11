import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { analyze } from '../sim/analyze.js'
import { G0 } from '../sim/const.js'
import { loadGraph } from '../sim/route.js'
import { carAt, gripAt, GEAR_TOP_KMH, IDLE_RPM, LIMIT_RPM, steerLimit, stepCar, WHEELBASE_M } from './car.js'
import { buildCourse, locate } from './course.js'
import { startLap, stepLap } from './lap.js'
import { buildWalls, hitWalls } from './walls.js'

const DT = 1 / 60
const still = () => carAt({ x: 0, y: 0, heading: 0 })
const drive = (car, input, seconds, until = () => false) => {
  let next = car
  let t = 0
  while (t < seconds && !until(next)) {
    next = stepCar(next, input, DT)
    t += DT
  }
  return { car: next, t }
}
const kmh = (car) => car.u * 3.6
const FULL = { throttle: 1, brake: 0, steer: 0 }

describe('car', () => {
  it('reaches 100 km/h in about F1 time, shifting up through the box', () => {
    const { car, t } = drive(still(), FULL, 10, (c) => kmh(c) >= 100)
    expect(t).toBeGreaterThan(2)
    expect(t).toBeLessThan(3.5)
    expect(car.gear).toBeGreaterThanOrEqual(2)
    expect(Math.abs(car.y)).toBeLessThan(0.01)
  })

  it('tops out in eighth near the sim top speed', () => {
    const { car } = drive(still(), FULL, 60)
    expect(car.gear).toBe(GEAR_TOP_KMH.length)
    expect(kmh(car)).toBeGreaterThan(320)
    expect(kmh(car)).toBeLessThan(360)
    expect(car.rpm).toBeGreaterThan(IDLE_RPM)
    expect(car.rpm).toBeLessThanOrEqual(LIMIT_RPM)
  })

  it('brakes from 300 km/h at three to six g on average, hardest at the top', () => {
    const fast = drive(still(), FULL, 60, (c) => kmh(c) >= 300).car
    const first = stepCar(fast, { throttle: 0, brake: 1, steer: 0 }, DT)
    expect((fast.u - first.u) / DT / G0).toBeGreaterThan(5)
    const { car, t } = drive(fast, { throttle: 0, brake: 1, steer: 0 }, 10, (c) => kmh(c) <= 100)
    const decel = (fast.u - car.u) / t / G0
    expect(decel).toBeGreaterThan(3)
    expect(decel).toBeLessThan(6)
    expect(car.gear).toBeLessThan(fast.gear)
  })

  it('grips harder with speed, and less on the run-off', () => {
    expect(gripAt(0) / G0).toBeCloseTo(2.2, 1)
    expect(gripAt(70) / G0).toBeGreaterThan(4)
    expect(gripAt(70, true)).toBeLessThan(gripAt(70))
    expect(gripAt(30, false, 0.85)).toBeLessThan(gripAt(30))
    expect(steerLimit(80)).toBeLessThan(steerLimit(10))
  })

  it('holds full lock at speed without spinning', () => {
    const fast = drive(still(), FULL, 20, (c) => kmh(c) >= 180).car
    let car = { ...fast }
    let worst = 0
    for (let t = 0; t < 3; t += DT) {
      car = stepCar(car, { throttle: 0.3, brake: 0, steer: 1 }, DT)
      worst = Math.max(worst, Math.abs(Math.atan2(car.v, car.u)))
    }
    expect(car.heading - fast.heading).toBeGreaterThan(0.5)
    expect(worst).toBeLessThan(0.15)
    expect(car.u).toBeGreaterThan(20)
  })

  it('turns left for a positive steer at walking pace too', () => {
    const { car } = drive(drive(still(), FULL, 1).car, { throttle: 0.2, brake: 0, steer: 1 }, 1)
    expect(car.heading).toBeGreaterThan(0.1)
    expect(car.y).toBeGreaterThan(0)
  })

  it('selects reverse after holding the brake at a standstill', () => {
    const brake = { throttle: 0, brake: 1, steer: 0 }
    expect(stepCar(still(), brake, 0.1).gear).toBe(1)
    const { car } = drive(still(), brake, 3)
    expect(car.gear).toBe(0)
    expect(car.u).toBeLessThan(-2)
    expect(car.u).toBeGreaterThan(-9)
    expect(car.x).toBeLessThan(-1)
    expect(drive(car, FULL, 2).car.gear).toBeGreaterThanOrEqual(1)
  })

  it('takes manual shifts and stays in the chosen gear', () => {
    let car = drive(still(), FULL, 1.5).car
    car = stepCar(car, { ...FULL, shift: -1 }, DT)
    expect(car.manual).toBe(true)
    const held = car.gear
    car = drive(car, FULL, 4).car
    expect(car.gear).toBe(held)
    expect(car.rpm).toBeLessThanOrEqual(LIMIT_RPM)
    car = stepCar(car, { ...FULL, shift: 1 }, DT)
    expect(car.gear).toBe(held + 1)
  })

  it('reports tyre slide when the brakes lock up a corner', () => {
    const fast = drive(still(), FULL, 20, (c) => kmh(c) >= 200).car
    const calm = stepCar(fast, { throttle: 1, brake: 0, steer: 0 }, DT)
    expect(calm.slide).toBe(0)
    let car = fast
    let most = 0
    for (let t = 0; t < 1; t += DT) {
      car = stepCar(car, { throttle: 0, brake: 1, steer: 1 }, DT)
      most = Math.max(most, car.slide)
    }
    expect(most).toBeGreaterThan(0.2)
  })
})

const graph = loadGraph(JSON.parse(readFileSync(new URL('../../public/data/graph.json', import.meta.url), 'utf8')))
const current = JSON.parse(readFileSync(new URL('../../public/data/current.json', import.meta.url), 'utf8'))

// Speeds a cautious driver would carry round the centreline: most of the
// car's grip in the corners, then a backward pass that only brakes with the
// grip the corner leaves over.
const PILOT_GRIP = 0.75
const PILOT_BRAKE = 20
const speedPlan = (course) => {
  const { n, x, y, spacing } = course
  const reach = 5
  const curvature = x.map((_, i) => {
    const a = (i - reach + n) % n
    const b = (i + reach) % n
    const ab = Math.hypot(x[b] - x[a], y[b] - y[a])
    const turn = Math.abs(Math.atan2(y[b] - y[i], x[b] - x[i]) - Math.atan2(y[i] - y[a], x[i] - x[a]))
    return Math.min(turn, 2 * Math.PI - turn) / Math.max(1, ab)
  })
  const fits = (v, k) => v * v * k <= PILOT_GRIP * gripAt(v)
  const plan = curvature.map((k) => {
    let lo = 3
    let hi = 95
    if (fits(hi, k)) return hi
    for (let it = 0; it < 30; it += 1) {
      const mid = (lo + hi) / 2
      if (fits(mid, k)) lo = mid
      else hi = mid
    }
    return lo
  })
  for (let pass = 0; pass < 2; pass += 1) {
    for (let i = 2 * n - 1; i >= 0; i -= 1) {
      const a = i % n
      const b = (i + 1) % n
      const v = plan[b]
      const lat = v * v * curvature[a]
      const room = Math.sqrt(Math.max(0, (PILOT_GRIP * gripAt(v)) ** 2 - lat * lat))
      plan[a] = Math.min(plan[a], Math.sqrt(v * v + 2 * Math.max(3, Math.min(PILOT_BRAKE, room)) * spacing))
    }
  }
  return plan
}

// Pure pursuit on the centreline at the planned speed.
const pilot = (course, plan, car, where) => {
  const ahead = Math.max(10, car.u * 0.45)
  const j = (where.index + Math.round(ahead / course.spacing)) % course.n
  const dx = course.x[j] - car.x
  const dy = course.y[j] - car.y
  const ch = Math.cos(car.heading)
  const sh = Math.sin(car.heading)
  const lx = dx * ch + dy * sh
  const ly = -dx * sh + dy * ch
  const want = Math.atan2(2 * WHEELBASE_M * ly, lx * lx + ly * ly)
  const steer = Math.max(-1, Math.min(1, want / steerLimit(car.u)))
  const target = plan[(where.index + 2) % course.n]
  const lift = Math.max(0, Math.min(1, 2 * (1 - Math.abs(steer))))
  return { throttle: car.u < target - 0.5 ? lift : 0, brake: car.u > target + 0.5 ? 1 : 0, steer }
}

describe('car on the current layout', () => {
  const result = analyze(current.path, null, graph)
  const course = buildCourse(result, graph)
  const walls = buildWalls(course)
  const plan = speedPlan(course)

  it('drives a clean lap near the sim time without leaning on the walls', () => {
    let car = carAt(course.spawn)
    let where = locate(course, car.x, car.y, course.spawn.index)
    let lap = startLap()
    let done = null
    let impacts = 0
    for (let t = 0; t < 400 && !done; t += DT) {
      car = stepCar(car, pilot(course, plan, car, where), DT, where.onRoad)
      where = locate(course, car.x, car.y, where.index)
      const hit = hitWalls(car, course, walls, where)
      if (hit.impact > 1) impacts += 1
      car = hit.car
      lap = stepLap(lap, where, DT, course)
      if (lap.completed) done = lap.completed
    }
    expect(done).not.toBeNull()
    expect(done.clean).toBe(true)
    expect(done.time).toBeGreaterThan(result.metrics.lap_s * 0.85)
    expect(done.time).toBeLessThan(result.metrics.lap_s * 1.5)
    expect(impacts).toBeLessThan(5)
  })
})
