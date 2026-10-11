// Turns "F1 2022" by Blender458 (CC BY 4.0, https://sketchfab.com/3d-models/f5b9ca6095124bf796934c150d178a02)
// into public/drive/f1.glb for the drive scene. The source mesh is the FetchCFD
// glb export of that model. Changes: nose turned to +X, scaled to a 3.6 m
// wheelbase, wheels split onto steer and spin pivots, body paint merged into
// one "livery" material, rims given a spoke texture, mesh compressed.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Document, NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions'
import { meshopt, weld } from '@gltf-transform/functions'
import { MeshoptEncoder } from 'meshoptimizer'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cache = join(root, 'analysis', '.cache')
const outPath = join(root, 'public', 'drive', 'f1.glb')
const sourceUrl = 'https://raw.githubusercontent.com/Pilot123321/RM-RAIN-MASTER/main/public/assets/f1.glb'
const SOURCE_SHA1 = 'b2125912afce802035d0ae9975bd8701dce78952'

const WHEELBASE_M = 3.6
// Source paint is this dark red; every material carrying it becomes the livery.
const PAINT = [0.0612, 0.0012, 0.004]

mkdirSync(cache, { recursive: true })
mkdirSync(dirname(outPath), { recursive: true })

const sourcePath = join(cache, 'f1_source.glb')
if (!existsSync(sourcePath)) {
  const res = await fetch(sourceUrl)
  if (!res.ok) throw new Error(`${res.status} ${sourceUrl}`)
  writeFileSync(sourcePath, Buffer.from(await res.arrayBuffer()))
}
const sourceBytes = readFileSync(sourcePath)
const sha1 = createHash('sha1').update(sourceBytes).digest('hex')
if (sha1 !== SOURCE_SHA1) throw new Error(`unexpected source ${sha1}`)

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder })
const src = await io.readBinary(new Uint8Array(sourceBytes))

// Flatten every primitive into plain triangle soup with its material name.
const parts = []
src.getRoot().listNodes().forEach((node) => {
  const mesh = node.getMesh()
  if (!mesh) return
  const matrix = node.getWorldMatrix()
  const identity = matrix.every((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0)) < 1e-9)
  if (!identity) throw new Error('source nodes are expected to carry no transforms')
  mesh.listPrimitives().forEach((prim) => {
    const material = prim.getMaterial()
    parts.push({
      material: material?.getName() || 'null',
      color: material ? material.getBaseColorFactor().slice(0, 3) : [1, 1, 1],
      positions: prim.getAttribute('POSITION').getArray(),
      normals: prim.getAttribute('NORMAL').getArray(),
      indices: prim.getIndices().getArray(),
    })
  })
})

const boundsOf = (positions, indices = null) => {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  const visit = (i) => {
    for (let k = 0; k < 3; k += 1) {
      min[k] = Math.min(min[k], positions[i * 3 + k])
      max[k] = Math.max(max[k], positions[i * 3 + k])
    }
  }
  if (indices) indices.forEach(visit)
  else for (let i = 0; i < positions.length / 3; i += 1) visit(i)
  return { min, max }
}

const tyre = parts.find((part) => part.material === 'tyre')
const all = boundsOf(tyre.positions)
const midX = (all.min[0] + all.max[0]) / 2
const midZ = (all.min[2] + all.max[2]) / 2

// The four tyres share one mesh: split its triangles by corner.
const cornerOf = (x, z) => `${z > midZ ? 'F' : 'R'}${x > midX ? 'L' : 'R'}`
const tyreTris = { FL: [], FR: [], RL: [], RR: [] }
for (let t = 0; t < tyre.indices.length; t += 3) {
  const [a, b, c] = [tyre.indices[t], tyre.indices[t + 1], tyre.indices[t + 2]]
  const cx = (tyre.positions[a * 3] + tyre.positions[b * 3] + tyre.positions[c * 3]) / 3
  const cz = (tyre.positions[a * 3 + 2] + tyre.positions[b * 3 + 2] + tyre.positions[c * 3 + 2]) / 3
  tyreTris[cornerOf(cx, cz)].push(a, b, c)
}
const wheels = Object.fromEntries(Object.entries(tyreTris).map(([corner, indices]) => {
  const box = boundsOf(tyre.positions, indices)
  const center = box.min.map((v, k) => (v + box.max[k]) / 2)
  return [corner, { corner, box, center, radius: (box.max[1] - box.min[1]) / 2, indices }]
}))
const frontZ = (wheels.FL.center[2] + wheels.FR.center[2]) / 2
const rearZ = (wheels.RL.center[2] + wheels.RR.center[2]) / 2
const groundY = Math.min(...Object.values(wheels).map((wheel) => wheel.box.min[1]))
const scale = WHEELBASE_M / (frontZ - rearZ)
const origin = [midX, groundY, (frontZ + rearZ) / 2]
process.stdout.write(`scale ${scale.toFixed(3)}, tyre radius ${(wheels.FL.radius * scale).toFixed(3)} m\n`)

