import { readFileSync } from 'node:fs'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'
import { beforeAll, describe, expect, it } from 'vitest'
import { analyze } from '../sim/analyze.js'
import { toMetres } from '../sim/project.js'
import { loadGraph } from '../sim/route.js'
import { CITY_URL, cityShift } from './city.js'
import { buildCourse } from './course.js'

const cityFile = new URL(`../../public/${CITY_URL}`, import.meta.url)

// Scene-space vertex positions of every primitive, every `stride`-th vertex.
const positionsOf = (doc, stride) => {
  const out = []
  const point = [0, 0, 0]
  doc.getRoot().listNodes().forEach((node) => {
    const mesh = node.getMesh()
    if (!mesh) return
    const m = node.getWorldMatrix()
    mesh.listPrimitives().forEach((prim) => {
      const position = prim.getAttribute('POSITION')
      for (let i = 0; i < position.getCount(); i += stride) {
        position.getElement(i, point)
        const [x, y, z] = point
        out.push([m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]])
      }
    })
  })
  return out
}

// Ground-level water triangles as flat [x, z] triples, in the glb's own metres.
const waterTriangles = (doc) => {
  const out = []
  const point = [0, 0, 0]
  doc.getRoot().listNodes().forEach((node) => {
    const mesh = node.getMesh()
    if (!mesh) return
    const m = node.getWorldMatrix()
    mesh.listPrimitives().forEach((prim) => {
      if (!/Water/.test(prim.getMaterial()?.getName() ?? '')) return
      const position = prim.getAttribute('POSITION')
      const corners = []
      for (let i = 0; i < position.getCount(); i += 1) {
        position.getElement(i, point)
        const [x, y, z] = point
        corners.push([m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]])
      }
      const index = prim.getIndices()?.getArray() ?? corners.map((_, i) => i)
      for (let i = 0; i + 2 < index.length; i += 3) {
        const tri = [corners[index[i]], corners[index[i + 1]], corners[index[i + 2]]]
        if (tri.every((c) => c[1] < 1)) out.push(tri.map(([x, , z]) => [x, z]))
      }
    })
  })
  return out
}

// Lowest corner of every triangle above the [x, z] point, in the glb's own metres.
const heightsOver = (doc, at) => {
  const out = []
  const point = [0, 0, 0]
  doc.getRoot().listNodes().forEach((node) => {
    const mesh = node.getMesh()
    if (!mesh) return
    const m = node.getWorldMatrix()
    mesh.listPrimitives().forEach((prim) => {
      const position = prim.getAttribute('POSITION')
      const corners = []
      for (let i = 0; i < position.getCount(); i += 1) {
        position.getElement(i, point)
        const [x, y, z] = point
        corners.push([m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]])
      }
      const index = prim.getIndices()?.getArray() ?? corners.map((_, i) => i)
      for (let i = 0; i + 2 < index.length; i += 3) {
        const tri = [corners[index[i]], corners[index[i + 1]], corners[index[i + 2]]]
        const flat = tri.map(([x, , z]) => [x, z])
        if (triangleArea(flat) > 0.01 && covers(flat, at)) out.push(Math.min(...tri.map((c) => c[1])))
      }
    })
  })
  return out.sort((a, b) => a - b)
}

const triangleArea = ([a, b, c]) => Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2

const covers = ([a, b, c], [x, z]) => {
  const side = (p, q) => (q[0] - p[0]) * (z - p[1]) - (q[1] - p[1]) * (x - p[0])
  const s = [side(a, b), side(b, c), side(c, a)]
  return s.every((v) => v >= 0) || s.every((v) => v <= 0)
}

