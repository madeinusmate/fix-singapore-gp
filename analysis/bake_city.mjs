// Bakes a street-circuit window into a drive-mode city glb with OSM2World.
// The drive scene keeps its own road and car; this mesh is the city around them.
// OSM2World metres are +X east, +Y up, +Z north, with the origin at the centre
// of the extract. The glb stores scene metres: +X east, +Y up, +Z south.
// Textures come from OSM2World's default style (CC0 / public domain).
// `node analysis/bake_city.mjs` bakes Marina Bay. Named slugs bake those circuits.
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, basename, extname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Document, NodeIO, TextureInfo } from '@gltf-transform/core'
import { ALL_EXTENSIONS, EXTMeshoptCompression, EXTTextureWebP, KHRMeshQuantization, KHRTextureTransform } from '@gltf-transform/extensions'
import { quantize, reorder, weld } from '@gltf-transform/functions'
import { MeshoptEncoder } from 'meshoptimizer'
import sharp from 'sharp'
import { restoreAreas } from './osm_areas.mjs'
import { CLEARANCE_M, liftOverRoads } from './osm_clearance.mjs'
import { replaceBigWheels } from './osm_wheels.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cache = join(root, 'analysis', '.cache')
const modulePath = join(cache, 'osm2world-core-web.mjs')
const moduleUrl = 'https://osm2world.org/build/web/0.5.0-SNAPSHOT_2026-06-16/osm2world-core-web.mjs'
const styleHost = 'https://tiles.osm2world.org'
const styleUrl = `${styleHost}/styles/default/standard.properties`

// Singapore's drive-mode city stays the Marina Bay window. The routable graph covers the island.
// The other circuits use the street-graph window, which is the lap plus the streets around it.
const windowOf = (slug) => {
  const graph = JSON.parse(readFileSync(join(root, 'public', 'data', slug, 'graph.json'), 'utf8'))
  const [[west, south], [east, north]] = graph.bounds
  const pad = 0.002
  return { south: south - pad, west: west - pad, north: north + pad, east: east + pad }
}

const cityOut = (slug) => (slug === 'singapore'
  ? join(root, 'public', 'drive', 'city.glb')
  : join(root, 'public', 'drive', 'cities', `${slug}.glb`))

const cityOsm = (slug) => join(cache, slug === 'singapore' ? 'marina.json' : `${slug}.json`)

const baseCity = (slug, extra) => ({
  slug,
  ...extra,
  osmPath: cityOsm(slug),
  outPath: cityOut(slug),
  rows: extra.rows ?? 2,
  cols: extra.cols ?? 2,
  drivingSide: extra.drivingSide ?? 'right',
  minEast: extra.minEast ?? 800,
  minNorth: extra.minNorth ?? 800,
})

const CITIES = {
  singapore: baseCity('singapore', {
    south: 1.272,
    west: 103.838,
    north: 1.304,
    east: 103.878,
    rows: 4,
    cols: 4,
    drivingSide: 'left',
    widerThanTall: true,
    minEast: 1500,
    minNorth: 1000,
  }),
  azerbaijan: baseCity('azerbaijan', { ...windowOf('azerbaijan') }),
  monaco: baseCity('monaco', { ...windowOf('monaco') }),
  'las-vegas': baseCity('las-vegas', { ...windowOf('las-vegas') }),
  miami: baseCity('miami', { ...windowOf('miami') }),
  madrid: baseCity('madrid', { ...windowOf('madrid') }),
}

const CELL_M = 1000
const TEXTURE_PX = 512
const MAX_HEIGHT_M = 420

