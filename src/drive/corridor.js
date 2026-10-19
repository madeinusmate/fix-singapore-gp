import { DataTexture, DoubleSide, FrontSide, BackSide, NearestFilter, RGFormat, UnsignedByteType, Vector4 } from 'three'
import { WALL_THICK_M } from './meshes.js'

// City geometry between the walls and under the car's headroom is cut away as
// it is drawn, so OSM building edges that overlap the lap, trees on the
// run-off and the city's own road markings stay off the track. Link bridges
// are baked at 5 m (analysis/osm_clearance.mjs), above the headroom.
export const HEADROOM_M = 4.5
const FOOT_M = 0.5
const MAX_TEXELS = 4096
const MIN_TEXEL_M = 0.5
// Past the walls' outer faces, so texels on the edge still cover the wall.
const PAD_M = 0.5
// Texels hold the road height under them as (h + H_BASE_M) / H_STEP_M, with 0
// for outside the lap: red the lowest road over the texel, green the highest.
const H_STEP_M = 0.1
const H_BASE_M = 2

export const encodeHeight = (h) => Math.max(1, Math.min(255, Math.round((h + H_BASE_M) / H_STEP_M)))
export const decodeHeight = (v) => v * H_STEP_M - H_BASE_M

// Top-down grid of the lap out to the walls' outer faces, in plane metres.
export const corridorMask = (course, walls) => {
  const { n, x, y, nx, ny, h } = course
  const left = (i) => walls.left[i] + WALL_THICK_M + PAD_M
  const right = (i) => walls.right[i] + WALL_THICK_M + PAD_M
  const edges = []
  for (let i = 0; i < n; i += 1) {
    edges.push([x[i] + nx[i] * left(i), y[i] + ny[i] * left(i)], [x[i] - nx[i] * right(i), y[i] - ny[i] * right(i)])
  }
  const xs = edges.map((p) => p[0])
  const ys = edges.map((p) => p[1])
  const minX = Math.min(...xs) - 1
  const minY = Math.min(...ys) - 1
  const texel = Math.max(MIN_TEXEL_M, (Math.max(...xs) + 1 - minX) / MAX_TEXELS, (Math.max(...ys) + 1 - minY) / MAX_TEXELS)
  const width = Math.ceil((Math.max(...xs) + 1 - minX) / texel)
  const height = Math.ceil((Math.max(...ys) + 1 - minY) / texel)
  const data = new Uint8Array(width * height * 2)

  const fill = (a, b, c, value) => {
    const side = (p, q, px, py) => (q[0] - p[0]) * (py - p[1]) - (q[1] - p[1]) * (px - p[0])
    const area = side(a, b, c[0], c[1])
    if (area === 0) return
    const col0 = Math.max(0, Math.floor((Math.min(a[0], b[0], c[0]) - minX) / texel))
    const col1 = Math.min(width - 1, Math.floor((Math.max(a[0], b[0], c[0]) - minX) / texel))
    const row0 = Math.max(0, Math.floor((Math.min(a[1], b[1], c[1]) - minY) / texel))
    const row1 = Math.min(height - 1, Math.floor((Math.max(a[1], b[1], c[1]) - minY) / texel))
    for (let row = row0; row <= row1; row += 1) {
      const py = minY + (row + 0.5) * texel
      for (let col = col0; col <= col1; col += 1) {
        const px = minX + (col + 0.5) * texel
        const s = [side(a, b, px, py), side(b, c, px, py), side(c, a, px, py)]
        if (!(area > 0 ? s.every((v) => v >= 0) : s.every((v) => v <= 0))) continue
        const k = (row * width + col) * 2
        data[k] = data[k] ? Math.min(data[k], value) : value
        data[k + 1] = Math.max(data[k + 1], value)
      }
    }
  }
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n
    const value = encodeHeight((h[i] + h[j]) / 2)
    const [li, ri, lj, rj] = [edges[2 * i], edges[2 * i + 1], edges[2 * j], edges[2 * j + 1]]
    fill(li, lj, rj, value)
    fill(li, rj, ri, value)
  }
  return { data, width, height, minX, minY, texel }
}

export const sampleMask = (mask, px, py) => {
  const col = Math.floor((px - mask.minX) / mask.texel)
  const row = Math.floor((py - mask.minY) / mask.texel)
  if (col < 0 || row < 0 || col >= mask.width || row >= mask.height) return null
  const k = (row * mask.width + col) * 2
  return mask.data[k] ? [decodeHeight(mask.data[k]), decodeHeight(mask.data[k + 1])] : null
}

export const corridorTexture = (mask) => {
  const texture = new DataTexture(mask.data, mask.width, mask.height, RGFormat, UnsignedByteType)
  texture.magFilter = NearestFilter
  texture.minFilter = NearestFilter
  texture.needsUpdate = true
  return texture
}

const VERTEX = `
  #include <project_vertex>
  vCorridor = (modelMatrix * vec4(transformed, 1.0)).xyz;
`
const FRAGMENT = `
  vec2 corridorUv = (vec2(vCorridor.x, -vCorridor.z) - corridorBox.xy) / corridorBox.zw;
  if (all(greaterThanEqual(corridorUv, vec2(0.0))) && all(lessThan(corridorUv, vec2(1.0)))) {
    vec2 road = texture2D(corridorMap, corridorUv).rg * 255.0;
    if (road.x > 0.5 && vCorridor.y > road.x * ${H_STEP_M.toFixed(2)} - ${(H_BASE_M + FOOT_M).toFixed(2)}
      && vCorridor.y < road.y * ${H_STEP_M.toFixed(2)} - ${H_BASE_M.toFixed(2)} + ${HEADROOM_M.toFixed(2)}) discard;
  }
`

// Makes a city material skip the corridor in `uniforms`. Cut buildings show
// their inside rather than a hole, so materials draw both faces; shadows keep
// the back faces they used before.
export const cutCorridor = (material, uniforms) => {
  if (material.userData.corridor) return
  const previous = material.onBeforeCompile
  material.userData.corridor = uniforms
  if (material.side === FrontSide) {
    material.side = DoubleSide
    material.shadowSide = BackSide
  }
  const key = material.userData.water ? 'corridor-water' : 'corridor'
  material.customProgramCacheKey = () => key
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer)
    shader.uniforms.corridorMap = uniforms.corridorMap
    shader.uniforms.corridorBox = uniforms.corridorBox
    shader.vertexShader = `varying vec3 vCorridor;\n${shader.vertexShader.replace('#include <project_vertex>', VERTEX)}`
    shader.fragmentShader = `uniform sampler2D corridorMap;\nuniform vec4 corridorBox;\nvarying vec3 vCorridor;\n${shader.fragmentShader.replace('void main() {', `void main() {${FRAGMENT}`)}`
  }
  material.needsUpdate = true
}

// The city's compiled shaders keep these uniforms, so each scene gets one set
// and a new layout only swaps the mask in it.
export const sceneCorridor = (scene, mask, texture) => {
  scene.userData.corridor ??= { corridorMap: { value: null }, corridorBox: { value: new Vector4(0, 0, 1, 1) } }
  const uniforms = scene.userData.corridor
  uniforms.corridorMap.value = texture
  uniforms.corridorBox.value.set(mask.minX, mask.minY, mask.width * mask.texel, mask.height * mask.texel)
  return uniforms
}
