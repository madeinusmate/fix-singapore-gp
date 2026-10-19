import { BoxGeometry, Matrix4, Quaternion, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { WALL_THICK_M } from './meshes.js'

export const FLOOD_EVERY = 28
export const POLE_HEIGHT_M = 12
const OUTSET_M = 1.4
const FACE = new Vector3(0, 0, 1)

const pose = () => ({
  p: new Vector3(),
  q: new Quaternion(),
  s: new Vector3(1, 1, 1),
  inward: new Vector3(),
  along: new Vector3(),
  up: new Vector3(0, 1, 0),
})

// Poles outside the fence, heads turned in toward the asphalt.
export const floodlightMatrices = (course, walls) => {
  const poles = []
  const heads = []
  const { p, q, s, inward } = pose()
  const identity = new Quaternion()
  for (let i = 0; i < course.n; i += FLOOD_EVERY) {
    ;[[1, walls.left[i], walls.openLeft[i]], [-1, walls.right[i], walls.openRight[i]]].forEach(([side, w, open]) => {
      if (open) return
      inward.set(-side * course.nx[i], 0, side * course.ny[i])
      if (inward.lengthSq() < 1e-8) return
      const o = side * (w + WALL_THICK_M + OUTSET_M)
      const x = course.x[i] + course.nx[i] * o
      const y = course.y[i] + course.ny[i] * o
      const base = course.h[i]
      poles.push(new Matrix4().compose(p.set(x, base + POLE_HEIGHT_M / 2, -y), identity, s))
      q.setFromUnitVectors(FACE, inward.normalize())
      heads.push(new Matrix4().compose(p.set(x, base + POLE_HEIGHT_M, -y), q, s))
    })
  }
  return { poles, heads }
}

export const STAND_EVERY = 16
export const STAND_REACH = 90
const STAND_OUT_M = 6.5

// Temporary stands along the left of the grid straight, facing the road.
export const grandstandMatrices = (course, walls) => {
  const out = []
  const { p, along, up, inward } = pose()
  const n = course.n
  for (let k = STAND_EVERY; k <= STAND_REACH; k += STAND_EVERY) {
    const i = (n - k + n) % n
    if (walls.openLeft[i]) continue
    const o = walls.left[i] + WALL_THICK_M + STAND_OUT_M
    const x = course.x[i] + course.nx[i] * o
    const y = course.y[i] + course.ny[i] * o
    along.set(course.ny[i], 0, course.nx[i])
    inward.set(-course.nx[i], 0, course.ny[i])
    if (along.lengthSq() < 1e-8 || inward.lengthSq() < 1e-8) continue
    along.normalize()
    inward.normalize()
    const m = new Matrix4().makeBasis(along, up, inward)
    m.setPosition(p.set(x, course.h[i], -y))
    out.push(m)
  }
  return out
}

const shifted = (w, h, d, x, y, z) => {
  const geometry = new BoxGeometry(w, h, d)
  geometry.translate(x, y, z)
  return geometry
}

// Seats face +Z, which the instance matrix turns toward the asphalt.
export const grandstandGeometry = () => ({
  seats: mergeGeometries([
    shifted(14, 0.7, 2.2, 0, 0.7, 2.2),
    shifted(14, 0.7, 2.2, 0, 1.6, 0),
    shifted(14, 0.7, 2.2, 0, 2.5, -2.2),
  ]),
  frame: mergeGeometries([
    shifted(14.4, 0.25, 8, 0, 0.2, 0),
    shifted(0.3, 4.6, 0.3, -6.6, 2.3, -3.4),
    shifted(0.3, 4.6, 0.3, 6.6, 2.3, -3.4),
    shifted(15, 0.2, 8.4, 0, 4.8, -0.4),
  ]),
})

const GANTRY_H_M = 9
const GANTRY_OUT_M = 1.6

// A truss over the start line: two towers, a beam, and a board facing the grid.
export const gantryFrame = (course, walls) => {
  const i = 0
  const h = course.h[i]
  const left = walls.left[i] + WALL_THICK_M + GANTRY_OUT_M
  const right = walls.right[i] + WALL_THICK_M + GANTRY_OUT_M
  const at = (offset) => new Vector3(
    course.x[i] + course.nx[i] * offset,
    h,
    -(course.y[i] + course.ny[i] * offset),
  )
  const a = at(left)
  const b = at(-right)
  const along = new Vector3(course.ny[i], 0, course.nx[i])
  if (along.lengthSq() > 1e-8) along.normalize()
  else along.set(1, 0, 0)
  const span = new Vector3().subVectors(b, a)
  const length = span.length() || 1
  const xAxis = span.clone().multiplyScalar(1 / length)
  const yAxis = new Vector3(0, 1, 0)
  const zAxis = new Vector3().crossVectors(xAxis, yAxis).normalize()
  const mid = a.clone().add(b).multiplyScalar(0.5)
  mid.y = h + GANTRY_H_M
  const beam = new Matrix4().makeBasis(xAxis, yAxis, zAxis)
  beam.setPosition(mid)
  const face = along.clone().negate()
  const boardX = new Vector3().crossVectors(yAxis, face).normalize()
  const board = new Matrix4().makeBasis(boardX, yAxis, face)
  board.setPosition(mid.x, h + GANTRY_H_M - 1.5, mid.z)
  return {
    height: GANTRY_H_M,
    length,
    left: [a.x, h + GANTRY_H_M / 2, a.z],
    right: [b.x, h + GANTRY_H_M / 2, b.z],
    beam,
    board,
  }
}