const tileQuery = (south, west, north, east) => `
[out:json][timeout:90];
(
  way["building"](${south},${west},${north},${east});
  relation["building"](${south},${west},${north},${east});
  way["building:part"](${south},${west},${north},${east});
  relation["building:part"](${south},${west},${north},${east});
  way["natural"](${south},${west},${north},${east});
  relation["natural"](${south},${west},${north},${east});
  way["landuse"](${south},${west},${north},${east});
  relation["landuse"](${south},${west},${north},${east});
  way["leisure"](${south},${west},${north},${east});
  relation["leisure"](${south},${west},${north},${east});
  way["waterway"](${south},${west},${north},${east});
  way["highway"](${south},${west},${north},${east});
  way["man_made"](${south},${west},${north},${east});
  node["man_made"](${south},${west},${north},${east});
);
out body;
>;
out skel qt;
`

const tiles = (city) => {
  const { south, west, north, east, rows, cols } = city
  const out = []
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      out.push([
        south + ((north - south) * row) / rows,
        west + ((east - west) * col) / cols,
        south + ((north - south) * (row + 1)) / rows,
        west + ((east - west) * (col + 1)) / cols,
      ])
    }
  }
  return out
}

mkdirSync(cache, { recursive: true })
mkdirSync(join(cache, 'http'), { recursive: true })

const cachedFetch = async (url) => {
  const file = join(cache, 'http', createHash('sha1').update(url).digest('hex'))
  if (existsSync(file)) return readFileSync(file)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  writeFileSync(file, buf)
  return buf
}

class XHR {
  constructor() {
    this.readyState = 0
    this.status = 0
    this.statusText = ''
    this.response = null
    this.responseText = ''
    this.responseType = ''
    this._headerText = ''
  }

  open(_method, url) { this._url = url }

  setRequestHeader() {}

  getAllResponseHeaders() { return this._headerText }

  getResponseHeader(name) {
    const line = this._headerText.split('\r\n').find((row) => row.toLowerCase().startsWith(`${name.toLowerCase()}:`))
    return line ? line.slice(line.indexOf(':') + 1).trim() : null
  }

  send() {
    cachedFetch(this._url).then((buf) => {
      this.status = 200
      this.statusText = 'OK'
      this._headerText = 'content-type: application/octet-stream'
      if (this.responseType === 'arraybuffer') this.response = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
      else {
        this.responseText = buf.toString('utf8')
        this.response = this.responseText
      }
      this.readyState = 4
      this.onreadystatechange?.()
    }).catch((err) => {
      console.error('fetch failed', this._url, err.message)
      this.status = 0
      this.readyState = 4
      this.onreadystatechange?.()
    })
  }
}

globalThis.XMLHttpRequest = XHR
globalThis.window = globalThis
globalThis.self = globalThis
if (!globalThis.document) globalThis.document = { createElement: () => ({ getContext: () => null }) }

const slim = (element) => {
  if (element.type === 'node' && Number.isFinite(element.lat) && Number.isFinite(element.lon)) {
    const node = { type: 'node', id: element.id, lat: element.lat, lon: element.lon }
    if (element.tags) node.tags = element.tags
    return node
  }
  if (element.type === 'way' && element.nodes?.length) {
    const way = { type: 'way', id: element.id, nodes: element.nodes }
    if (element.tags) way.tags = element.tags
    return way
  }
  if (element.type === 'relation' && element.members?.length) {
    const relation = {
      type: 'relation',
      id: element.id,
      members: element.members.map((member) => ({ type: member.type, ref: member.ref, role: member.role || '' })),
    }
    if (element.tags) relation.tags = element.tags
    return relation
  }
  return null
}

const downloadModule = async () => {
  if (existsSync(modulePath)) return
  process.stdout.write(`downloading ${moduleUrl}\n`)
  const res = await fetch(moduleUrl)
  if (!res.ok) throw new Error(`${res.status} ${moduleUrl}`)
  writeFileSync(modulePath, Buffer.from(await res.arrayBuffer()))
}

const indexOf = (mesh, verts) => {
  const raw = mesh.indices?.()
  if (raw && raw.length) return Uint32Array.from(raw)
  const out = new Uint32Array(verts)
  for (let i = 0; i < verts; i += 1) out[i] = i
  return out
}

