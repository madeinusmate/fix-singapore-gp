// Bakes the Marina Bay extract into public/data/city.bin with OSM2World.
// The drive scene keeps its own road and car; this mesh is the city around them.
// OSM2World metres are +X east, +Y up, +Z north, with the origin at the centre
// of the extract. The file stores scene metres: +X east, +Y up, +Z south.
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cache = join(root, 'analysis', '.cache')
const modulePath = join(cache, 'osm2world-core-web.mjs')
const osmPath = join(cache, 'marina.json')
const outPath = join(root, 'public', 'data', 'city.bin')
const moduleUrl = 'https://osm2world.org/build/web/0.5.0-SNAPSHOT_2026-06-16/osm2world-core-web.mjs'
const styleUrl = 'https://tiles.osm2world.org/styles/default/standard.properties'

// Same window as analysis/export_web.py, so every street in the graph has a city around it.
const SOUTH = 1.272
const WEST = 103.838
const NORTH = 1.304
const EAST = 103.878
const CELL_M = 400

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

const tiles = () => {
  const rows = 4
  const cols = 4
  const out = []
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      out.push([
        SOUTH + ((NORTH - SOUTH) * row) / rows,
        WEST + ((EAST - WEST) * col) / cols,
        SOUTH + ((NORTH - SOUTH) * (row + 1)) / rows,
        WEST + ((EAST - WEST) * (col + 1)) / cols,
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
  if (raw && raw.length) {
    const out = new Uint32Array(raw.length)
    for (let i = 0; i < raw.length; i += 1) out[i] = raw[i]
    return out
  }
  const out = new Uint32Array(verts)
  for (let i = 0; i < verts; i += 1) out[i] = i
  return out
}

const colorOf = (mesh) => {
  const color = mesh.color?.()
  const channel = (i) => Math.max(0, Math.min(255, Math.round((color?.[i] ?? 0.6) * 255)))
  return [channel(0), channel(1), channel(2)]
}

// Reflecting north onto -Z reverses winding, so triangles are stored a,c,b.
const bucketMeshes = (meshes) => {
  const cells = new Map()
  let eastMin = Infinity
  let eastMax = -Infinity
  let northMin = Infinity
  let northMax = -Infinity
  meshes.forEach((mesh, meshIndex) => {
    const src = mesh.positions()
    if (!src || src.length < 9) return
    const verts = src.length / 3
    const east = new Float32Array(verts)
    const north = new Float32Array(verts)
    const up = new Float32Array(verts)
    for (let i = 0; i < verts; i += 1) {
      east[i] = src[i * 3]
      up[i] = src[i * 3 + 1]
      north[i] = src[i * 3 + 2]
      if (east[i] < eastMin) eastMin = east[i]
      if (east[i] > eastMax) eastMax = east[i]
      if (north[i] < northMin) northMin = north[i]
      if (north[i] > northMax) northMax = north[i]
    }
    const [r, g, b] = colorOf(mesh)
    const idx = indexOf(mesh, verts)
    const tag = meshIndex * 0x1000000
    for (let t = 0; t + 2 < idx.length; t += 3) {
      const a = idx[t]
      const bI = idx[t + 1]
      const c = idx[t + 2]
      if (a === bI || bI === c || c === a) continue
      const finite = (i) => Number.isFinite(east[i]) && Number.isFinite(up[i]) && Number.isFinite(north[i]) && up[i] > -1 && up[i] < 420
      if (!finite(a) || !finite(bI) || !finite(c)) continue
      const ce = (east[a] + east[bI] + east[c]) / 3
      const cs = -((north[a] + north[bI] + north[c]) / 3)
      const key = `${Math.floor(ce / CELL_M)},${Math.floor(cs / CELL_M)}`
      let cell = cells.get(key)
      if (!cell) {
        cell = { map: new Map(), positions: [], colors: [], indices: [] }
        cells.set(key, cell)
      }
      const use = (i) => {
        const idKey = tag + i
        let id = cell.map.get(idKey)
        if (id == null) {
          id = cell.positions.length / 3
          cell.map.set(idKey, id)
          cell.positions.push(east[i], up[i], -north[i])
          cell.colors.push(r, g, b)
        }
        return id
      }
      cell.indices.push(use(a), use(c), use(b))
    }
  })
  return { cells, eastMin, eastMax, northMin, northMax }
}

const encode = (originLng, originLat, cells) => {
  const chunks = [...cells.values()].filter((cell) => cell.indices.length >= 3)
  const pad = (n) => (n + 3) & ~3
  let bytes = 28
  chunks.forEach((cell) => {
    const verts = cell.positions.length / 3
    bytes += 8 + verts * 12 + pad(verts * 3) + cell.indices.length * 4
  })
  const buffer = Buffer.alloc(bytes)
  buffer.write('CITY', 0, 'ascii')
  let o = 4
  buffer.writeUInt32LE(1, o); o += 4
  buffer.writeDoubleLE(originLng, o); o += 8
  buffer.writeDoubleLE(originLat, o); o += 8
  buffer.writeUInt32LE(chunks.length, o); o += 4
  chunks.forEach((cell) => {
    const verts = cell.positions.length / 3
    buffer.writeUInt32LE(verts, o); o += 4
    buffer.writeUInt32LE(cell.indices.length, o); o += 4
    for (let i = 0; i < cell.positions.length; i += 1) {
      buffer.writeFloatLE(cell.positions[i], o)
      o += 4
    }
    for (let i = 0; i < cell.colors.length; i += 1) buffer[o + i] = cell.colors[i]
    o += pad(cell.colors.length)
    for (let i = 0; i < cell.indices.length; i += 1) {
      buffer.writeUInt32LE(cell.indices[i], o)
      o += 4
    }
  })
  if (o !== bytes) throw new Error(`size mismatch ${o} != ${bytes}`)
  return buffer
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

const downloadOsm = async () => {
  const seen = new Map()
  for (const bbox of tiles()) {
    const label = bbox.map((n) => n.toFixed(4)).join(',')
    process.stdout.write(`tile ${label}\n`)
    const json = await fetchTile(bbox)
    json.elements.forEach((element) => {
      if (element.type === 'node' || element.type === 'way' || element.type === 'relation') {
        seen.set(`${element.type}/${element.id}`, element)
      }
    })
    process.stdout.write(`  ${seen.size} elements\n`)
  }
  writeFileSync(osmPath, JSON.stringify({ version: 0.6, elements: [...seen.values()] }))
}

if (!existsSync(osmPath)) await downloadOsm()

const { O2WConverter, loadO2WConfig } = await import(pathToFileURL(modulePath).href)
const osm = JSON.parse(readFileSync(osmPath, 'utf8'))
const raw = osm.elements.map(slim).filter(Boolean)
// Ways that only clip the window still pull in far-away nodes, and those nodes
// would drag OSM2World's origin out of the bay. Keep a margin, then drop anything
// that still reaches outside it.
const MARGIN = 0.002
const inside = (lat, lon) => lat >= SOUTH - MARGIN && lat <= NORTH + MARGIN && lon >= WEST - MARGIN && lon <= EAST + MARGIN
const keptNodes = raw.filter((element) => element.type === 'node' && inside(element.lat, element.lon))
const nodeIds = new Set(keptNodes.map((node) => node.id))
const keptWays = raw.filter((element) => element.type === 'way' && element.nodes.every((id) => nodeIds.has(id)))
const wayIds = new Set(keptWays.map((way) => way.id))
const keptRelations = raw.filter((element) => element.type === 'relation' && element.members.every((member) => {
  if (member.type === 'way') return wayIds.has(member.ref)
  if (member.type === 'node') return nodeIds.has(member.ref)
  return false
}))
const elements = [...keptNodes, ...keptWays, ...keptRelations]
const nodes = keptNodes
const minLat = Math.min(...nodes.map((node) => node.lat))
const maxLat = Math.max(...nodes.map((node) => node.lat))
const minLon = Math.min(...nodes.map((node) => node.lon))
const maxLon = Math.max(...nodes.map((node) => node.lon))
const originLat = (minLat + maxLat) / 2
const originLng = (minLon + maxLon) / 2
process.stdout.write(`${elements.length} elements, origin ${originLat.toFixed(5)}, ${originLng.toFixed(5)}\n`)

const config = await new Promise((resolve, reject) => {
  loadO2WConfig(styleUrl, {
    lod: '2',
    elevationCalculator: 'ZeroElevationCalculator',
    drivingSide: 'left',
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

const { cells, eastMin, eastMax, northMin, northMax } = bucketMeshes(meshes)
const eastSpan = eastMax - eastMin
const northSpan = northMax - northMin
process.stdout.write(`span east ${eastSpan.toFixed(0)} m, north ${northSpan.toFixed(0)} m, chunks ${cells.size}\n`)
if (!(eastSpan > northSpan && eastSpan > 1500 && northSpan > 1000)) {
  throw new Error('city axes or extent do not match the Marina Bay extract')
}

const buffer = encode(originLng, originLat, cells)
writeFileSync(outPath, buffer)
process.stdout.write(`wrote ${outPath} (${(buffer.length / 1e6).toFixed(1)} MB)\n`)
process.exit(0)
