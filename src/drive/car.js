import { ASSUME, G0 } from '../sim/const.js'
import { pk } from '../sim/lapsim.js'

// Planar single-track car. Body-frame speeds: u forward, v to the left, yaw
// rate r counter-clockwise, on the sim's plane (x east, y north). Tyres follow
// a simplified Pacejka curve inside a friction circle, downforce adds grip with
// speed, and an eight-speed box turns wheel speed into engine rpm. Power, drag
// and MGU-K deployment come from the same assumptions as the lap sim.
const M = ASSUME.mass_kg
const YAW_INERTIA = 1100
export const WHEELBASE_M = 3.6
const CG_TO_REAR = 0.45 * WHEELBASE_M
const CG_TO_FRONT = WHEELBASE_M - CG_TO_REAR
const CG_HEIGHT = 0.3
export const WHEEL_RADIUS_M = 0.36
const MU = 2.2
// Wider rears: with grip in proportion to load alone the car would be exactly
// neutral and let go at both ends at once. This makes it push gently instead.
const REAR_GRIP = 1.15
const RUN_OFF_GRIP = 0.85
const CLA_Z = 3.6
const CLA_X = 2.2
const AERO_FRONT = 0.42
// Magic-formula shape: peak lateral force near 6 degrees of slip.
const SLIP_B = 18
const SLIP_C = 1.45
export const PEAK_SLIP = Math.tan(Math.PI / (2 * SLIP_C)) / SLIP_B
const MAX_LOCK = 0.42
const STEER_RATE = 4
const BRAKE_FRONT = 0.57
// Brake and drive demand stop just short of the tyre limit, so a keyboard
// stab neither locks the fronts nor lights up the rears.
const BRAKE_ASSIST = 0.94
const TRACTION_ASSIST = 0.96
// Mid-corner the assist still lets this much braking through, so a late
// lift-and-brake scrubs speed instead of doing nothing.
const BRAKE_ROOM_F = 0.4
const BRAKE_ROOM_R = 0.25
const ENGINE_BRAKE_N = 2200
const REVERSE_MS = 8
// Holding the brake at a standstill this long selects reverse.
const REVERSE_HOLD_S = 0.35
const SUB_DT = 1 / 300
const LOW_SPEED = 2
const BLEND_SPEED = 5
const XMODE_KMH = 200

export const IDLE_RPM = 4500
export const SHIFT_RPM = 11800
export const LIMIT_RPM = 12500
const DOWN_RPM = 10500
const LAUNCH_RPM = 9500
const SHIFT_CUT_S = 0.05
export const GEAR_TOP_KMH = [100, 135, 168, 201, 235, 270, 306, 350]
const OMEGA_LIMIT = (LIMIT_RPM * 2 * Math.PI) / 60
const RATIOS = GEAR_TOP_KMH.map((kmh) => (OMEGA_LIMIT * WHEEL_RADIUS_M) / (kmh / 3.6))
const POWER_CURVE = [[3000, 0.3], [6000, 0.58], [8000, 0.78], [9500, 0.9], [10800, 0.98], [11600, 1], [12500, 0.96]]

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const approach = (value, target, step) => (value < target ? Math.min(target, value + step) : Math.max(target, value - step))

const shapeAt = (rpm) => {
  if (rpm <= POWER_CURVE[0][0]) return POWER_CURVE[0][1]
  for (let k = 1; k < POWER_CURVE.length; k += 1) {
    const [r1, p1] = POWER_CURVE[k]
    if (rpm <= r1) {
      const [r0, p0] = POWER_CURVE[k - 1]
      return p0 + ((rpm - r0) / (r1 - r0)) * (p1 - p0)
    }
  }
  return POWER_CURVE.at(-1)[1]
}

export const wheelRpm = (speed, gear) => (Math.abs(speed) / WHEEL_RADIUS_M) * RATIOS[gear - 1] * (60 / (2 * Math.PI))

// Lateral acceleration the tyres can hold at a forward speed, before slip.
export const gripAt = (speed, xmode = false, grip = 1) => {
  const down = 0.5 * ASSUME.rho * (xmode ? CLA_X : CLA_Z) * speed * speed
  return MU * grip * (G0 + down / M)
}