describe('city', () => {
  let doc
  beforeAll(async () => {
    await MeshoptDecoder.ready
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
    doc = await io.readBinary(new Uint8Array(readFileSync(cityFile)))
  })

  it('anchors the extract origin on the same metres as the lap', () => {
    const courseOrigin = [1000, 2000]
    const [ox, oy] = toMetres(103.86, 1.29)
    expect(cityShift(courseOrigin, 103.86, 1.29)).toEqual([ox - 1000, 0, -(oy - 2000)])
  })

  it('is the bay, in cells, with textured materials', () => {
    const { originLng, originLat } = doc.getRoot().getDefaultScene().getExtras()
    expect(originLat).toBeGreaterThan(1.27)
    expect(originLat).toBeLessThan(1.31)
    expect(originLng).toBeGreaterThan(103.83)
    expect(originLng).toBeLessThan(103.89)
    const root = doc.getRoot()
    expect(root.listNodes().filter((node) => node.getMesh()).length).toBeGreaterThan(4)
    const textures = root.listTextures()
    expect(textures.length).toBeGreaterThan(20)
    textures.forEach((texture) => expect(texture.getMimeType()).toBe('image/webp'))
    const names = root.listMaterials().map((material) => material.getName())
    expect(names).toEqual(expect.arrayContaining(['Asphalt010_Color', 'Windows_Color', 'P1140080E_Water']))
    root.listMeshes().forEach((mesh) => mesh.listPrimitives().forEach((prim) => {
      if (prim.getMaterial()?.getBaseColorTexture()) expect(prim.getAttribute('TEXCOORD_0')).toBeTruthy()
    }))
    const verts = root.listMeshes().reduce((sum, mesh) => sum + mesh.listPrimitives().reduce((s, prim) => s + prim.getAttribute('POSITION').getCount(), 0), 0)
    expect(verts).toBeGreaterThan(100000)
  })

  it('stands on the ground with buildings rising out of it', () => {
    const heights = positionsOf(doc, 50).map((p) => p[1])
    expect(Math.min(...heights)).toBeGreaterThan(-1.5)
    expect(Math.max(...heights)).toBeGreaterThan(150)
  })

  it('fills Marina Bay, the channel, Kallang Basin and the sea past the barrage with water', () => {
    const water = waterTriangles(doc)
    const area = water.reduce((sum, tri) => sum + triangleArea(tri), 0)
    expect(area).toBeGreaterThan(2.5e6)
    const { originLng, originLat } = doc.getRoot().getDefaultScene().getExtras()
    const [ox, oy] = toMetres(originLng, originLat)
    const wet = (lng, lat) => {
      const [x, y] = toMetres(lng, lat)
      return water.some((tri) => covers(tri, [x - ox, -(y - oy)]))
    }
    expect(wet(103.8575, 1.2860)).toBe(true)
    expect(wet(103.8693, 1.2854)).toBe(true)
    expect(wet(103.8682, 1.3008)).toBe(true)
    expect(wet(103.8760, 1.2760)).toBe(true)
    expect(wet(103.8520, 1.2931)).toBe(false)
  })

  it('leaves headroom under the Marina Square link bridge over Raffles Boulevard', () => {
    const { originLng, originLat } = doc.getRoot().getDefaultScene().getExtras()
    const [ox, oy] = toMetres(originLng, originLat)
    const [x, y] = toMetres(103.858057, 1.291886)
    const overhead = heightsOver(doc, [x - ox, -(y - oy)]).filter((h) => h > 0.5)
    expect(overhead.length).toBeGreaterThan(0)
    expect(overhead[0]).toBeGreaterThanOrEqual(5)
  })

  it('keeps the Singapore Flyer as a wheel rather than stacked slabs', () => {
    const { originLng, originLat, bigWheels } = doc.getRoot().getDefaultScene().getExtras()
    expect(bigWheels).toHaveLength(1)
    const [flyer] = bigWheels
    expect(flyer.name).toBe('Singapore Flyer')
    expect(2 * flyer.radius).toBeGreaterThan(140)
    expect(2 * flyer.radius).toBeLessThan(155)
    expect(Math.abs(flyer.hub + flyer.radius - 165)).toBeLessThan(3)
    const [ox, oy] = toMetres(originLng, originLat)
    const [x, y] = toMetres(flyer.lng, flyer.lat)
    expect(heightsOver(doc, [x - ox, -(y - oy)]).filter((h) => h > 20)).toEqual([])
  })

  it('lies under the current lap', () => {
    const graph = loadGraph(JSON.parse(readFileSync(new URL('../../public/data/graph.json', import.meta.url), 'utf8')))
    const current = JSON.parse(readFileSync(new URL('../../public/data/current.json', import.meta.url), 'utf8'))
    const course = buildCourse(analyze(current.path, null, graph), graph)
    const { originLng, originLat } = doc.getRoot().getDefaultScene().getExtras()
    const shift = cityShift(course.origin, originLng, originLat)
    const cell = 40
    const occupied = new Set()
    positionsOf(doc, 10).forEach(([x, , z]) => {
      occupied.add(`${Math.floor((shift[0] + x) / cell)},${Math.floor((shift[2] + z) / cell)}`)
    })
    let missed = 0
    let off = 0
    let samples = 0
    for (let i = 0; i < course.n; i += 50) {
      const cx = Math.floor(course.x[i] / cell)
      const cz = Math.floor(-course.y[i] / cell)
      samples += 1
      if (!occupied.has(`${cx},${cz}`)) missed += 1
      let close = false
      for (let dx = -1; dx <= 1 && !close; dx += 1) {
        for (let dz = -1; dz <= 1 && !close; dz += 1) close = occupied.has(`${cx + dx},${cz + dz}`)
      }
      if (!close) off += 1
    }
    expect(missed / samples).toBeLessThan(0.25)
    expect(off / samples).toBeLessThan(0.05)
  })
})
