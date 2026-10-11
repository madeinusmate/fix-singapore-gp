import { CapsuleGeometry, CylinderGeometry, Quaternion, TorusGeometry, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// A big wheel such as the Singapore Flyer, from the numbers that
// analysis/osm_wheels.mjs keeps in the city bake. Local axes: x along the
// wheel's plane, y up, z along the axle, with the hub at the origin. The
// capsules' outer edge is the OSM radius and the legs reach the ground.
export const CAPSULES = 28
const CAPSULE_R_M = 2
const CAPSULE_LEN_M = 4
const TUBE_M = 0.6
const TRUSS_DEPTH_M = 3.5
const BAYS = 56
const SPOKES = 32

const UP = new Vector3(0, 1, 0)

const strut = (a, b, radius, sides = 6) => {
  const span = new Vector3().subVectors(b, a)
  const geometry = new CylinderGeometry(radius, radius, span.length(), sides)
  geometry.applyQuaternion(new Quaternion().setFromUnitVectors(UP, span.clone().normalize()))
  geometry.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
  return geometry
}

const ring = (radius, z, tube) => {
  const geometry = new TorusGeometry(radius, tube, 8, 192)
  geometry.translate(0, 0, z)
  return geometry
}

const onRim = (radius, angle, z) => new Vector3(radius * Math.cos(angle), radius * Math.sin(angle), z)

export const bigWheelGeometry = ({ hub, radius, width }) => {
  const rim = radius - 2 * CAPSULE_R_M - TUBE_M
  const inner = rim - TRUSS_DEPTH_M
  const face = Math.max(1.5, width * 0.3)
  const flange = face + 3
  const parts = [ring(rim, face, TUBE_M), ring(rim, -face, TUBE_M), ring(inner, 0, TUBE_M * 0.75)]
  for (let k = 0; k < BAYS; k += 1) {
    const angle = (k / BAYS) * Math.PI * 2
    const front = onRim(rim, angle, face)
    const back = onRim(rim, angle, -face)
    const core = onRim(inner, angle, 0)
    parts.push(strut(front, back, 0.25, 4), strut(front, core, 0.25, 4), strut(back, core, 0.25, 4))
  }
  for (let k = 0; k < SPOKES; k += 1) {
    ;[[flange, face, 0], [-flange, -face, 0.5]].forEach(([z0, z1, shift]) => {
      const angle = ((k + shift) / SPOKES) * Math.PI * 2
      parts.push(strut(onRim(3, angle, z0), onRim(rim, angle, z1), 0.12, 4))
    })
  }
  const axle = new CylinderGeometry(3.5, 3.5, 2 * (flange + 1), 16)
  axle.rotateX(Math.PI / 2)
  parts.push(axle)
  ;[1, -1].forEach((side) => {
    const top = new Vector3(0, 0, side * (flange + 0.5))
    ;[1, -1].forEach((spread) => {
      parts.push(strut(top, new Vector3(spread * hub * 0.32, -hub, side * (flange + hub * 0.18)), 1.4, 8))
    })
  })
  const frame = mergeGeometries(parts)
  parts.forEach((part) => part.dispose())

  const pods = []
  for (let k = 0; k < CAPSULES; k += 1) {
    const angle = (k / CAPSULES) * Math.PI * 2
    const pod = new CapsuleGeometry(CAPSULE_R_M, CAPSULE_LEN_M, 4, 12)
    pod.rotateX(Math.PI / 2)
    const at = onRim(radius - CAPSULE_R_M, angle, 0)
    pod.translate(at.x, at.y, at.z)
    pods.push(pod)
  }
  const capsules = mergeGeometries(pods)
  pods.forEach((pod) => pod.dispose())
  return { frame, capsules }
}
