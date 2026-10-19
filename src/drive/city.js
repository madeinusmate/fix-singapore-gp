import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshLambertMaterial, Vector3 } from 'three'
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
export const NIGHT_ALBEDO = 1.25

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

// The bake keeps each square kilometre in one mesh. A mesh is drawn in full
// once any corner is on screen, which is how a lap looking down an empty
// straight still submits half a million triangles. Chunks are small enough
// that the ones past the fog can be skipped.
export const CHUNK_M = 120

const worldPoint = new Vector3()

const compactGeometry = (geometry, corners) => {
  const map = new Map()
  const order = []
  const index = new Uint32Array(corners.length)
  for (let i = 0; i < corners.length; i += 1) {
    const old = corners[i]
    let next = map.get(old)
    if (next === undefined) {
      next = order.length
      map.set(old, next)
      order.push(old)
    }
    index[i] = next
  }
  const nextGeometry = new BufferGeometry()
  Object.keys(geometry.attributes).forEach((name) => {
    const source = geometry.getAttribute(name)
    const array = new source.array.constructor(order.length * source.itemSize)
    for (let i = 0; i < order.length; i += 1) {
      const from = order[i] * source.itemSize
      array.set(source.array.subarray(from, from + source.itemSize), i * source.itemSize)
    }
    nextGeometry.setAttribute(name, new BufferAttribute(array, source.itemSize, source.normalized))
  })
  nextGeometry.setIndex(new BufferAttribute(order.length > 65535 ? index : new Uint16Array(index), 1))
  nextGeometry.computeBoundingSphere()
  return nextGeometry
}

// Splits a mesh into pieces with their own bounds. A geometry whose bounds
// cover the whole lap is drawn, and shadowed, from anywhere on the circuit.
export const splitGeometry = (geometry, { chunkM = CHUNK_M, minTriangles = 1500, matrix = null } = {}) => {
  const position = geometry?.getAttribute?.('position')
  if (!position || position.count < 3) return geometry ? [geometry] : []
  const sourceIndex = geometry.getIndex()
  const triangles = (sourceIndex ? sourceIndex.count : position.count) / 3
  if (triangles < minTriangles) return [geometry]
  const buckets = new Map()
  for (let triangle = 0; triangle < triangles; triangle += 1) {
    const base = triangle * 3
    const corners = sourceIndex
      ? [sourceIndex.getX(base), sourceIndex.getX(base + 1), sourceIndex.getX(base + 2)]
      : [base, base + 1, base + 2]
    let x = 0
    let z = 0
    corners.forEach((vertex) => {
      worldPoint.fromBufferAttribute(position, vertex)
      if (matrix) worldPoint.applyMatrix4(matrix)
      x += worldPoint.x
      z += worldPoint.z
    })
    const key = `${Math.floor(x / (3 * chunkM))},${Math.floor(z / (3 * chunkM))}`
    const list = buckets.get(key)
    if (list) list.push(corners[0], corners[1], corners[2])
    else buckets.set(key, [corners[0], corners[1], corners[2]])
  }
  if (buckets.size < 2) return [geometry]
  return [...buckets.values()].map((corners) => compactGeometry(geometry, corners))
}

export const chunkCity = (scene, chunkM = CHUNK_M, minTriangles = 1500) => {
  scene.updateMatrixWorld(true)
  const meshes = []
  scene.traverse((object) => { if (object.isMesh) meshes.push(object) })
  meshes.forEach((mesh) => {
    const geometry = mesh.geometry
    const parts = splitGeometry(geometry, { chunkM, minTriangles, matrix: mesh.matrixWorld })
    if (parts.length < 2) {
      if (geometry && !geometry.boundingSphere) geometry.computeBoundingSphere()
      mesh.userData.chunk = true
      return
    }
    parts.forEach((part) => {
      const child = new Mesh(part, mesh.material)
      child.name = mesh.name
      child.matrix.copy(mesh.matrix)
      child.matrixAutoUpdate = false
      child.matrixWorldNeedsUpdate = true
      child.castShadow = false
      child.receiveShadow = false
      child.userData.chunk = true
      mesh.parent.add(child)
    })
    mesh.removeFromParent()
    geometry.dispose()
  })
}

const chunkCenter = new Vector3()

// Hides city chunks the fog has already swallowed. `reach` is the chunk's
// world-space radius, cached because the city scale does not change.
export const cullCity = (scene, position, drawM) => {
  scene.updateMatrixWorld()
  scene.traverse((object) => {
    if (!object.isMesh || !object.userData.chunk) return
    const sphere = object.geometry.boundingSphere
    if (!sphere) return
    if (!object.userData.reach) {
      const scale = Math.hypot(object.matrix.elements[0], object.matrix.elements[1], object.matrix.elements[2])
      object.userData.reach = sphere.radius * (scale || 1)
    }
    chunkCenter.copy(sphere.center).applyMatrix4(object.matrixWorld)
    const dx = chunkCenter.x - position.x
    const dy = chunkCenter.y - position.y
    const dz = chunkCenter.z - position.z
    const limit = drawM + object.userData.reach
    object.visible = dx * dx + dy * dy + dz * dz <= limit * limit
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
        chunkCity(gltf.scene)
        return { scene: gltf.scene, originLng, originLat, bigWheels }
      })
      .catch((err) => {
        pending.delete(url)
        throw err
      }))
  }
  return pending.get(url)
}
