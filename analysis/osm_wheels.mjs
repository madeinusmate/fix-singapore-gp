// Big wheels. OSM traces the Singapore Flyer's disc with 29 stacked solid
// building parts, which OSM2World draws as a sliced wall. The parts and the
// wheel's outline are dropped from the bake, and the wheel is kept as a few
// numbers that the drive scene builds into a rim, spokes and capsules
// (src/drive/bigWheel.js).
import { inside } from './osm_clearance.mjs'

const M_PER_DEG = 111320

const metres = (value) => {
  const n = Number.parseFloat(value)
  return Number.isFinite(n) ? n : null
}

const mean = (values) => values.reduce((sum, v) => sum + v, 0) / values.length

// Returns the elements without big wheels and, per wheel, its centre on the
// ground, hub height, outer radius and thickness in metres, and its heading:
// the direction of the wheel's plane, radians anticlockwise from east.
export const replaceBigWheels = (elements) => {
  const nodes = new Map(elements.filter((e) => e.type === 'node').map((n) => [n.id, n]))
  const ringOf = (way) => way.nodes.map((id) => nodes.get(id)).filter(Boolean)
  const outlines = elements.filter((e) => e.type === 'way' && e.tags?.attraction === 'big_wheel' && e.nodes.length >= 4)
  const parts = elements.filter((e) => e.type === 'way' && e.tags?.['building:part'])
  const dropped = new Set()
  const wheels = outlines.map((outline) => {
    const ring = ringOf(outline)
    const lat0 = mean(ring.map((n) => n.lat))
    const lng0 = mean(ring.map((n) => n.lon))
    const kx = M_PER_DEG * Math.cos((lat0 * Math.PI) / 180)
    const local = (n) => [(n.lon - lng0) * kx, (n.lat - lat0) * M_PER_DEG]
    const footprint = ring.map(local)
    const slabs = parts.filter((part) => {
      const pts = ringOf(part).map(local)
      return pts.length && inside(footprint, [mean(pts.map((p) => p[0])), mean(pts.map((p) => p[1]))])
    })
    dropped.add(outline.id)
    slabs.forEach((slab) => dropped.add(slab.id))

    const pts = slabs.length ? slabs.flatMap((slab) => ringOf(slab).map(local)) : footprint
    const mx = mean(pts.map((p) => p[0]))
    const my = mean(pts.map((p) => p[1]))
    let sxx = 0
    let syy = 0
    let sxy = 0
    pts.forEach(([x, y]) => {
      sxx += (x - mx) ** 2
      syy += (y - my) ** 2
      sxy += (x - mx) * (y - my)
    })
    const heading = 0.5 * Math.atan2(2 * sxy, sxx - syy)
    const u = [Math.cos(heading), Math.sin(heading)]
    const along = pts.map(([x, y]) => (x - mx) * u[0] + (y - my) * u[1])
    const across = pts.map(([x, y]) => -(x - mx) * u[1] + (y - my) * u[0])
    const [a0, a1] = [Math.min(...along), Math.max(...along)]
    const [b0, b1] = [Math.min(...across), Math.max(...across)]
    const radius = (a1 - a0) / 2
    const top = Math.max(-Infinity, ...[outline, ...slabs].map((e) => metres(e.tags.height)).filter((h) => h != null))
    const hub = top >= 2 * radius ? top - radius : radius
    const cx = mx + u[0] * (a0 + a1) / 2 - u[1] * (b0 + b1) / 2
    const cy = my + u[1] * (a0 + a1) / 2 + u[0] * (b0 + b1) / 2
    return {
      name: outline.tags.name ?? null,
      lng: lng0 + cx / kx,
      lat: lat0 + cy / M_PER_DEG,
      hub,
      radius,
      width: b1 - b0,
      heading,
    }
  })
  return { elements: elements.filter((e) => e.type !== 'way' || !dropped.has(e.id)), wheels }
}
