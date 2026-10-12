import { corners } from '../sim/corners.js'
import { KERB_M } from './walls.js'

// Countdown boards on the straight into a corner, the usual circuit set.
export const DISTANCE_M = [200, 150, 100, 50]

// The board stands in the run-off, just past the kerb, facing the car.
const PAST_KERB_M = 0.7
const BOARD_IN_M = 0.08
export const BRAKING_POST_H_M = 1.5
export const BRAKING_BOARD_W_M = 1.2
export const BRAKING_BOARD_H_M = 0.96
const BOARD_CENTER_M = 0.98

const lastRun = (idx, brk) => {
  let best = null
  let start = null
  let count = 0
  const commit = () => {
    if (count >= 2) best = start
    start = null
    count = 0
  }
  idx.forEach((i) => {
    if (brk[i]) {
      if (count === 0) start = i
      count += 1
    } else commit()
  })
  commit()
  return best
}

// Sample about `metres` back from `from`, walking the lap against the direction
// of travel. Null when the walk would lap the circuit before getting there.
const distanceBack = (from, metres, n, seg) => {
  let travelled = 0
  let i = from
  for (let step = 0; step < n - 1; step += 1) {
    const prev = (i - 1 + n) % n
    const stepM = seg[prev]
    if (travelled + stepM >= metres) return metres - travelled <= travelled + stepM - metres ? i : prev
    travelled += stepM
    i = prev
  }
  return null
}

// Distance boards for every corner the lap actually brakes for. Each board is
// measured back from that corner's entry along this lap, so a newly drawn
// layout gets its own set. A board that would fall inside the previous corner
// is left out.
export const brakingPoints = (prep, brk) => {
  const { corners: found, straights } = corners(prep)
  const n = prep.k.length
  const points = []
  straights.forEach((straight) => {
    if (lastRun(straight.idx, brk) == null) return
    const entry = straight.into.i0
    const turn = found.indexOf(straight.into) + 1
    const onStraight = new Set(straight.idx)
    DISTANCE_M.forEach((metres) => {
      if (straight.len < metres) return
      const index = distanceBack(entry, metres, n, prep.seg)
      if (index == null || !onStraight.has(index)) return
      points.push({ index, metres, turn, entry })
    })
  })
  points.sort((a, b) => a.turn - b.turn || b.metres - a.metres)
  return points
}

// Driver's left, unless the lap crosses itself there and the right side is clear.
export const markerSide = (openLeft, openRight) => (openLeft && !openRight ? -1 : 1)

// Board and post for a marker at `index`, in the sim's plane. `side` is +1
// on the driver's left and -1 on the right.
export const brakingSign = (course, index, side = 1) => {
  const edge = side > 0 ? course.left[index] : course.right[index]
  const postSide = side * (edge + KERB_M + PAST_KERB_M)
  const boardSide = postSide - side * BOARD_IN_M
  const at = (offset) => [course.x[index] + course.nx[index] * offset, course.y[index] + course.ny[index] * offset]
  const [bx, by] = at(boardSide)
  const [px, py] = at(postSide)
  const ground = course.h[index]
  return {
    board: { x: bx, y: by, h: ground + BOARD_CENTER_M },
    post: { x: px, y: py, h: ground + BRAKING_POST_H_M / 2 },
    yaw: Math.atan2(-course.ny[index], -course.nx[index]),
  }
}