// Source: +Z forward, +Y up. Car frame: +X forward, +Y up, +Z to the right.
const toCar = (x, y, z) => [(z - origin[2]) * scale, (y - origin[1]) * scale, -(x - origin[0]) * scale]
const turnNormal = (x, y, z) => [z, y, -x]

const inside = (box, outer, pad) => box.min.every((v, k) => v >= outer.min[k] - pad) && box.max.every((v, k) => v <= outer.max[k] + pad)

const isPaint = (color) => color.every((v, k) => Math.abs(v - PAINT[k]) < 0.01)
const groupOf = (part) => {
  if (part.material === 'tyre') return 'tyre'
  if (isPaint(part.color)) return 'livery'
  if (part.color.every((v) => v > 0.7)) return 'accent'
  if (/dial|screen|spin_dial|material$/.test(part.material)) return 'cockpit'
  return 'carbon'
}

// Buckets keyed by node then material, each a triangle soup in car metres.
const buckets = new Map()
const bucket = (node, material) => {
  const key = `${node}|${material}`
  if (!buckets.has(key)) buckets.set(key, { node, material, positions: [], normals: [], uvs: [], indices: [] })
  return buckets.get(key)
}
const pushTris = (target, part, indices, offset = [0, 0, 0], uvOf = null) => {
  const map = new Map()
  indices.forEach((i) => {
    let id = map.get(i)
    if (id == null) {
      id = target.positions.length / 3
      map.set(i, id)
      const p = toCar(part.positions[i * 3], part.positions[i * 3 + 1], part.positions[i * 3 + 2])
      target.positions.push(p[0] - offset[0], p[1] - offset[1], p[2] - offset[2])
      target.normals.push(...turnNormal(part.normals[i * 3], part.normals[i * 3 + 1], part.normals[i * 3 + 2]))
      if (uvOf) target.uvs.push(...uvOf(part.positions[i * 3], part.positions[i * 3 + 1], part.positions[i * 3 + 2]))
    }
    target.indices.push(id)
  })
}

const pivots = Object.fromEntries(Object.values(wheels).map((wheel) => [wheel.corner, toCar(...wheel.center)]))
Object.values(wheels).forEach((wheel) => pushTris(bucket(`spin_${wheel.corner}`, 'tyre'), tyre, wheel.indices, pivots[wheel.corner]))

// The source rims face inboard only, so each wheel gets an outer cover disc
// carrying the spoke texture; it is what shows the wheel turning.
const RIM_SHARE = 0.63
const SEGMENTS = 48
Object.values(wheels).forEach((wheel) => {
  const left = wheel.corner.endsWith('L')
  const x = left ? wheel.box.max[0] + 0.002 : wheel.box.min[0] - 0.002
  const r = wheel.radius * RIM_SHARE
  const [cy, cz] = [wheel.center[1], wheel.center[2]]
  const ring = [[x, cy, cz]]
  for (let k = 0; k < SEGMENTS; k += 1) {
    const a = (k / SEGMENTS) * Math.PI * 2
    ring.push([x, cy + Math.sin(a) * r, cz + Math.cos(a) * r])
  }
  const disc = {
    positions: ring.flat(),
    normals: ring.flatMap(() => [left ? 1 : -1, 0, 0]),
    indices: [],
  }
  for (let k = 0; k < SEGMENTS; k += 1) {
    const a = k + 1
    const b = ((k + 1) % SEGMENTS) + 1
    if (left) disc.indices.push(0, b, a)
    else disc.indices.push(0, a, b)
  }
  const d = r * 2
  const uv = (_x, y, z) => [0.5 + (left ? 1 : -1) * (z - cz) / d, 0.5 - (y - cy) / d]
  pushTris(bucket(`spin_${wheel.corner}`, 'rim'), disc, disc.indices, pivots[wheel.corner], uv)
})

parts.forEach((part) => {
  if (part === tyre) return
  const box = boundsOf(part.positions)
  const wheel = Object.values(wheels).find((w) => inside(box, w.box, 0.02))
  if (wheel) {
    const d = (box.max[1] - box.min[1]) || 1
    const rimUv = (_x, y, z) => [0.5 + (z - wheel.center[2]) / d, 0.5 - (y - wheel.center[1]) / d]
    pushTris(bucket(`spin_${wheel.corner}`, 'rim'), part, Array.from(part.indices), pivots[wheel.corner], rimUv)
    return
  }
  const front = [wheels.FL, wheels.FR].find((w) => inside(box, w.box, 0.06))
  if (front) {
    pushTris(bucket(`steer_${front.corner}`, groupOf(part)), part, Array.from(part.indices), pivots[front.corner])
    return
  }
  pushTris(bucket('body', groupOf(part)), part, Array.from(part.indices))
})

