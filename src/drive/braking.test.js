import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { analyze } from '../sim/analyze.js'
import { loadGraph } from '../sim/route.js'
import { DISTANCE_M, brakingPoints, brakingSign, markerSide } from './braking.js'
import { buildCourse } from './course.js'
import { brakingMarkGeometry } from './meshes.js'

const graph = loadGraph(JSON.parse(readFileSync(new URL('../../public/data/graph.json', import.meta.url), 'utf8')))
const current = JSON.parse(readFileSync(new URL('../../public/data/current.json', import.meta.url), 'utf8'))

const ahead = (from, to, n, seg) => {
  let d = 0
  for (let i = from; i !== to; i = (i + 1) % n) {
    d += seg[i]
    if (d > 1e7) break
  }
  return d
}

// A closed lap of 2 m samples with three corners. The straight into turn 2 is
// only 62 m, so it cannot take a 100 m board. The other two straights can.
const drawnLap = () => {
  const n = 400
  const seg = new Array(n).fill(2)
  const k = new Array(n).fill(0)
  const bend = Math.PI / 60
  ;[[10, 24], [55, 69], [250, 264]].forEach(([a, b]) => {
    for (let i = a; i <= b; i += 1) k[i] = bend
  })
  const brk = new Array(n).fill(false)
  ;[[40, 54], [90, 249], [300, 399], [0, 9]].forEach(([a, b]) => {
    for (let i = a; i <= b; i += 1) brk[i] = true
  })
  return { prep: { k, seg }, brk }
}

describe('braking points', () => {
  const { features } = analyze(current.path, null, graph)
  const points = brakingPoints(features.prep, features.def.brk)
  const n = features.prep.k.length

  it('counts down 200, 150, 100 and 50 m on each straight that is long enough', () => {
    const byTurn = new Map()
    points.forEach((point) => {
      const list = byTurn.get(point.turn) || []
      list.push(point)
      byTurn.set(point.turn, list)
    })
    expect(byTurn.size).toBeGreaterThan(8)
    byTurn.forEach((list) => {
      const got = list.map((point) => point.metres)
      const from = DISTANCE_M.indexOf(got[0])
      expect(got).toEqual(DISTANCE_M.slice(from, from + got.length))
      list.forEach((point) => {
        const distance = ahead(point.index, point.entry, n, features.prep.seg)
        expect(Math.abs(distance - point.metres)).toBeLessThan(3)
      })
    })
  })

  it('drops the boards a short straight cannot hold, on a lap that is not the current one', () => {
    const { prep, brk } = drawnLap()
    const markers = brakingPoints(prep, brk)
    const byTurn = new Map()
    markers.forEach((point) => {
      const list = byTurn.get(point.turn) || []
      list.push(point.metres)
      byTurn.set(point.turn, list)
    })
    const sets = [...byTurn.values()]
    expect(sets).toContainEqual([50])
    expect(sets.filter((metres) => metres.length === DISTANCE_M.length).length).toBeGreaterThan(0)
    markers.forEach((point) => {
      const distance = ahead(point.index, point.entry, prep.k.length, prep.seg)
      expect(Math.abs(distance - point.metres)).toBeLessThan(2)
    })
  })

  it('stands the board past the kerb on the open side, facing back at the car', () => {
    const course = buildCourse({ features }, graph)
    const i = points[0].index
    const sign = brakingSign(course, i)
    const offset = (sign.board.x - course.x[i]) * course.nx[i] + (sign.board.y - course.y[i]) * course.ny[i]
    expect(offset).toBeGreaterThan(course.left[i])
    expect(offset).toBeLessThan(course.left[i] + 2)
    const right = brakingSign(course, i, markerSide(true, false))
    const rightOffset = (right.board.x - course.x[i]) * course.nx[i] + (right.board.y - course.y[i]) * course.ny[i]
    expect(rightOffset).toBeLessThan(-course.right[i])
    expect(rightOffset).toBeGreaterThan(-course.right[i] - 2)
    const normalX = Math.sin(sign.yaw)
    const normalZ = Math.cos(sign.yaw)
    expect(normalX * course.ny[i] + normalZ * course.nx[i]).toBeCloseTo(-1)
    expect(sign.board.h).toBeGreaterThan(course.h[i])
  })

  it('paints the mark on the asphalt beside the board', () => {
    const course = buildCourse({ features }, graph)
    const i = points[0].index
    const geometry = brakingMarkGeometry(course, [points[0]])
    const pos = geometry.attributes.position.array
    for (let k = 0; k < pos.length; k += 3) {
      const offset = (pos[k] - course.x[i]) * course.nx[i] + (-pos[k + 2] - course.y[i]) * course.ny[i]
      expect(offset).toBeGreaterThan(0.5)
      expect(offset).toBeLessThan(course.left[i])
      expect(pos[k + 1]).toBeCloseTo(course.h[i], 1)
    }
    geometry.dispose()
  })
})