const tintOf = (mesh) => {
  const color = mesh.color?.()
  const channel = (i) => Math.max(0, Math.min(255, Math.round((color?.[i] ?? 0.8) * 255)))
  return [channel(0), channel(1), channel(2)]
}

// One material per texture: OSM2World's per-object colour rides along as a vertex tint.
const materialKey = (mesh) => {
  const texture = mesh.baseColorTexture?.() || ''
  return `${texture}|${mesh.transparency?.() ? 1 : 0}|${mesh.clampTextures?.() ? 1 : 0}`
}

// Some OSM2World objects come out with UVs thousands of texture widths across
// a few metres, which renders as noise. Those get a planar projection instead.
const PLANAR_M = 1.5
const uvSource = (src, uvs, normals, clamp) => {
  const verts = src.length / 3
  const lo = [Infinity, Infinity, Infinity]
  const hi = [-Infinity, -Infinity, -Infinity]
  let uMin = Infinity
  let uMax = -Infinity
  let vMin = Infinity
  let vMax = -Infinity
  for (let i = 0; i < verts; i += 1) {
    for (let k = 0; k < 3; k += 1) {
      lo[k] = Math.min(lo[k], src[i * 3 + k])
      hi[k] = Math.max(hi[k], src[i * 3 + k])
    }
    uMin = Math.min(uMin, uvs[i * 2])
    uMax = Math.max(uMax, uvs[i * 2])
    vMin = Math.min(vMin, uvs[i * 2 + 1])
    vMax = Math.max(vMax, uvs[i * 2 + 1])
  }
  const uvSpan = Math.max(uMax - uMin, vMax - vMin)
  const size = Math.max(...hi.map((v, k) => v - lo[k]))
  // v is flipped into glTF's top-left origin. Arbaro tree cards are already
  // authored that way, so this sends them upside down; the drive scene turns
  // those textures back over on load.
  if (clamp || uvSpan <= 6 * size + 8) return (i) => [uvs[i * 2], 1 - uvs[i * 2 + 1]]
  return (i) => {
    const e = src[i * 3]
    const u = src[i * 3 + 1]
    const n = src[i * 3 + 2]
    const ax = normals ? Math.abs(normals[i * 3]) : 0
    const ay = normals ? Math.abs(normals[i * 3 + 1]) : 1
    const az = normals ? Math.abs(normals[i * 3 + 2]) : 0
    if (ay >= ax && ay >= az) return [e / PLANAR_M, -n / PLANAR_M]
    if (ax >= az) return [n / PLANAR_M, -u / PLANAR_M]
    return [e / PLANAR_M, -u / PLANAR_M]
  }
}

