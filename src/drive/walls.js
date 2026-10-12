import { CAR_HALF_M } from './course.js'

export const KERB_M = 0.9
export const RUN_OFF_M = 3.5
// Another stretch of the lap closer than this in height is the same level, so
// the wall opens to let it through. Bridges and underpasses keep their walls.
const SAME_LEVEL_M = 2
// Samples this close along the lap are the same stretch of road, not a crossing.
const SAME_STRETCH = 40
const GAP_PAD_M = 2
const GAP_GROW = 3
const CELL_M = 25
// A car further past the wall than this came in through a gap, so it is left alone.
const THROUGH_M = 4
const RESTITUTION = 0.3
const SCRUB = 0.35
const YAW_DAMP = 0.5
const ALIGN_MIN = 0.12
const ALIGN_MAX = 0.6
const ALIGN_SPEED = 40

const wrapGap = (i, j, n) => {
  const d = Math.abs(i - j) % n
  return Math.min(d, n - d)
}

const grow = (open, reach) => {
  const n = open.length
  return open.map((_, i) => {
    for (let o = -reach; o <= reach; o += 1) if (open[(i + o + n) % n]) return true
    return false
  })
}

// Concrete walls past the kerb and a strip of run-off on each side of the lap.
// left/right are offsets from the centreline; open marks samples where another
// part of the lap at the same level passes and the wall has to give way.
export const buildWalls = (course) => {
  const { n, x, y, nx, ny, h } = course
  const left = course.left.map((l) => l + KERB_M + RUN_OFF_M)
  const right = course.right.map((r) => r + KERB_M + RUN_OFF_M)
  const grid = new Map()
  const cellOf = (px, py) => [Math.floor(px / CELL_M), Math.floor(py / CELL_M)]
  for (let i = 0; i < n; i += 1) {
    const [cx, cy] = cellOf(x[i], y[i])
    const key = `${cx},${cy}`
    if (!grid.has(key)) grid.set(key, [])
    grid.get(key).push(i)
  }
  const widest = Math.max(...left, ...right) + GAP_PAD_M
  const reach = Math.ceil(widest / CELL_M)
  const crossed = (px, py, i) => {
    const [cx, cy] = cellOf(px, py)
    for (let dx = -reach; dx <= reach; dx += 1) {
      for (let dy = -reach; dy <= reach; dy += 1) {
        const near = grid.get(`${cx + dx},${cy + dy}`)
        if (!near) continue
        for (const j of near) {
          if (wrapGap(i, j, n) <= SAME_STRETCH || Math.abs(h[i] - h[j]) > SAME_LEVEL_M) continue
          if (Math.hypot(px - x[j], py - y[j]) < Math.max(left[j], right[j]) + GAP_PAD_M) return true
        }
      }
    }
    return false
  }
  const openLeft = new Array(n)
  const openRight = new Array(n)
  for (let i = 0; i < n; i += 1) {
    openLeft[i] = crossed(x[i] + nx[i] * left[i], y[i] + ny[i] * left[i], i)
    openRight[i] = crossed(x[i] - nx[i] * right[i], y[i] - ny[i] * right[i], i)
  }
  return { left, right, openLeft: grow(openLeft, GAP_GROW), openRight: grow(openRight, GAP_GROW) }
}

// Keeps the car inside the walls. Returns the corrected car and the speed it
// hit the wall at, in m/s, or zero when it did not touch one.
export const hitWalls = (car, course, walls, where) => {
  const i = where.index
  const o = where.offset
  let side = 0
  let depth = 0
  if (!walls.openLeft[i] && o + CAR_HALF_M > walls.left[i]) {
    side = 1
    depth = o + CAR_HALF_M - walls.left[i]
  } else if (!walls.openRight[i] && o - CAR_HALF_M < -walls.right[i]) {
    side = -1
    depth = -walls.right[i] - (o - CAR_HALF_M)
  }
  if (!side || depth > THROUGH_M) return { car, impact: 0 }
  const wx = -side * course.nx[i]
  const wy = -side * course.ny[i]
  const ch = Math.cos(car.heading)
  const sh = Math.sin(car.heading)
  let vx = car.u * ch - car.v * sh
  let vy = car.u * sh + car.v * ch
  const vn = vx * wx + vy * wy
  let impact = 0
  if (vn < 0) {
    impact = -vn
    const tx = vx - vn * wx
    const ty = vy - vn * wy
    const keep = Math.max(0, 1 - (SCRUB * impact) / Math.max(1, Math.hypot(tx, ty)))
    vx = tx * keep - RESTITUTION * vn * wx
    vy = ty * keep - RESTITUTION * vn * wy
  }
  // A nose pointed into the wall swings round toward the wall's line, so the
  // car glances off instead of pinning itself there under throttle.
  let heading = car.heading
  if (impact > 0 && ch * wx + sh * wy < 0) {
    const tx = -wy
    const ty = wx
    const along = ch * tx + sh * ty >= 0 ? Math.atan2(ty, tx) : Math.atan2(-ty, -tx)
    const miss = Math.atan2(Math.sin(along - heading), Math.cos(along - heading))
    heading += miss * Math.min(ALIGN_MAX, ALIGN_MIN + impact / ALIGN_SPEED)
  }
  const hc = Math.cos(heading)
  const hs = Math.sin(heading)
  const u = vx * hc + vy * hs
  return {
    car: {
      ...car,
      x: car.x + wx * depth,
      y: car.y + wy * depth,
      heading,
      u,
      v: -vx * hs + vy * hc,
      r: impact > 0 ? car.r * YAW_DAMP : car.r,
      speed: u,
    },
    impact,
  }
}
