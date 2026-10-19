import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { toMetres } from '../sim/project.js'

export const CITY_URL = 'drive/city.glb'

export const cityUrl = (slug = 'singapore') => (
  !slug || slug === 'singapore' ? CITY_URL : `drive/cities/${slug}.glb`
)

const TREE_MATERIAL = /tree/i

// The bake flips every texture into glTF's top-left origin. Arbaro tree cards
// were already authored that way, so the canopy lands at the trunk. Sampling
// v' = 1 - v puts the foliage back at the top of the card.
export const uprightTreeTexture = (texture) => {
  if (!texture || texture.userData.upright) return
  texture.userData.upright = true
  const span = texture.repeat.y
  const center = texture.center?.y ?? 0
  texture.repeat.y = -span
  texture.offset.y += span * (1 - 2 * center)
}

const uprightTrees = (scene) => {
  scene.traverse((object) => {
    if (!object.isMesh) return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    materials.forEach((material) => {
      if (material?.map && TREE_MATERIAL.test(material.name || '')) uprightTreeTexture(material.map)
    })
  })
}

// Group position, in scene metres, that puts the city origin on the lap's projection.
// Singapore has no graph origin and stays on SVY21. The mesh itself is already in
// scene axes (x east, y up, z south) relative to that origin.
export const cityShift = (courseOrigin, originLng, originLat, projectionOrigin = null) => {
  const [ox, oy] = toMetres(originLng, originLat, projectionOrigin)
  return [ox - courseOrigin[0], 0, -(oy - courseOrigin[1])]
}

// The textured OSM2World city baked by analysis/bake_city.mjs. The scene's
// extras carry the WGS84 point its origin sits on and the big wheels the bake
// left out of the mesh. One promise per circuit, so Monaco does not reuse the bay.
const pending = new Map()
export const loadCity = (slug = 'singapore') => {
  const url = `${import.meta.env.BASE_URL}${cityUrl(slug)}`
  if (!pending.has(url)) {
    pending.set(url, new GLTFLoader()
      .setMeshoptDecoder(MeshoptDecoder)
      .loadAsync(url)
      .then((gltf) => {
        const { originLng, originLat, bigWheels = [] } = gltf.scene.userData
        if (!Number.isFinite(originLng) || !Number.isFinite(originLat)) throw new Error('City mesh has no origin')
        uprightTrees(gltf.scene)
        return { scene: gltf.scene, originLng, originLat, bigWheels }
      })
      .catch((err) => {
        pending.delete(url)
        throw err
      }))
  }
  return pending.get(url)
}
