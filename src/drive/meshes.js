import { BufferAttribute, BufferGeometry, Color, Matrix4, Quaternion, Vector3 } from 'three'
import { kerbsAt } from './course.js'
import { KERB_M } from './walls.js'

// Kerb colour changes every this many lap samples (2 m each).
const KERB_BLOCK = 3
const RED = new Color('#e10600')
const WHITE = new Color('#f2f2f2')
const LIFT = 0.02
// Texture repeat lengths in metres.
export const ROAD_TILE_M = 3
const CONCRETE_U_M = 2.4
const CONCRETE_V_M = 1.2
const FENCE_TILE_M = 1.2
export const WALL_HEIGHT_M = 1
export const WALL_THICK_M = 0.6
export const FENCE_HEIGHT_M = 3
export const POST_EVERY = 6
const LINE_IN_M = 0.3
const LINE_WIDTH_M = 0.14

// Plane (x, y) and height h become three.js (x, h, -y): north is -z.
const vertex = (x, y, h) => [x, h, -y]

const geometryOf = ({ positions, uvs = null, colors = null, up = false }) => {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  if (uvs) geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2))
  if (colors) geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3))
  if (up) {
    const normals = new Float32Array(positions.length)
    for (let i = 1; i < normals.length; i += 3) normals[i] = 1
    geometry.setAttribute('normal', new BufferAttribute(normals, 3))
  } else {
    geometry.computeVertexNormals()
  }
  geometry.computeBoundingSphere()
  return geometry
}

const quad = (a, b, c, d) => [...a, ...b, ...c, ...b, ...d, ...c]
const quadUv = (a, b, c, d) => [...a, ...b, ...c, ...b, ...d, ...c]

const along = (course, i) => i * course.spacing

// A strip between two offsets from the centreline, following the lap. inner
// and outer are signed offsets (left positive) for sample i.
const strip = (course, inner, outer, { lift = 0, keep = () => true, uv = null, color = null } = {}) => {
  const positions = []
  const uvs = []
  const colors = []
  const point = (i, offset) => [course.x[i] + course.nx[i] * offset, course.y[i] + course.ny[i] * offset]
  for (let i = 0; i < course.n; i += 1) {
    const j = (i + 1) % course.n
    if (!keep(i, j)) continue
    const hi = course.h[i] + lift
    const hj = course.h[j] + lift
    const [aix, aiy] = point(i, inner(i))
    const [bix, biy] = point(i, outer(i))
    const [ajx, ajy] = point(j, inner(j))
    const [bjx, bjy] = point(j, outer(j))
    positions.push(...quad(vertex(aix, aiy, hi), vertex(bix, biy, hi), vertex(ajx, ajy, hj), vertex(bjx, bjy, hj)))
    if (uv) {
      const si = along(course, i)
      const sj = si + course.spacing
      uvs.push(...quadUv(uv(inner(i), si), uv(outer(i), si), uv(inner(j), sj), uv(outer(j), sj)))
    }
    if (color) {
      const tone = color(i)
      for (let k = 0; k < 6; k += 1) colors.push(tone.r, tone.g, tone.b)
    }
  }
  return { positions, uvs: uv ? uvs : null, colors: color ? colors : null, up: true }
}

const merge = (...parts) => ({
  positions: parts.flatMap((part) => part.positions),
  uvs: parts.every((part) => part.uvs) ? parts.flatMap((part) => part.uvs) : null,
  colors: parts.every((part) => part.colors) ? parts.flatMap((part) => part.colors) : null,
  up: parts.every((part) => part.up),
})

const tiled = (offset, s) => [offset / ROAD_TILE_M, s / ROAD_TILE_M]

export const roadGeometry = (course) => geometryOf(strip(course, (i) => course.left[i], (i) => -course.right[i], { uv: tiled }))

export const kerbGeometry = (course) => {
  const tone = (i) => (Math.floor(i / KERB_BLOCK) % 2 ? RED : WHITE)
  return geometryOf(merge(
    strip(course, (i) => course.left[i], (i) => course.left[i] + KERB_M, { lift: LIFT, color: tone }),
    strip(course, (i) => -course.right[i], (i) => -(course.right[i] + KERB_M), { lift: LIFT, color: tone }),
  ))
}

// White lines painted just inside each kerb.
export const lineGeometry = (course) => geometryOf(merge(
  strip(course, (i) => course.left[i] - LINE_IN_M, (i) => course.left[i] - LINE_IN_M - LINE_WIDTH_M, { lift: LIFT / 2 }),
  strip(course, (i) => -(course.right[i] - LINE_IN_M), (i) => -(course.right[i] - LINE_IN_M - LINE_WIDTH_M), { lift: LIFT / 2 }),
))