const rimSvg = () => {
  const spokes = Array.from({ length: 10 }, (_, k) => {
    const a = (k / 10) * Math.PI * 2
    const x = 256 + Math.cos(a) * 200
    const y = 256 + Math.sin(a) * 200
    return `<line x1="256" y1="256" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#9a9ca3" stroke-width="22" stroke-linecap="round"/>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
    <rect width="512" height="512" fill="#0d0d0f"/>
    <circle cx="256" cy="256" r="250" fill="#18191c"/>
    <circle cx="256" cy="256" r="236" fill="none" stroke="#f5c400" stroke-width="16"/>
    <circle cx="256" cy="256" r="214" fill="#232428"/>
    ${spokes}
    <circle cx="256" cy="256" r="58" fill="#3a3c42"/>
    <circle cx="256" cy="256" r="26" fill="#111"/>
  </svg>`
}

const doc = new Document()
doc.createExtension(EXTTextureWebP).setRequired(true)
const buffer = doc.createBuffer()
const rimTexture = doc.createTexture('rim')
  .setImage(await sharp(Buffer.from(rimSvg())).webp({ quality: 85 }).toBuffer())
  .setMimeType('image/webp')
const materials = {
  livery: doc.createMaterial('livery').setBaseColorFactor([0.75, 0.02, 0.02, 1]).setRoughnessFactor(0.32).setMetallicFactor(0.35),
  accent: doc.createMaterial('accent').setBaseColorFactor([0.8, 0.8, 0.8, 1]).setRoughnessFactor(0.4).setMetallicFactor(0.1),
  carbon: doc.createMaterial('carbon').setBaseColorFactor([0.018, 0.018, 0.02, 1]).setRoughnessFactor(0.38).setMetallicFactor(0.25),
  cockpit: doc.createMaterial('cockpit').setBaseColorFactor([0.2, 0.2, 0.22, 1]).setRoughnessFactor(0.5).setMetallicFactor(0.1),
  tyre: doc.createMaterial('tyre').setBaseColorFactor([0.03, 0.03, 0.032, 1]).setRoughnessFactor(0.92).setMetallicFactor(0),
  rim: doc.createMaterial('rim').setBaseColorTexture(rimTexture).setRoughnessFactor(0.35).setMetallicFactor(0.6),
}
Object.values(materials).forEach((material) => material.setDoubleSided(true))

const scene = doc.createScene('f1').setExtras({
  source: 'F1 2022 by Blender458, https://sketchfab.com/3d-models/f5b9ca6095124bf796934c150d178a02',
  license: 'CC BY 4.0',
  wheelRadius: wheels.FL.radius * scale,
  wheelbase: WHEELBASE_M,
})
const car = doc.createNode('car')
scene.addChild(car)
const nodes = new Map()
const nodeFor = (name) => {
  if (nodes.has(name)) return nodes.get(name)
  const node = doc.createNode(name)
  nodes.set(name, node)
  const [kind, corner] = name.split('_')
  if (kind === 'body') car.addChild(node)
  if (kind === 'steer') node.setTranslation(pivots[corner])
  if (kind === 'spin') {
    if (corner.startsWith('F')) nodeFor(`steer_${corner}`).addChild(node)
    else node.setTranslation(pivots[corner])
  }
  if (kind === 'steer' || (kind === 'spin' && corner.startsWith('R'))) car.addChild(node)
  return node
}
;['body', 'steer_FL', 'steer_FR', 'spin_FL', 'spin_FR', 'spin_RL', 'spin_RR'].forEach(nodeFor)
for (const b of buckets.values()) {
  const node = nodeFor(b.node)
  if (!node.getMesh()) node.setMesh(doc.createMesh(b.node))
  const prim = doc.createPrimitive()
    .setMaterial(materials[b.material])
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(b.positions)).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(b.normals)).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(b.indices)).setBuffer(buffer))
  if (b.uvs.length) prim.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(b.uvs)).setBuffer(buffer))
  node.getMesh().addPrimitive(prim)
}

await MeshoptEncoder.ready
await doc.transform(weld(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }))
const glb = await io.writeBinary(doc)
writeFileSync(outPath, glb)
const counts = [...buckets.values()].map((b) => `${b.node}/${b.material}:${b.positions.length / 3}`).join(' ')
process.stdout.write(`${counts}\nwrote ${outPath} (${(glb.length / 1e3).toFixed(0)} kB)\n`)