// Reflecting north onto -Z reverses winding, so triangles are stored a,c,b.
const bucketMeshes = (meshes) => {
  const groups = new Map()
  const materials = new Map()
  let eastMin = Infinity
  let eastMax = -Infinity
  let northMin = Infinity
  let northMax = -Infinity
  meshes.forEach((mesh, meshIndex) => {
    const src = mesh.positions()
    if (!src || src.length < 9) return
    const verts = src.length / 3
    const normals = mesh.normals?.()
    const uvs = mesh.uvs?.()
    const hasNormals = normals && normals.length === src.length
    const key = materialKey(mesh)
    const texture = mesh.baseColorTexture?.() || ''
    const hasUvs = texture && uvs && uvs.length === verts * 2
    if (!materials.has(key)) {
      materials.set(key, { texture: hasUvs ? texture : '', alpha: !!mesh.transparency?.(), clamp: !!mesh.clampTextures?.(), name: mesh.materialName?.() || 'MATERIAL' })
    }
    const material = materials.get(key)
    const textured = !!material.texture && hasUvs
    const uvAt = textured ? uvSource(src, uvs, hasNormals ? normals : null, material.clamp) : null
    // Tiled textures look the same after a whole-number shift, which keeps each
    // object's UVs near zero and the quantization grid fine.
    let shiftU = 0
    let shiftV = 0
    if (textured && !material.clamp) {
      let minU = Infinity
      let minV = Infinity
      for (let i = 0; i < verts; i += 1) {
        const [u, v] = uvAt(i)
        minU = Math.min(minU, u)
        minV = Math.min(minV, v)
      }
      shiftU = Number.isFinite(minU) ? Math.floor(minU) : 0
      shiftV = Number.isFinite(minV) ? Math.floor(minV) : 0
    }
    const [r, g, b] = tintOf(mesh)
    const idx = indexOf(mesh, verts)
    const tag = meshIndex * 0x1000000
    const ok = (i) => {
      const e = src[i * 3]
      const u = src[i * 3 + 1]
      const n = src[i * 3 + 2]
      return Number.isFinite(e) && Number.isFinite(u) && Number.isFinite(n) && u > -1 && u < MAX_HEIGHT_M
    }
    for (let t = 0; t + 2 < idx.length; t += 3) {
      const a = idx[t]
      const bI = idx[t + 1]
      const c = idx[t + 2]
      if (a === bI || bI === c || c === a) continue
      if (!ok(a) || !ok(bI) || !ok(c)) continue
      ;[a, bI, c].forEach((i) => {
        eastMin = Math.min(eastMin, src[i * 3])
        eastMax = Math.max(eastMax, src[i * 3])
        northMin = Math.min(northMin, src[i * 3 + 2])
        northMax = Math.max(northMax, src[i * 3 + 2])
      })
      const ce = (src[a * 3] + src[bI * 3] + src[c * 3]) / 3
      const cs = -((src[a * 3 + 2] + src[bI * 3 + 2] + src[c * 3 + 2]) / 3)
      const cell = `${Math.floor(ce / CELL_M)}_${Math.floor(cs / CELL_M)}`
      const groupKey = `${cell}|${key}`
      let group = groups.get(groupKey)
      if (!group) {
        group = { cell, key, textured, map: new Map(), positions: [], normals: [], uvs: [], colors: [], indices: [] }
        groups.set(groupKey, group)
      }
      let face = null
      if (!hasNormals) {
        const ux = src[bI * 3] - src[a * 3]
        const uy = src[bI * 3 + 1] - src[a * 3 + 1]
        const uz = src[bI * 3 + 2] - src[a * 3 + 2]
        const vx = src[c * 3] - src[a * 3]
        const vy = src[c * 3 + 1] - src[a * 3 + 1]
        const vz = src[c * 3 + 2] - src[a * 3 + 2]
        const nx = uy * vz - uz * vy
        const ny = uz * vx - ux * vz
        const nz = ux * vy - uy * vx
        const len = Math.hypot(nx, ny, nz) || 1
        face = [nx / len, ny / len, nz / len]
      }
      const take = (i) => {
        const idKey = face ? `${tag + i}:${t}` : tag + i
        let id = group.map.get(idKey)
        if (id != null) return id
        id = group.positions.length / 3
        group.map.set(idKey, id)
        group.positions.push(src[i * 3], src[i * 3 + 1], -src[i * 3 + 2])
        const nrm = face || [normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]]
        group.normals.push(nrm[0], nrm[1], -nrm[2])
        if (group.textured) {
          const [u, v] = uvAt(i)
          group.uvs.push(u - shiftU, v - shiftV)
        }
        group.colors.push(r, g, b)
        return id
      }
      group.indices.push(take(a), take(c), take(bI))
    }
  })
  return { groups, materials, eastMin, eastMax, northMin, northMax }
}

const textureImage = async (path) => {
  const source = await cachedFetch(`${styleHost}${path}`)
  return sharp(source)
    .resize({ width: TEXTURE_PX, height: TEXTURE_PX, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78, alphaQuality: 85 })
    .toBuffer()
}

const finish = (name) => {
  if (/Facade|Glass|Windows/i.test(name)) return { roughness: 0.3, metalness: 0.4 }
  if (/Metal|Steel|Corrugated/i.test(name)) return { roughness: 0.45, metalness: 0.6 }
  if (/Water/i.test(name)) return { roughness: 0.1, metalness: 0 }
  return { roughness: 0.9, metalness: 0 }
}

