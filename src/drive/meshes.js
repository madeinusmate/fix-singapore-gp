import { BufferAttribute, BufferGeometry, Color } from 'three'
import { kerbsAt } from './course.js'

const KERB_M = 0.9
// Kerb colour changes every this many lap samples (2 m each).
const KERB_BLOCK = 3
const RED = new Color('#e10600')
const WHITE = new Color('#f2f2f2')
const LIFT = 0.02

// Plane (x, y) and height h become three.js (x, h, -y): north is -z.
const vertex = (x, y, h) => [x, h, -y]

const geometryOf = (positions, colors = null) => {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  if (colors) geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3))
  geometry.computeVertexNormals()
  return geometry
}

const quad = (a, b, c, d) => [...a, ...b, ...c, ...b, ...d, ...c]

export const roadGeometry = (course) => {
  const positions = []
  for (let i = 0; i < course.n; i += 1) {
    const j = (i + 1) % course.n
    const [alx, aly, arx, ary] = kerbsAt(course, i)
    const [blx, bly, brx, bry] = kerbsAt(course, j)
    positions.push(...quad(
      vertex(alx, aly, course.h[i]),
      vertex(arx, ary, course.h[i]),
      vertex(blx, bly, course.h[j]),
      vertex(brx, bry, course.h[j]),
    ))
  }
  return geometryOf(positions)
}

export const kerbGeometry = (course) => {
  const positions = []
  const colors = []
  for (let i = 0; i < course.n; i += 1) {
    const j = (i + 1) % course.n
    const inner = [kerbsAt(course, i), kerbsAt(course, j)]
    const outer = [kerbsAt(course, i, KERB_M), kerbsAt(course, j, KERB_M)]
    const hi = course.h[i] + LIFT
    const hj = course.h[j] + LIFT
    const tone = Math.floor(i / KERB_BLOCK) % 2 ? RED : WHITE
    ;[0, 2].forEach((side) => {
      positions.push(...quad(
        vertex(inner[0][side], inner[0][side + 1], hi),
        vertex(outer[0][side], outer[0][side + 1], hi),
        vertex(inner[1][side], inner[1][side + 1], hj),
        vertex(outer[1][side], outer[1][side + 1], hj),
      ))
      for (let k = 0; k < 6; k += 1) colors.push(tone.r, tone.g, tone.b)
    })
  }
  return geometryOf(positions, colors)
}

// Side walls under raised road, from the outer kerb down to street level.
export const deckGeometry = (course) => {
  const positions = []
  for (let i = 0; i < course.n; i += 1) {
    const j = (i + 1) % course.n
    if (course.h[i] < 0.3 && course.h[j] < 0.3) continue
    const a = kerbsAt(course, i, KERB_M)
    const b = kerbsAt(course, j, KERB_M)
    ;[0, 2].forEach((side) => {
      positions.push(...quad(
        vertex(a[side], a[side + 1], course.h[i]),
        vertex(a[side], a[side + 1], 0),
        vertex(b[side], b[side + 1], course.h[j]),
        vertex(b[side], b[side + 1], 0),
      ))
    })
  }
  return geometryOf(positions)
}

export const startLineGeometry = (course) => {
  const a = kerbsAt(course, 0)
  const b = kerbsAt(course, 1)
  const h = course.h[0] + LIFT * 2
  return geometryOf(quad(vertex(a[0], a[1], h), vertex(a[2], a[3], h), vertex(b[0], b[1], h), vertex(b[2], b[3], h)))
}
