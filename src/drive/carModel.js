import { Color } from 'three'
import { TRACK_LAYER } from './budget.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

// "F1 2022" by Blender458 (CC BY 4.0), prepared by analysis/prep_car.mjs.
// Car frame: +X forward, +Y up, +Z to the right, origin on the ground midway
// between the axles.
export const CAR_URL = 'drive/f1.glb'
export const WHEELS = ['spin_FL', 'spin_FR', 'spin_RL', 'spin_RR']
export const STEERS = ['steer_FL', 'steer_FR']
const GHOST_OPACITY = 0.3

let pending
export const loadCarModel = () => {
  pending ||= new GLTFLoader()
    .setMeshoptDecoder(MeshoptDecoder)
    .loadAsync(`${import.meta.env.BASE_URL}${CAR_URL}`)
    .then((gltf) => gltf.scene)
    .catch((err) => {
      pending = null
      throw err
    })
  return pending
}

// A copy of the car with its own materials: the livery takes `color`, and a
// ghost is see-through and casts no shadow.
export const dressCar = (template, { color, ghost = false }) => {
  const root = template.clone(true)
  const copies = new Map()
  root.traverse((object) => {
    if (!object.isMesh) return
    const source = object.material
    if (!copies.has(source)) {
      const material = source.clone()
      if (material.name === 'livery') material.color = new Color(color)
      if (ghost) {
        material.transparent = true
        material.opacity = GHOST_OPACITY
        material.depthWrite = false
      }
      copies.set(source, material)
    }
    object.material = copies.get(source)
    object.castShadow = !ghost
    object.receiveShadow = !ghost
    object.layers.enable(TRACK_LAYER)
  })
  root.rotation.order = 'YZX'
  return {
    root,
    wheels: WHEELS.map((name) => root.getObjectByName(name)).filter(Boolean),
    steers: STEERS.map((name) => root.getObjectByName(name)).filter(Boolean),
  }
}

// Pose a dressed car: plane position and heading, wheel roll and steer angle,
// plus a little pitch and roll from the car's accelerations.
export const poseCar = (car, { x, y, h, heading, wheelAngle = 0, delta = 0, ax = 0, ay = 0 }) => {
  car.root.position.set(x, h, -y)
  car.root.rotation.set(ay * 0.0004, heading, ax * 0.0006)
  car.wheels.forEach((wheel) => { wheel.rotation.z = -wheelAngle })
  car.steers.forEach((steer) => { steer.rotation.y = delta })
}

export const disposeCar = (car) => {
  const seen = new Set()
  car.root.traverse((object) => {
    if (object.isMesh && !seen.has(object.material)) {
      seen.add(object.material)
      object.material.dispose()
    }
  })
}
