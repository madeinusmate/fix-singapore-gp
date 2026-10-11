import { describe, expect, it } from 'vitest'
import { CLEARANCE_M, liftOverRoads, spanOf } from './osm_clearance.mjs'

// A 20 m square part at the origin and a road through or beside it, ~1e-5 deg a metre.
const square = (id, tags, dx = 0) => [
  { type: 'node', id: id * 10 + 1, lat: 0, lon: dx },
  { type: 'node', id: id * 10 + 2, lat: 0, lon: dx + 0.0002 },
  { type: 'node', id: id * 10 + 3, lat: 0.0002, lon: dx + 0.0002 },
  { type: 'node', id: id * 10 + 4, lat: 0.0002, lon: dx },
  { type: 'way', id, nodes: [id * 10 + 1, id * 10 + 2, id * 10 + 3, id * 10 + 4, id * 10 + 1], tags },
]
const road = (tags) => [
  { type: 'node', id: 901, lat: 0.0001, lon: -0.001 },
  { type: 'node', id: 902, lat: 0.0001, lon: 0.001 },
  { type: 'way', id: 900, nodes: [901, 902], tags: { highway: 'primary', ...tags } },
]
const link = { 'building:part': 'yes', 'building:min_level': '1', 'building:levels': '3' }
const way = (elements, id) => elements.find((e) => e.type === 'way' && e.id === id)

describe('clearance over roads', () => {
  it('reads raised parts from min_height or levels', () => {
    expect(spanOf(link)).toEqual({ bottom: 2.5, top: 7.5 })
    expect(spanOf({ building: 'yes', min_height: '4.5', height: '6' })).toEqual({ bottom: 4.5, top: 6 })
    expect(spanOf({ building: 'yes', height: '20' })).toBeNull()
    expect(spanOf({ highway: 'primary', min_height: '3' })).toBeNull()
  })

  it('lifts a level-1 link bridge over a street, keeping its thickness', () => {
    const { elements, lifted } = liftOverRoads([...square(1, link), ...road()])
    expect(lifted).toEqual([1])
    const tags = way(elements, 1).tags
    expect(Number(tags.min_height)).toBe(CLEARANCE_M)
    expect(Number(tags.height)).toBe(CLEARANCE_M + 5)
    expect(tags['building:min_level']).toBeUndefined()
  })

  it('leaves parts beside the road, over tunnels, or already high enough', () => {
    expect(liftOverRoads([...square(1, link, 0.003), ...road()]).lifted).toEqual([])
    expect(liftOverRoads([...square(1, link), ...road({ tunnel: 'yes' })]).lifted).toEqual([])
    expect(liftOverRoads([...square(1, { building: 'yes', min_height: '6', height: '9' }), ...road()]).lifted).toEqual([])
    expect(liftOverRoads([...square(1, { building: 'yes', height: '9' }), ...road()]).lifted).toEqual([])
  })
})
