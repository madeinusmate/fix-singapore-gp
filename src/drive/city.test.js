import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { analyze } from '../sim/analyze.js'
import { toMetres } from '../sim/project.js'
import { loadGraph } from '../sim/route.js'
import { cityShift, parseCity } from './city.js'
import { buildCourse } from './course.js'

const tinyCity = () => {
  const verts = 3
  const colorBytes = verts * 3
  const padded = (colorBytes + 3) & ~3
  const bytes = 28 + 8 + verts * 12 + padded + 3 * 4
  const buffer = new ArrayBuffer(bytes)
  const view = new DataView(buffer)
  view.setUint8(0, 67)
  view.setUint8(1, 73)
  view.setUint8(2, 84)
  view.setUint8(3, 89)
  let offset = 4
  view.setUint32(offset, 1, true); offset += 4
  view.setFloat64(offset, 103.86, true); offset += 8
  view.setFloat64(offset, 1.29, true); offset += 8
  view.setUint32(offset, 1, true); offset += 4
  view.setUint32(offset, verts, true); offset += 4
  view.setUint32(offset, 3, true); offset += 4
  view.setFloat32(offset, 10, true); offset += 4
  view.setFloat32(offset, 0, true); offset += 4
  view.setFloat32(offset, -4, true); offset += 4
  view.setFloat32(offset, 0, true); offset += 4
  view.setFloat32(offset, 3, true); offset += 4
  view.setFloat32(offset, 0, true); offset += 4
  view.setFloat32(offset, 12, true); offset += 4
  view.setFloat32(offset, 6, true); offset += 4
  view.setFloat32(offset, -4, true); offset += 4
  const bytesView = new Uint8Array(buffer)
  bytesView.set([255, 0, 0, 0, 255, 0, 0, 0, 255], offset)
  offset += padded
  view.setUint32(offset, 0, true); offset += 4
  view.setUint32(offset, 1, true); offset += 4
  view.setUint32(offset, 2, true)
  return buffer
}

describe('city', () => {
  it('anchors the extract origin on the same metres as the lap', () => {
    const courseOrigin = [1000, 2000]
    const [ox, oy] = toMetres(103.86, 1.29)
    expect(cityShift(courseOrigin, 103.86, 1.29)).toEqual([ox - 1000, 0, -(oy - 2000)])
  })

  it('reads a chunk of scene-space vertices', () => {
    const city = parseCity(tinyCity())
    expect(city.originLng).toBeCloseTo(103.86)
    expect(city.originLat).toBeCloseTo(1.29)
    expect(city.chunks).toHaveLength(1)
    expect(city.chunks[0].positions[0]).toBeCloseTo(10)
    expect(city.chunks[0].positions[2]).toBeCloseTo(-4)
    expect(Array.from(city.chunks[0].indices)).toEqual([0, 1, 2])
    expect(Array.from(city.chunks[0].colors.slice(0, 3))).toEqual([255, 0, 0])
  })

  it('reads the baked bay', () => {
    const file = readFileSync(new URL('../../public/data/city.bin', import.meta.url))
    const city = parseCity(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength))
    expect(city.originLat).toBeGreaterThan(1.27)
    expect(city.originLat).toBeLessThan(1.31)
    expect(city.originLng).toBeGreaterThan(103.83)
    expect(city.originLng).toBeLessThan(103.89)
    const verts = city.chunks.reduce((sum, chunk) => sum + chunk.positions.length / 3, 0)
    expect(city.chunks.length).toBeGreaterThan(4)
    expect(verts).toBeGreaterThan(10000)
  })

  it('lies under the current lap', () => {
    const graph = loadGraph(JSON.parse(readFileSync(new URL('../../public/data/graph.json', import.meta.url), 'utf8')))
    const current = JSON.parse(readFileSync(new URL('../../public/data/current.json', import.meta.url), 'utf8'))
    const course = buildCourse(analyze(current.path, null, graph), graph)
    const file = readFileSync(new URL('../../public/data/city.bin', import.meta.url))
    const city = parseCity(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength))
    const shift = cityShift(course.origin, city.originLng, city.originLat)
    const cell = 40
    const occupied = new Set()
    city.chunks.forEach((chunk) => {
      const positions = chunk.positions
      for (let i = 0; i < positions.length; i += 30) {
        const x = shift[0] + positions[i]
        const z = shift[2] + positions[i + 2]
        occupied.add(`${Math.floor(x / cell)},${Math.floor(z / cell)}`)
      }
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