// Asphalt run-off from the outer kerb edge to the foot of the wall.
export const runOffGeometry = (course, walls) => geometryOf(merge(
  strip(course, (i) => course.left[i] + KERB_M, (i) => walls.left[i], { uv: tiled }),
  strip(course, (i) => -(course.right[i] + KERB_M), (i) => -walls.right[i], { uv: tiled }),
))

const wallSide = (course, walls, side) => {
  const positions = []
  const uvs = []
  const offsetOf = side > 0 ? (i) => walls.left[i] : (i) => -walls.right[i]
  const open = side > 0 ? walls.openLeft : walls.openRight
  const at = (i, offset, h) => vertex(course.x[i] + course.nx[i] * offset, course.y[i] + course.ny[i] * offset, h)
  for (let i = 0; i < course.n; i += 1) {
    const j = (i + 1) % course.n
    if (open[i] || open[j]) continue
    const si = along(course, i)
    const sj = si + course.spacing
    const wi = offsetOf(i)
    const wj = offsetOf(j)
    const oi = wi + side * WALL_THICK_M
    const oj = wj + side * WALL_THICK_M
    const hi = course.h[i]
    const hj = course.h[j]
    const ti = hi + WALL_HEIGHT_M
    const tj = hj + WALL_HEIGHT_M
    // Inner face, top, then the outer face down to street level.
    positions.push(...quad(at(i, wi, hi), at(i, wi, ti), at(j, wj, hj), at(j, wj, tj)))
    uvs.push(...quadUv([si / CONCRETE_U_M, 0], [si / CONCRETE_U_M, WALL_HEIGHT_M / CONCRETE_V_M], [sj / CONCRETE_U_M, 0], [sj / CONCRETE_U_M, WALL_HEIGHT_M / CONCRETE_V_M]))
    positions.push(...quad(at(i, wi, ti), at(i, oi, ti), at(j, wj, tj), at(j, oj, tj)))
    uvs.push(...quadUv([si / CONCRETE_U_M, 0], [si / CONCRETE_U_M, WALL_THICK_M / CONCRETE_V_M], [sj / CONCRETE_U_M, 0], [sj / CONCRETE_U_M, WALL_THICK_M / CONCRETE_V_M]))
    positions.push(...quad(at(i, oi, ti), at(i, oi, 0), at(j, oj, tj), at(j, oj, 0)))
    uvs.push(...quadUv([si / CONCRETE_U_M, 0], [si / CONCRETE_U_M, ti / CONCRETE_V_M], [sj / CONCRETE_U_M, 0], [sj / CONCRETE_U_M, tj / CONCRETE_V_M]))
  }
  return { positions, uvs }
}

// Concrete barriers along both sides, with gaps where the lap crosses itself.
// On raised road their outer face runs down to the street and doubles as the deck side.
export const wallGeometry = (course, walls) => geometryOf(merge(wallSide(course, walls, 1), wallSide(course, walls, -1)))

const fenceSide = (course, walls, side) => {
  const positions = []
  const uvs = []
  const offsetOf = side > 0 ? (i) => walls.left[i] + WALL_THICK_M / 2 : (i) => -(walls.right[i] + WALL_THICK_M / 2)
  const open = side > 0 ? walls.openLeft : walls.openRight
  const at = (i, h) => vertex(course.x[i] + course.nx[i] * offsetOf(i), course.y[i] + course.ny[i] * offsetOf(i), h)
  for (let i = 0; i < course.n; i += 1) {
    const j = (i + 1) % course.n
    if (open[i] || open[j]) continue
    const si = along(course, i) / FENCE_TILE_M
    const sj = si + course.spacing / FENCE_TILE_M
    const bi = course.h[i] + WALL_HEIGHT_M
    const bj = course.h[j] + WALL_HEIGHT_M
    positions.push(...quad(at(i, bi), at(i, bi + FENCE_HEIGHT_M), at(j, bj), at(j, bj + FENCE_HEIGHT_M)))
    uvs.push(...quadUv([si, 0], [si, FENCE_HEIGHT_M / FENCE_TILE_M], [sj, 0], [sj, FENCE_HEIGHT_M / FENCE_TILE_M]))
  }
  return { positions, uvs }
}

// Chain-link catch fence standing on the walls.
export const fenceGeometry = (course, walls) => geometryOf(merge(fenceSide(course, walls, 1), fenceSide(course, walls, -1)))

