import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { buildCourse } from './course.js'
import { parapetGeometry, runOffGeometry, skirtGeometry, WALL_THICK_M } from './meshes.js'
import {
  FLOOD_EVERY,
  POLE_HEIGHT_M,
  floodlightMatrices,
  gantryFrame,
  grandstandMatrices,
} from './scenery.js'
import { buildWalls } from './walls.js'

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

const ring = () => loop(840, (t) => [400 * Math.cos(t), 400 * Math.sin(t)])

const lateral = (course, i, x, y) => (x - course.x[i]) * course.nx[i] + (y - course.y[i]) * course.ny[i]

describe('track dressing', () => {
  it('stands floodlights outside the wall with the lamp at the top of the pole', () => {
    const course = ring()
    const walls = buildWalls(course)
    const { poles, heads } = floodlightMatrices(course, walls)
    expect(poles.length).toBe(heads.length)
    expect(poles.length).toBeGreaterThan(10)
    const p = new Vector3()
    const h = new Vector3()
    poles.forEach((matrix, k) => {
      p.setFromMatrixPosition(matrix)
      h.setFromMatrixPosition(heads[k])
      const i = Math.floor(k / 2) * FLOOD_EVERY
      const side = k % 2 === 0 ? 1 : -1
      const across = lateral(course, i, p.x, -p.z)
      const wall = side > 0 ? walls.left[i] : walls.right[i]
      expect(side * across).toBeGreaterThan(wall + WALL_THICK_M)
      expect(h.y - p.y).toBeCloseTo(POLE_HEIGHT_M / 2)
    })
  })

  it('sets grandstands and the gantry outside the racing line', () => {
    const course = ring()
    const walls = buildWalls(course)
    const stands = grandstandMatrices(course, walls)
    expect(stands.length).toBeGreaterThan(2)
    const p = new Vector3()
    stands.forEach((matrix) => {
      p.setFromMatrixPosition(matrix)
      let nearest = 0
      let best = Infinity
      for (let i = 0; i < course.n; i += 4) {
        const d = (p.x - course.x[i]) ** 2 + (-p.z - course.y[i]) ** 2
        if (d < best) {
          best = d
          nearest = i
        }
      }
      expect(lateral(course, nearest, p.x, -p.z)).toBeGreaterThan(walls.left[nearest])
    })
    const frame = gantryFrame(course, walls)
    expect(lateral(course, 0, frame.left[0], -frame.left[2])).toBeGreaterThan(walls.left[0] + WALL_THICK_M)
    expect(lateral(course, 0, frame.right[0], -frame.right[2])).toBeLessThan(-(walls.right[0] + WALL_THICK_M))
    expect(frame.left[1]).toBeGreaterThan(course.h[0])
  })

  it('paints braking run-off, a skirt, and rails only where the road is raised', () => {
    const course = ring()
    const walls = buildWalls(course)
    const plain = runOffGeometry(course, walls)
    const marked = runOffGeometry(course, walls, [{ index: 40 }])
    const tones = new Set()
    const colors = marked.getAttribute('color')
    for (let i = 0; i < colors.count; i += 30) tones.add(colors.getX(i).toFixed(2))
    expect(tones.size).toBeGreaterThan(1)
    plain.dispose()
    marked.dispose()
    const skirt = skirtGeometry(course, walls)
    expect(skirt.getAttribute('position').count).toBeGreaterThan(100)
    skirt.dispose()
    expect(parapetGeometry(course, walls)).toBeNull()
    for (let i = 20; i < 40; i += 1) course.h[i] = 6
    const rails = parapetGeometry(course, walls)
    expect(rails.getAttribute('position').count).toBeGreaterThan(0)
    rails.dispose()
  })
})