// Full keyboard lock at speed asks for a little more than the tyres can hold,
// never the 25 degrees a hairpin at walking pace needs.
export const steerLimit = (speed, grip = 1) => {
  const u = Math.max(1, Math.abs(speed))
  return clamp(PEAK_SLIP + (WHEELBASE_M * gripAt(u, false, grip)) / (u * u), 0.05, MAX_LOCK)
}

const lateralCurve = (alpha) => Math.sin(SLIP_C * Math.atan(SLIP_B * alpha))

export const carAt = (pose) => ({
  x: pose.x,
  y: pose.y,
  heading: pose.heading,
  u: 0,
  v: 0,
  r: 0,
  speed: 0,
  steer: 0,
  delta: 0,
  gear: 1,
  rpm: IDLE_RPM,
  ax: 0,
  ay: 0,
  cut: 0,
  xmode: false,
  manual: false,
  slide: 0,
  wheelAngle: 0,
  hold: 0,
})

const shiftFor = (car, input) => {
  if (car.gear < 1) return car.gear
  if (input.shift) {
    car.manual = true
    return clamp(car.gear + input.shift, 1, GEAR_TOP_KMH.length)
  }
  if (car.manual) return car.gear
  const rpm = wheelRpm(car.u, car.gear)
  if (input.throttle > 0 && rpm > SHIFT_RPM && car.gear < GEAR_TOP_KMH.length) return car.gear + 1
  if (car.gear > 1 && wheelRpm(car.u, car.gear - 1) < DOWN_RPM) return car.gear - 1
  return car.gear
}

