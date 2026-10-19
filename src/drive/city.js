import { DoubleSide, MeshLambertMaterial } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { toMetres } from '../sim/project.js'

export const CITY_URL = 'drive/city.glb'

export const cityUrl = (slug = 'singapore') => (
  !slug || slug === 'singapore' ? CITY_URL : `drive/cities/${slug}.glb`
)

const TREE_MATERIAL = /tree/i
const WATER_MATERIAL = /water/i

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

// Buildings are most of the pixels. MeshLambertMaterial is the cheap lit
// material in three.js: it keeps the colour map, vertex tint and night windows,
// and drops the PBR environment sample. Water stays standard so the bay can
// still reflect the sky. The bake's faces point either way, so the city keeps
// both sides; dropping the back faces hides the blocks.
// Lambert never reads the sky environment, and the night sun is too dim to
// survive ACES on its own. A fraction of the shaded colour (map and vertex
// tint, already in diffuseColor) puts the blocks back without a second
// texture sample. Windows keep the warmer emissive from paintWindows.
export const NIGHT_ALBEDO = 0.9

export const liftNightCity = (material, amount = NIGHT_ALBEDO) => {
  if (!material?.isMeshLambertMaterial || material.userData.nightLift) return false
  material.userData.nightLift = amount
  const previous = material.onBeforeCompile
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer)
    shader.fragmentShader = shader.fragmentShader.replace(
      'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
      `vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance + diffuseColor.rgb * ${Number(amount).toFixed(2)};`,
    )
  }
  material.needsUpdate = true
  return true
}

export const cheapCityMaterial = (source) => {
  if (!source || WATER_MATERIAL.test(source.name || '')) return source
  const material = new MeshLambertMaterial({
    name: source.name,
    color: source.color?.clone?.() ?? source.color,
    map: source.map || null,
    alphaMap: source.alphaMap || null,
    transparent: source.transparent,
    opacity: source.opacity,
    alphaTest: source.alphaTest,
    depthWrite: source.depthWrite,
    depthTest: source.depthTest,
    vertexColors: !!source.vertexColors,
    emissive: source.emissive?.clone?.() ?? source.emissive,
    emissiveMap: source.emissiveMap || null,
    emissiveIntensity: source.emissiveIntensity ?? 1,
    side: DoubleSide,
  })
  material.userData = { ...source.userData, lambert: true }
  return material
}

export const lightenCity = (scene) => {
  const swapped = new Map()
  const adopt = (material) => {
    if (!material) return material
    if (swapped.has(material)) return swapped.get(material)
    const next = cheapCityMaterial(material)
    swapped.set(material, next)
    if (next !== material) material.dispose()
    return next
  }
  scene.traverse((object) => {
    if (!object.isMesh) return
    object.material = Array.isArray(object.material) ? object.material.map(adopt) : adopt(object.material)
    object.castShadow = false
    object.receiveShadow = false
    object.matrixAutoUpdate = false
    object.updateMatrix()
  })
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
        lightenCity(gltf.scene)
        return { scene: gltf.scene, originLng, originLat, bigWheels }
      })
      .catch((err) => {
        pending.delete(url)
        throw err
      }))
  }
  return pending.get(url)
}