// Instance matrices for the fence posts, one every POST_EVERY samples.
export const postMatrices = (course, walls) => {
  const out = []
  const q = new Quaternion()
  const s = new Vector3(1, 1, 1)
  for (let i = 0; i < course.n; i += POST_EVERY) {
    ;[[1, walls.left[i], walls.openLeft[i]], [-1, walls.right[i], walls.openRight[i]]].forEach(([side, w, open]) => {
      if (open) return
      const o = side * (w + WALL_THICK_M / 2)
      const p = vertex(course.x[i] + course.nx[i] * o, course.y[i] + course.ny[i] * o, course.h[i] + WALL_HEIGHT_M + FENCE_HEIGHT_M / 2)
      out.push(new Matrix4().compose(new Vector3(...p), q, s))
    })
  }
  return out
}

// The start line and twenty grid boxes behind it, two abreast.
export const GRID_SLOTS = 20
const GRID_PITCH_M = 8
const GRID_FIRST_M = 6
const SLOT_WIDTH_M = 2.4
const SLOT_DEPTH_M = 1.2
const PAINT_M = 0.2

export const gridGeometry = (course) => {
  const positions = []
  const { n, spacing } = course
  const h0 = course.h[0] + LIFT * 2
  const [alx, aly, arx, ary] = kerbsAt(course, 0)
  const tx = course.ny[0]
  const ty = -course.nx[0]
  const lineM = 0.6
  positions.push(...quad(
    vertex(alx, aly, h0),
    vertex(arx, ary, h0),
    vertex(alx + tx * lineM, aly + ty * lineM, h0),
    vertex(arx + tx * lineM, ary + ty * lineM, h0),
  ))
  const rect = (cx, cy, ux, uy, vx, vy, du, dv, h) => {
    const p = (a, b) => vertex(cx + ux * a + vx * b, cy + uy * a + vy * b, h)
    positions.push(...quad(p(-du / 2, -dv / 2), p(du / 2, -dv / 2), p(-du / 2, dv / 2), p(du / 2, dv / 2)))
  }
  for (let k = 0; k < GRID_SLOTS; k += 1) {
    const back = GRID_FIRST_M + k * (GRID_PITCH_M / 2)
    const i = (n - Math.round(back / spacing) + n) % n
    const nx = course.nx[i]
    const ny = course.ny[i]
    const ux = ny
    const uy = -nx
    const side = k % 2 ? -1 : 1
    const width = side > 0 ? course.left[i] : course.right[i]
    const offset = side * Math.min(width / 2, 3)
    const cx = course.x[i] + nx * offset
    const cy = course.y[i] + ny * offset
    const h = course.h[i] + LIFT * 2
    rect(cx, cy, nx, ny, ux, uy, SLOT_WIDTH_M, PAINT_M, h)
    ;[-1, 1].forEach((end) => {
      rect(cx + nx * end * (SLOT_WIDTH_M / 2 - PAINT_M / 2) - ux * SLOT_DEPTH_M / 2, cy + ny * end * (SLOT_WIDTH_M / 2 - PAINT_M / 2) - uy * SLOT_DEPTH_M / 2, nx, ny, ux, uy, PAINT_M, SLOT_DEPTH_M, h)
    })
  }
  return geometryOf({ positions, up: true })
}

// A short bar on the left of the asphalt at each braking point, white then red,
// so the board beside the kerb has a mark on the road itself.
const MARK_IN_M = 2.6
const MARK_EDGE_M = 0.4
export const brakingMarkGeometry = (course, points) => {
  const positions = []
  const colors = []
  const paint = (corners, color) => {
    positions.push(...quad(...corners))
    for (let k = 0; k < 6; k += 1) colors.push(color.r, color.g, color.b)
  }
  points.forEach(({ index: i, side = 1 }) => {
    const tx = course.ny[i]
    const ty = -course.nx[i]
    const h = course.h[i] + LIFT
    const at = (along, across) => vertex(
      course.x[i] + tx * along + course.nx[i] * across,
      course.y[i] + ty * along + course.ny[i] * across,
      h,
    )
    const edge = side > 0 ? course.left[i] : course.right[i]
    const inner = side * (edge - MARK_IN_M)
    const outer = side * (edge - MARK_EDGE_M)
    paint([at(-0.34, inner), at(-0.34, outer), at(-0.08, inner), at(-0.08, outer)], WHITE)
    paint([at(-0.08, inner), at(-0.08, outer), at(0.28, inner), at(0.28, outer)], RED)
  })
  return geometryOf({ positions, colors, up: true })
}
