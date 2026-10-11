import { smoothWrap } from '../sim/filter.js'
import { heightOf, nearestTags } from '../sim/ribbon.js'

// Kerb distance from the line never drops below this, so narrow or unmapped
// streets stay drivable with a keyboard.
const MIN_SIDE_M = 4
// Half a car: past the kerb by this much and the car is fully off the road.
export const CAR_HALF_M = 1
const GROUND_M = heightOf(0, false)
const RAMP_GRADE = 0.08
// Tags snap to the nearest street, so a lap passing under a bridge can pick
// up its deck for a few samples. A median over this many samples drops that.
const TAG_MEDIAN = 15
export const CHECKPOINT_EVERY = 100
const SPAWN_BEFORE = 40
const SEARCH = 30
const LOST_M = 40

const wrap = (i, n) => ((i % n) + n) % n

const median = (values, radius) => values.map((_, i) => {
  const window = []
  for (let o = -radius; o <= radius; o += 1) window.push(values[wrap(i + o, values.length)])
  window.sort((a, b) => a - b)
  return window[radius]
})

const ramped = (values, spacing) => {
  const n = values.length
  const reach = Math.ceil(Math.max(0, ...values) / RAMP_GRADE / spacing)
  return values.map((_, i) => {
    let h = values[i]
    for (let o = 1; o <= reach; o += 1) {
      const drop = RAMP_GRADE * o * spacing
      h = Math.max(h, values[wrap(i + o, n)] - drop, values[wrap(i - o, n)] - drop)
    }
    return h
  })
}

const heightsOf = (graph, centerline, n, spacing) => {
  if (!graph) return new Array(n).fill(0)
  const tags = nearestTags(graph, centerline.slice(0, n))
  const raw = tags.map((tag) => heightOf(tag.layer, tag.bridge) - GROUND_M)
  const ramps = ramped(median(raw, Math.floor(TAG_MEDIAN / 2)), spacing)
  return smoothWrap(ramps, ramps, 7)[0]
}

// Drivable geometry of a layout, in metres with the origin at the lap's mean.
// Plane coordinates keep the sim's axes (x east, y north); h is height above
// street level. Index 0 is the start line.
// The sim lap runs on the street polyline itself; the road surface is laid on a
// smoothed copy, since a junction's corner would fold the mesh on the inside.
export const buildCourse = (result, graph = null) => {
  const { prep, centerline } = result.features
  const n = prep.x.length
  const [px, py] = smoothWrap(prep.x, prep.y, 7)
  const cx = px.reduce((a, b) => a + b, 0) / n
  const cy = py.reduce((a, b) => a + b, 0) / n
  const x = px.map((v) => v - cx)
  const y = py.map((v) => v - cy)
  const nx = new Array(n)
  const ny = new Array(n)
  const left = new Array(n)
  const right = new Array(n)
  const { lx, ly, rx, ry } = prep.edges
  for (let i = 0; i < n; i += 1) {
    const a = wrap(i - 1, n)
    const b = wrap(i + 1, n)
    const tx = x[b] - x[a]
    const ty = y[b] - y[a]
    const tl = Math.hypot(tx, ty) || 1e-9
    nx[i] = -ty / tl
    ny[i] = tx / tl
    const across = (ex, ey) => (ex - cx - x[i]) * nx[i] + (ey - cy - y[i]) * ny[i]
    const sides = [across(lx[i], ly[i]), across(rx[i], ry[i])]
    left[i] = Math.max(MIN_SIDE_M, ...sides)
    right[i] = Math.max(MIN_SIDE_M, -Math.min(...sides))
  }
  const spacing = prep.length / n
  const checkpoints = []
  for (let i = CHECKPOINT_EVERY; i < n - CHECKPOINT_EVERY / 2; i += CHECKPOINT_EVERY) checkpoints.push(i)
  const spawn = wrap(-SPAWN_BEFORE, n)
  return {
    n,
    x,
    y,
    nx,
    ny,
    left,
    right,
    h: heightsOf(graph, centerline, n, spacing),
    spacing,
    checkpoints,
    spawn: { index: spawn, x: x[spawn], y: y[spawn], heading: Math.atan2(-nx[spawn], ny[spawn]) },
  }
}

// Kerb positions on the plane for sample i: [leftX, leftY, rightX, rightY].
export const kerbsAt = (course, i, pad = 0) => [
  course.x[i] + course.nx[i] * (course.left[i] + pad),
  course.y[i] + course.ny[i] * (course.left[i] + pad),
  course.x[i] - course.nx[i] * (course.right[i] + pad),
  course.y[i] - course.ny[i] * (course.right[i] + pad),
]

const nearestIn = (course, px, py, indices) => {
  let index = indices[0]
  let best = Infinity
  indices.forEach((i) => {
    const d = Math.hypot(course.x[i] - px, course.y[i] - py)
    if (d < best) {
      best = d
      index = i
    }
  })
  return { index, dist: best }
}

// Where a car at (px, py) is on the lap. The search stays near the last known
// sample so a lap that crosses itself on a bridge never jumps to the other road.
export const locate = (course, px, py, from) => {
  const near = []
  for (let o = -SEARCH; o <= SEARCH; o += 1) near.push(wrap(from + o, course.n))
  let hit = nearestIn(course, px, py, near)
  if (hit.dist > LOST_M) hit = nearestIn(course, px, py, course.x.map((_, i) => i))
  const { index } = hit
  const offset = (px - course.x[index]) * course.nx[index] + (py - course.y[index]) * course.ny[index]
  const onRoad = offset <= course.left[index] && offset >= -course.right[index]
  const fullyOff = offset > course.left[index] + CAR_HALF_M || offset < -(course.right[index] + CAR_HALF_M)
  return { index, offset, onRoad, fullyOff }
}