// Per material UV box. Every primitive of a material shares its texture
// transform, so all of them are quantized onto the same grid.
const uvBoxes = (groups) => {
  const boxes = new Map()
  for (const group of groups.values()) {
    if (!group.textured) continue
    const box = boxes.get(group.key) || { min: [Infinity, Infinity], max: [-Infinity, -Infinity] }
    for (let i = 0; i < group.uvs.length; i += 2) {
      for (let k = 0; k < 2; k += 1) {
        box.min[k] = Math.min(box.min[k], group.uvs[i + k])
        box.max[k] = Math.max(box.max[k], group.uvs[i + k])
      }
    }
    boxes.set(group.key, box)
  }
  return boxes
}

const quantizeUvs = (uvs, box) => {
  const out = new Uint16Array(uvs.length)
  for (let i = 0; i < uvs.length; i += 2) {
    for (let k = 0; k < 2; k += 1) {
      const span = Math.max(1e-6, box.max[k] - box.min[k])
      out[i + k] = Math.round(((uvs[i + k] - box.min[k]) / span) * 65535)
    }
  }
  return out
}

const writeGlb = async ({ groups, materials }, originLng, originLat, bigWheels) => {
  const doc = new Document()
  const buffer = doc.createBuffer()
  doc.createExtension(EXTTextureWebP).setRequired(true)
  doc.createExtension(KHRMeshQuantization).setRequired(true)
  const transforms = doc.createExtension(KHRTextureTransform).setRequired(true)
  const scene = doc.createScene('city').setExtras({ originLng, originLat, bigWheels })
  doc.getRoot().setDefaultScene(scene)
  doc.getRoot().getAsset().copyright = 'Map data © OpenStreetMap contributors (ODbL). Mesh by OSM2World. Textures from OSM2World\'s default style (CC0).'
  const textures = new Map()
  const gltfMaterials = new Map()
  const boxes = uvBoxes(groups)
  let worstStep = 0
  for (const [key, spec] of materials) {
    const label = spec.texture ? basename(spec.texture, extname(spec.texture)) : spec.name
    const finishOf = finish(label)
    const material = doc.createMaterial(label)
      .setDoubleSided(true)
      .setRoughnessFactor(finishOf.roughness)
      .setMetallicFactor(finishOf.metalness)
      .setAlphaMode(spec.alpha ? 'MASK' : 'OPAQUE')
    if (spec.alpha) material.setAlphaCutoff(0.5)
    if (spec.texture) {
      if (!textures.has(spec.texture)) {
        textures.set(spec.texture, doc.createTexture(label).setImage(await textureImage(spec.texture)).setMimeType('image/webp'))
      }
      material.setBaseColorTexture(textures.get(spec.texture))
      const info = material.getBaseColorTextureInfo()
      if (spec.clamp) info.setWrapS(TextureInfo.WrapMode.CLAMP_TO_EDGE).setWrapT(TextureInfo.WrapMode.CLAMP_TO_EDGE)
      const box = boxes.get(key)
      if (box) {
        const span = [0, 1].map((k) => Math.max(1e-6, box.max[k] - box.min[k]))
        worstStep = Math.max(worstStep, ...span.map((s) => s / 65535))
        process.stdout.write(`  uv ${label} ${span.map((s) => s.toFixed(1)).join(' x ')}\n`)
        info.setExtension('KHR_texture_transform', transforms.createTransform().setOffset(box.min).setScale(span))
      }
    }
    gltfMaterials.set(key, material)
  }
  process.stdout.write(`coarsest UV step ${worstStep.toFixed(5)} texture widths\n`)
  const cells = new Map()
  let verts = 0
  for (const group of groups.values()) {
    if (group.indices.length < 3) continue
    let mesh = cells.get(group.cell)
    if (!mesh) {
      mesh = doc.createMesh(`cell_${group.cell}`)
      cells.set(group.cell, mesh)
      scene.addChild(doc.createNode(`cell_${group.cell}`).setMesh(mesh))
    }
    const count = group.positions.length / 3
    verts += count
    const prim = doc.createPrimitive()
      .setMaterial(gltfMaterials.get(group.key))
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(group.positions)).setBuffer(buffer))
      .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(group.normals)).setBuffer(buffer))
      .setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(new Uint8Array(group.colors)).setNormalized(true).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(count > 65535 ? new Uint32Array(group.indices) : new Uint16Array(group.indices)).setBuffer(buffer))
    if (group.textured) {
      const uvs = quantizeUvs(group.uvs, boxes.get(group.key))
      prim.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(uvs).setNormalized(true).setBuffer(buffer))
    }
    mesh.addPrimitive(prim)
  }
  process.stdout.write(`${cells.size} cells, ${gltfMaterials.size} materials, ${textures.size} textures, ${verts} vertices\n`)
  await MeshoptEncoder.ready
  // OSM2World emits unindexed triangles; welding shares their corners before
  // compression. UVs are already on their grid, so quantize leaves them alone.
  await doc.transform(
    weld(),
    reorder({ encoder: MeshoptEncoder, target: 'size' }),
    quantize({ pattern: /^(POSITION|NORMAL|COLOR_0)$/, quantizeNormal: 8 }),
  )
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE })
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder })
  return io.writeBinary(doc)
}

