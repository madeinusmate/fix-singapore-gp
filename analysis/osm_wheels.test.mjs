import { describe, expect, it } from 'vitest'
import { replaceBigWheels } from './osm_wheels.mjs'

const M = 111320
const HEADING = Math.PI / 6
const CENTRE = [20, -10]
const RADIUS = 50
const HUB = 60

// Plane metres to an OSM node, near lat 0 so a degree is M metres both ways.
let nextId = 1
const node = ([x, y]) => ({ type: 'node', id: nextId++, lat: y / M, lon: x / M })
const at = (along, across) => [
  CENTRE[0] + along * Math.cos(HEADING) - across * Math.sin(HEADING),
  CENTRE[1] + along * Math.sin(HEADING) + across * Math.cos(HEADING),
]
const way = (corners, tags) => {
  const ns = corners.map(node)
  return [...ns, { type: 'way', id: nextId++, nodes: [...ns.map((n) => n.id), ns[0].id], tags }]
}

// The wheel as OSM maps the Flyer: 5 m slabs across its plane, each as tall as the disc there.
const slabs = () => {
  const out = []
  for (let s = -RADIUS; s < RADIUS; s += 5) {
    const mid = Math.min(Math.abs(s), Math.abs(s + 5))
    const half = Math.sqrt(RADIUS ** 2 - mid ** 2)
    out.push(...way([at(s, -3), at(s + 5, -3), at(s + 5, 3), at(s, 3)], {
      'building:part': 'yes', min_height: String(HUB - half), height: String(HUB + half),
    }))
  }
  return out
}
const outline = () => way([at(-RADIUS, -4), at(RADIUS, -4), at(RADIUS, 4), at(-RADIUS, 4)], {
  building: 'yes', attraction: 'big_wheel', name: 'Test Wheel', height: '0',
})
const terminal = () => way([at(-30, 20), at(30, 20), at(30, 40), at(-30, 40)], { building: 'retail', height: '12' })

describe('big wheels', () => {
  it('turns stacked slabs into one wheel with its size and heading', () => {
    const input = [...outline(), ...slabs(), ...terminal()]
    const { elements, wheels } = replaceBigWheels(input)
    expect(wheels).toHaveLength(1)
    const [wheel] = wheels
    expect(wheel.name).toBe('Test Wheel')
    expect(wheel.radius).toBeCloseTo(RADIUS, 0)
    expect(wheel.hub).toBeCloseTo(HUB, 0)
    expect(wheel.width).toBeCloseTo(6, 0)
    expect(Math.abs(Math.sin(wheel.heading - HEADING))).toBeLessThan(0.01)
    expect(Math.hypot(wheel.lng * M - CENTRE[0], wheel.lat * M - CENTRE[1])).toBeLessThan(0.5)
    const ways = elements.filter((e) => e.type === 'way')
    expect(ways).toHaveLength(1)
    expect(ways[0].tags.building).toBe('retail')
    expect(elements.filter((e) => e.type === 'node')).toHaveLength(input.filter((e) => e.type === 'node').length)
  })

  it('leaves a city without big wheels alone', () => {
    const input = [...slabs(), ...terminal()]
    const { elements, wheels } = replaceBigWheels(input)
    expect(wheels).toEqual([])
    expect(elements).toEqual(input)
  })
})
