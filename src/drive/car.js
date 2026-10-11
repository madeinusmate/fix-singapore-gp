import { ASSUME, G0 } from '../sim/const.js'

const WHEELBASE_M = 3.6
const MAX_LOCK_RAD = 0.55
// Share of the sim's cornering grip the arcade car gets. Any less and even a
// tidy lap ends up seconds behind the sim ghost, which drives a perfect line.
const GRIP = 1
const BRAKE = 0.6
const STEER_RATE = 4
const COAST = 1.5
const REVERSE_MS = 8
// Off the road drag grows with speed (per second) and speed is capped.
const OFF_ROAD_DRAG = 0.5
const OFF_ROAD_MS = 25

export const carSpec = (topKmh) => ({
  vmax: Math.max(40, topKmh / 3.6),
  accel: ASSUME.a_trac_g * G0,
  brake: BRAKE * ASSUME.a_brake_g * G0,
  aLat: GRIP * ASSUME.a_lat_g * G0,
})

export const carAt = (pose) => ({ x: pose.x, y: pose.y, heading: pose.heading, speed: 0, steer: 0 })

const approach = (value, target, step) => (value < target ? Math.min(target, value + step) : Math.max(target, value - step))

// One arcade step. input: throttle and brake in [0, 1], steer in [-1, 1] with
// positive to the left. Speed is metres per second, negative when reversing.
export const stepCar = (car, input, dt, spec, onRoad = true) => {
  const steer = approach(car.steer, input.steer, STEER_RATE * dt)
  const cap = onRoad ? spec.vmax : OFF_ROAD_MS
  let { speed } = car
  if (input.brake > 0 && speed <= 0.5) {
    speed = Math.max(-REVERSE_MS, speed - spec.accel * 0.5 * input.brake * dt)
  } else if (input.brake > 0) {
    speed = Math.max(0, speed - spec.brake * input.brake * dt)
  } else if (input.throttle > 0 && speed >= 0) {
    speed += spec.accel * input.throttle * Math.max(0, 1 - (speed / cap) ** 2) * dt
  } else if (input.throttle > 0) {
    speed = Math.min(0, speed + spec.brake * dt)
  }
  const resist = (input.throttle > 0 ? 0 : COAST) + (onRoad ? 0 : OFF_ROAD_DRAG * Math.abs(speed))
  speed = approach(speed, 0, resist * dt)
  if (Math.abs(speed) > cap) speed = approach(speed, Math.sign(speed) * cap, spec.brake * 0.5 * dt)
  const v = Math.abs(speed)
  const wanted = (v * Math.tan(steer * MAX_LOCK_RAD)) / WHEELBASE_M
  const limit = v > 1 ? spec.aLat / v : Infinity
  const yaw = Math.sign(wanted) * Math.min(Math.abs(wanted), limit) * Math.sign(speed || 1)
  const heading = car.heading + yaw * dt
  return {
    x: car.x + Math.cos(heading) * speed * dt,
    y: car.y + Math.sin(heading) * speed * dt,
    heading,
    speed,
    steer,
  }
}