const convert = (converter, elements) => new Promise((resolve, reject) => {
  const payload = JSON.stringify({ version: 0.6, elements })
  converter.convertJson(payload, (meshes) => resolve(meshes), (err) => reject(new Error(err?.a0v || 'conversion failed')), null)
})

await downloadModule()
const ENDPOINTS = [
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

const fetchTile = async (bbox) => {
  const headers = {
    'content-type': 'application/x-www-form-urlencoded',
    accept: 'application/json',
    'user-agent': 'sgp-circuit-city-bake/1.0',
  }
  const body = `data=${encodeURIComponent(tileQuery(...bbox))}`
  let last = 'no endpoint'
  for (const endpoint of ENDPOINTS) {
    const res = await fetch(endpoint, { method: 'POST', headers, body })
    if (res.ok) return res.json()
    last = `${endpoint} ${res.status}`
  }
  throw new Error(last)
}

const downloadOsm = async (city) => {
  const seen = new Map()
  for (const bbox of tiles(city)) {
    const label = bbox.map((n) => n.toFixed(4)).join(',')
    process.stdout.write(`${city.slug} tile ${label}\n`)
    const json = await fetchTile(bbox)
    json.elements.forEach((element) => {
      if (element.type === 'node' || element.type === 'way' || element.type === 'relation') {
        seen.set(`${element.type}/${element.id}`, element)
      }
    })
    process.stdout.write(`  ${seen.size} elements\n`)
  }
  writeFileSync(city.osmPath, JSON.stringify({ version: 0.6, elements: [...seen.values()] }))
}

const bakeCity = async (city) => {
  mkdirSync(dirname(city.outPath), { recursive: true })
  if (!existsSync(city.osmPath)) await downloadOsm(city)

  const { O2WConverter, loadO2WConfig } = await import(pathToFileURL(modulePath).href)
  const osm = JSON.parse(readFileSync(city.osmPath, 'utf8'))
  const raw = osm.elements.map(slim).filter(Boolean)
  // Ways that only clip the window still pull in far-away nodes, and those nodes
  // would drag OSM2World's origin out of the window. Keep a margin, then drop anything
  // that still reaches outside it.
  const { south, west, north, east } = city
  const MARGIN = 0.002
  const inside = (lat, lon) => lat >= south - MARGIN && lat <= north + MARGIN && lon >= west - MARGIN && lon <= east + MARGIN
  const keptNodes = raw.filter((element) => element.type === 'node' && inside(element.lat, element.lon))
  const nodeIds = new Set(keptNodes.map((node) => node.id))
  const keptWays = raw.filter((element) => element.type === 'way' && element.nodes.every((id) => nodeIds.has(id)))
  const wayIds = new Set(keptWays.map((way) => way.id))
  const keptRelations = raw.filter((element) => element.type === 'relation' && element.members.every((member) => {
    if (member.type === 'way') return wayIds.has(member.ref)
    if (member.type === 'node') return nodeIds.has(member.ref)
    return false
  }))
  const restored = restoreAreas({
    elements: raw,
    bounds: [south - MARGIN, west - MARGIN, north + MARGIN, east + MARGIN],
    keptWays: wayIds,
    keptRelations: new Set(keptRelations.map((relation) => relation.id)),
  })
  const { report } = restored
  process.stdout.write(`clipped ${report.ways} areas and ${report.relations} multipolygons to the window, ${report.sea} sea polygons\n`)
  const cleared = liftOverRoads([...keptNodes, ...keptWays, ...keptRelations, ...restored.elements])
  process.stdout.write(`lifted ${cleared.lifted.length} raised parts over roads to ${CLEARANCE_M} m\n`)
  const { elements, wheels } = replaceBigWheels(cleared.elements)
  wheels.forEach((wheel) => process.stdout.write(`big wheel ${wheel.name}: ${(2 * wheel.radius).toFixed(0)} m across, hub at ${wheel.hub.toFixed(0)} m\n`))
  // OSM2World centres its metres on the nodes it is given, so the origin is too.
  const allNodes = elements.filter((element) => element.type === 'node')
  const minLat = Math.min(...allNodes.map((node) => node.lat))
  const maxLat = Math.max(...allNodes.map((node) => node.lat))
  const minLon = Math.min(...allNodes.map((node) => node.lon))
  const maxLon = Math.max(...allNodes.map((node) => node.lon))
  const originLat = (minLat + maxLat) / 2
  const originLng = (minLon + maxLon) / 2
  process.stdout.write(`${city.slug}: ${elements.length} elements, origin ${originLat.toFixed(5)}, ${originLng.toFixed(5)}\n`)

  const config = await new Promise((resolve, reject) => {
    loadO2WConfig(styleUrl, {
      lod: '2',
      elevationCalculator: 'ZeroElevationCalculator',
      drivingSide: city.drivingSide,
      treesPerSquareMeter: '0.003',
    }, resolve, reject)
  })

  const converter = new O2WConverter()
  converter.setConfig(config)
  const started = Date.now()
  let meshes
  try {
    meshes = await convert(converter, elements)
  } catch (err) {
    process.stdout.write(`full extract failed (${err.message}); retrying without relations\n`)
    meshes = await convert(converter, elements.filter((element) => element.type !== 'relation'))
  }
  process.stdout.write(`${meshes.length} meshes in ${((Date.now() - started) / 1000).toFixed(1)}s\n`)

  const bucketed = bucketMeshes(meshes)
  const eastSpan = bucketed.eastMax - bucketed.eastMin
  const northSpan = bucketed.northMax - bucketed.northMin
  process.stdout.write(`span east ${eastSpan.toFixed(0)} m, north ${northSpan.toFixed(0)} m\n`)
  if (!(eastSpan > city.minEast && northSpan > city.minNorth) || (city.widerThanTall && !(eastSpan > northSpan))) {
    throw new Error(`${city.slug} city axes or extent do not match its window`)
  }

  const glb = await writeGlb(bucketed, originLng, originLat, wheels)
  writeFileSync(city.outPath, glb)
  process.stdout.write(`wrote ${city.outPath} (${(glb.length / 1e6).toFixed(1)} MB)\n`)
}

const wanted = process.argv.slice(2)
const names = wanted.length ? wanted : ['singapore']
for (const name of names) {
  const city = CITIES[name]
  if (!city) throw new Error(`unknown city ${name}`)
  await bakeCity(city)
}
process.exit(0)