const substep = (car, input, h, grip) => {
  const speed = Math.hypot(car.u, car.v)
  const forward = car.u >= 0
  car.steer = approach(car.steer, input.steer, STEER_RATE * h)
  car.delta = car.steer * steerLimit(car.u, grip)

  if (car.gear === 0 && (input.throttle > 0 || car.u > 0.5)) car.gear = 1
  car.hold = car.gear >= 1 && input.brake > 0 && input.throttle === 0 && car.u <= 0.5 ? car.hold + h : 0
  if (car.hold > REVERSE_HOLD_S) car.gear = 0
  car.xmode = car.gear >= 1 && input.throttle >= 1 && input.brake === 0 && Math.abs(car.steer) < 0.05 && car.u * 3.6 > XMODE_KMH

  const q = 0.5 * ASSUME.rho * speed * speed
  const down = q * (car.xmode ? CLA_X : CLA_Z)
  const drag = q * (car.xmode ? ASSUME.CdA_X : ASSUME.CdA_Z)
  const transfer = (M * car.ax * CG_HEIGHT) / WHEELBASE_M
  const fzF = Math.max(0, (M * G0 * CG_TO_REAR) / WHEELBASE_M - transfer + down * AERO_FRONT)
  const fzR = Math.max(0, (M * G0 * CG_TO_FRONT) / WHEELBASE_M + transfer + down * (1 - AERO_FRONT))
  const capF = MU * grip * fzF
  const capR = MU * REAR_GRIP * grip * fzR

  let alphaF = 0
  let alphaR = 0
  if (Math.abs(car.u) > 0.1) {
    alphaF = Math.atan2(car.v + CG_TO_FRONT * car.r, Math.abs(car.u)) - car.delta * (forward ? 1 : -1)
    alphaR = Math.atan2(car.v - CG_TO_REAR * car.r, Math.abs(car.u))
  }
  const fyF0 = -capF * lateralCurve(alphaF)
  const fyR0 = -capR * lateralCurve(alphaR)
  // Share of each axle's grip the cornering force leaves for braking or drive.
  const roomF = Math.sqrt(Math.max(0, 1 - (fyF0 / Math.max(1, capF)) ** 2))
  const roomR = Math.sqrt(Math.max(0, 1 - (fyR0 / Math.max(1, capR)) ** 2))

  // Longitudinal tyre forces, positive forward.
  let fxF = 0
  let fxR = 0
  const wheelRpmNow = car.gear >= 1 ? wheelRpm(car.u, car.gear) : 0
  if (car.gear === 0) {
    if (input.brake > 0 && car.u > -REVERSE_MS) fxR = -0.4 * capR * input.brake
    if (input.throttle > 0) fxF = BRAKE_ASSIST * capF * input.throttle
  } else if (input.brake > 0 && car.u > 0.05) {
    const demand = input.brake * (capF + capR)
    fxF = -Math.min(demand * BRAKE_FRONT, BRAKE_ASSIST * capF * Math.max(BRAKE_ROOM_F, roomF))
    fxR = -Math.min(demand * (1 - BRAKE_FRONT), BRAKE_ASSIST * capR * Math.max(BRAKE_ROOM_R, roomR))
  } else if (input.throttle > 0 && car.cut <= 0 && wheelRpmNow < LIMIT_RPM) {
    const engineRpm = Math.max(wheelRpmNow, IDLE_RPM)
    const power = (ASSUME.P_ice_kW * shapeAt(engineRpm) + pk(car.u * 3.6, false)) * 1000 * input.throttle
    fxR = Math.min(power / Math.max(car.u, 4), TRACTION_ASSIST * capR * roomR, ASSUME.a_trac_g * G0 * M)
  } else if (car.u > 1) {
    fxR = -ENGINE_BRAKE_N * clamp(wheelRpmNow / LIMIT_RPM, 0.3, 1)
  }
  const roll = ASSUME.Crr * M * G0
  const resist = (drag + roll) * Math.sign(car.u)

  // Whatever grip the longitudinal force uses comes off the lateral.
  const fyF = fyF0 * Math.sqrt(Math.max(0, 1 - (fxF / Math.max(1, capF)) ** 2))
  const fyR = fyR0 * Math.sqrt(Math.max(0, 1 - (fxR / Math.max(1, capR)) ** 2))
  const cos = Math.cos(car.delta)
  const sin = Math.sin(car.delta)
  const fx = fxR + fxF * cos - fyF * sin - resist
  const fy = fyR + fyF * cos + fxF * sin
  const moment = CG_TO_FRONT * (fyF * cos + fxF * sin) - CG_TO_REAR * fyR

  car.ax = fx / M
  car.ay = fy / M
  let u = car.u + (car.ax + car.v * car.r) * h
  let v = car.v + (car.ay - car.u * car.r) * h
  let r = car.r + (moment / YAW_INERTIA) * h
  if (car.u > 0 && u < 0 && car.gear !== 0) u = 0
  if (car.u < 0 && u > 0) u = 0

  // At walking pace, and in reverse, steer like a kinematic car.
  const blend = u < 0 ? 0 : clamp((u - LOW_SPEED) / (BLEND_SPEED - LOW_SPEED), 0, 1)
  if (blend < 1) {
    const kinematic = (u * Math.tan(car.delta)) / WHEELBASE_M
    r = blend * r + (1 - blend) * kinematic
    v *= blend
  }

  car.u = u
  car.v = v
  car.r = r
  car.heading += r * h
  const ch = Math.cos(car.heading)
  const sh = Math.sin(car.heading)
  car.x += (u * ch - v * sh) * h
  car.y += (u * sh + v * ch) * h
  car.wheelAngle = (car.wheelAngle + (u / WHEEL_RADIUS_M) * h) % (Math.PI * 2)
  car.cut = Math.max(0, car.cut - h)

  const overSlip = Math.max(Math.abs(alphaF), Math.abs(alphaR)) / PEAK_SLIP
  const scrub = Math.max(Math.abs(fxF) / Math.max(1, capF), Math.abs(fxR) / Math.max(1, capR))
  car.slide = clamp(Math.max(overSlip - 0.85, (scrub - 0.9) * 4), 0, 1) * clamp(speed / 12, 0, 1)
}

// Advances the car by dt seconds. input: throttle and brake in [0, 1], steer
// in [-1, 1] (positive left) and shift as -1, 0 or +1 for this frame only.
// grip scales the tyres: 1 on the racing surface, less on the run-off.
export const stepCar = (car, input, dt, onRoad = true) => {
  const next = { ...car }
  const gear = shiftFor(next, input)
  if (gear !== next.gear) {
    next.gear = gear
    next.cut = SHIFT_CUT_S
  }
  const grip = onRoad ? 1 : RUN_OFF_GRIP
  let left = dt
  while (left > 1e-9) {
    const h = Math.min(SUB_DT, left)
    substep(next, input, h, grip)
    left -= h
  }
  next.speed = next.u
  const turning = wheelRpm(next.u, Math.max(1, next.gear))
  const launch = next.gear === 1 ? IDLE_RPM + input.throttle * (LAUNCH_RPM - IDLE_RPM) : IDLE_RPM
  next.rpm = clamp(Math.max(turning, launch), IDLE_RPM, LIMIT_RPM)
  return next
}
