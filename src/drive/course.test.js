import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { analyze } from '../sim/analyze.js'
import { toMetres } from '../sim/project.js'
import { loadGraph } from '../sim/route.js'
import { buildCourse, CHECKPOINT_EVERY, locate } from './course.js'

const graph = loadGraph(JSON.parse(readFileSync(new URL('../../public/data/graph.json', import.meta.url), 'utf8')))
const current = JSON.parse(readFileSync(new URL('../../public/data/current.json', import.meta.url), 'utf8'))

// A figure eight crossing itself at the origin, at samples 0 and n/2.
const eight = (n = 1000, half = 7) => {
  const x = []
  const y = []
  for (let i = 0; i < n; i += 1) {
    const t = (i / n) * 2 * Math.PI
    x.push(300 * Math.sin(t))
    y.push(150 * Math.sin(2 * t))
  }
  const edges = { lx: [], ly: [], rx: [], ry: [] }
  let length = 0
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n
    const k = (i - 1 + n) % n
    const tx = x[j] - x[k]
    const ty = y[j] - y[k]
    const tl = Math.hypot(tx, ty)
    edges.lx.push(x[i] - (ty / tl) * half)
    edges.ly.push(y[i] + (tx / tl) * half)
    edges.rx.push(x[i] + (ty / tl) * half)
    edges.ry.push(y[i] - (tx / tl) * half)
    length += Math.hypot(x[j] - x[i], y[j] - y[i])
  }
  return { features: { prep: { x, y, edges, length }, centerline: [] } }
}

describe('course', () => {
  it('stays on the branch it was on where the lap crosses itself', () => {
    const course = buildCourse(eight())
    expect(locate(course, course.x[0], course.y[0], 3).index).toBeLessThan(10)
    expect(Math.abs(locate(course, course.x[0], course.y[0], 497).index - 500)).toBeLessThan(10)
  })

  it('signs the sideways offset positive to the left of the direction of travel', () => {
    const course = buildCourse(eight())
    const i = 250
    const at = (offset) => locate(course, course.x[i] + course.nx[i] * offset, course.y[i] + course.ny[i] * offset, i)
    expect(at(3).offset).toBeCloseTo(3, 1)
    expect(at(-3).offset).toBeCloseTo(-3, 1)
    expect(at(3).onRoad).toBe(true)
    expect(at(7.5)).toMatchObject({ onRoad: false, fullyOff: false })
    expect(at(-8.5).fullyOff).toBe(true)
  })

  it('finds the car again after it wanders far from where it was', () => {
    const course = buildCourse(eight())
    expect(Math.abs(locate(course, course.x[700], course.y[700], 100).index - 700)).toBeLessThan(5)
  })

  it('places checkpoints along the lap and spawns behind the line, facing it', () => {
    const course = buildCourse(eight())
    expect(course.checkpoints[0]).toBe(CHECKPOINT_EVERY)
    expect(course.checkpoints.at(-1)).toBeLessThan(course.n)
    const { spawn } = course
    const ahead = (spawn.index + 5) % course.n
    const toward = Math.atan2(course.y[ahead] - spawn.y, course.x[ahead] - spawn.x)
    expect(Math.abs(Math.atan2(Math.sin(toward - spawn.heading), Math.cos(toward - spawn.heading)))).toBeLessThan(0.1)
  })

  it('keeps the current layout on real road with gentle ramps', () => {
    const course = buildCourse(analyze(current.path, null, graph), graph)
    expect(course.n).toBeGreaterThan(2000)
    expect(Math.min(...course.left, ...course.right)).toBeGreaterThanOrEqual(4)
    const steepest = course.h.reduce((max, h, i) => Math.max(max, Math.abs(course.h[(i + 1) % course.n] - h) / course.spacing), 0)
    expect(steepest).toBeLessThan(0.1)
    expect(Math.min(...course.h)).toBeGreaterThanOrEqual(-0.01)
    const [west] = toMetres(103.838, 1.29)
    const [east] = toMetres(103.878, 1.29)
    const [, south] = toMetres(103.85, 1.272)
    const [, north] = toMetres(103.85, 1.304)
    expect(course.origin[0]).toBeGreaterThan(west)
    expect(course.origin[0]).toBeLessThan(east)
    expect(course.origin[1]).toBeGreaterThan(south)
    expect(course.origin[1]).toBeLessThan(north)
  })
})
