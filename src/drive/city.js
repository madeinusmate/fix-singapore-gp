import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { toMetres } from '../sim/project.js'

export const CITY_URL = 'drive/city.glb'

// Group position, in scene metres, that puts the city origin on its SVY21 point.
// The mesh itself is already in scene axes (x east, y up, z south) relative to that origin.
export const cityShift = (courseOrigin, originLng, originLat) => {
  const [ox, oy] = toMetres(originLng, originLat)
  return [ox - courseOrigin[0], 0, -(oy - courseOrigin[1])]
}

// The textured OSM2World city baked by analysis/bake_city.mjs. The scene's
// extras carry the WGS84 point its origin sits on.
let pending
export const loadCity = () => {
  pending ||= new GLTFLoader()
    .setMeshoptDecoder(MeshoptDecoder)
    .loadAsync(`${import.meta.env.BASE_URL}${CITY_URL}`)
    .then((gltf) => {
      const { originLng, originLat } = gltf.scene.userData
      if (!Number.isFinite(originLng) || !Number.isFinite(originLat)) throw new Error('City mesh has no origin')
      return { scene: gltf.scene, originLng, originLat }
    })
    .catch((err) => {
      pending = null
      throw err
    })
  return pending
}
