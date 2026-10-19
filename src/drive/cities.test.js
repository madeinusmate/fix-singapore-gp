import { readFileSync } from 'node:fs'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'
import { describe, expect, it } from 'vitest'
import { analyze } from '../sim/analyze.js'
import { loadGraph } from '../sim/route.js'
import { cityShift, cityUrl } from './city.js'
import { buildCourse } from './course.js'

const SLUGS = ['azerbaijan', 'monaco', 'las-vegas', 'miami', 'madrid']

const readCity = async (slug) => {
  await MeshoptDecoder.ready
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
  const file = new URL(`../../public/${cityUrl(slug)}`, import.meta.url)
  return io.readBinary(new Uint8Array(readFileSync(file)))
}

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

describe.each(SLUGS)('%s city mesh', (slug) => {
  it('is a textured city sitting under the raced lap', async () => {
    const doc = await readCity(slug)
    const graph = loadGraph(JSON.parse(readFileSync(new URL(`../../public/data/${slug}/graph.json`, import.meta.url), 'utf8')))
    const current = JSON.parse(readFileSync(new URL(`../../public/data/${slug}/current.json`, import.meta.url), 'utf8'))
    const { originLng, originLat } = doc.getRoot().getDefaultScene().getExtras()
    const [[west, south], [east, north]] = graph.bounds
    expect(originLng).toBeGreaterThan(west - 0.01)
    expect(originLng).toBeLessThan(east + 0.01)
    expect(originLat).toBeGreaterThan(south - 0.01)
    expect(originLat).toBeLessThan(north + 0.01)
    expect(doc.getRoot().listTextures().length).toBeGreaterThan(5)
    const heights = positionsOf(doc, 40).map((p) => p[1])
    expect(Math.min(...heights)).toBeGreaterThan(-2)
    expect(Math.max(...heights)).toBeGreaterThan(8)

    const course = buildCourse(analyze(current.path, null, graph), graph)
    expect(course.projection).toEqual(graph.origin)
    const shift = cityShift(course.origin, originLng, originLat, course.projection)
    const cell = 40
    const occupied = new Set()
    positionsOf(doc, 8).forEach(([x, , z]) => {
      occupied.add(`${Math.floor((shift[0] + x) / cell)},${Math.floor((shift[2] + z) / cell)}`)
    })
    let off = 0
    let samples = 0
    for (let i = 0; i < course.n; i += 40) {
      const cx = Math.floor(course.x[i] / cell)
      const cz = Math.floor(-course.y[i] / cell)
      samples += 1
      let close = false
      for (let dx = -1; dx <= 1 && !close; dx += 1) {
        for (let dz = -1; dz <= 1 && !close; dz += 1) close = occupied.has(`${cx + dx},${cz + dz}`)
      }
      if (!close) off += 1
    }
    expect(off / samples).toBeLessThan(0.08)
  })
})
