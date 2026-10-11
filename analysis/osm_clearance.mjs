// Link bridges and overhangs across streets. OSM2World puts building:min_level
// at 2.5 m a level, so a level-1 link bridge hangs 2.5 m over the road, low
// enough for a chase camera to drive through it. Raised parts that cross a car
// road are lifted to CLEARANCE_M, keeping their thickness.

export const CLEARANCE_M = 5
const LEVEL_M = 2.5
const CELL_M = 50
const CAR_ROADS = new Set([
  'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'service', 'living_street',
  'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link',
])

const metres = (value) => {
  const n = Number.parseFloat(value)
  return Number.isFinite(n) ? n : null
}

const isGroundRoad = (tags) => !!tags && CAR_ROADS.has(tags.highway)
  && (!tags.tunnel || tags.tunnel === 'no') && (!tags.bridge || tags.bridge === 'no') && !(Number(tags.layer) < 0)

// Bottom and top of a raised building part, in metres, or null when it stands
// on the ground or its top is unknown.
export const spanOf = (tags) => {
  if (!tags || !(tags.building || tags['building:part'])) return null
  const minLevel = metres(tags['building:min_level'])
  const bottom = metres(tags.min_height) ?? (minLevel == null ? null : minLevel * LEVEL_M)
  if (!(bottom > 0)) return null
  const levels = metres(tags['building:levels'])
  const top = metres(tags.height) ?? (levels == null ? null : levels * LEVEL_M)
  if (!(top > bottom)) return null
  return { bottom, top }
}

const crosses = ([ax, ay], [bx, by], [cx, cy], [dx, dy]) => {
  const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx)
  if (d === 0) return false
  const s = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d
  const t = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d
  return s >= 0 && s <= 1 && t >= 0 && t <= 1
}

const inside = (ring, [x, y]) => {
  let hit = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

// Returns the elements with raised parts over car roads lifted, and the ids it lifted.
export const liftOverRoads = (elements) => {
  const nodes = new Map()
  let lat0 = 0
  let count = 0
  elements.forEach((e) => {
    if (e.type !== 'node') return
    lat0 += e.lat
    count += 1
  })
  const k = Math.cos(((count ? lat0 / count : 0) * Math.PI) / 180)
  elements.forEach((e) => {
    if (e.type === 'node') nodes.set(e.id, [e.lon * 111320 * k, e.lat * 110574])
  })
  const pointsOf = (way) => way.nodes.map((id) => nodes.get(id)).filter(Boolean)
  const cellKey = (x, y) => `${Math.floor(x / CELL_M)},${Math.floor(y / CELL_M)}`

  const grid = new Map()
  elements.forEach((e) => {
    if (e.type !== 'way' || !isGroundRoad(e.tags)) return
    const pts = pointsOf(e)
    for (let i = 0; i + 1 < pts.length; i += 1) {
      const [a, b] = [pts[i], pts[i + 1]]
      const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / CELL_M) + 1
      const keys = new Set()
      for (let s = 0; s <= steps; s += 1) keys.add(cellKey(a[0] + ((b[0] - a[0]) * s) / steps, a[1] + ((b[1] - a[1]) * s) / steps))
      keys.forEach((key) => {
        if (!grid.has(key)) grid.set(key, [])
        grid.get(key).push([a, b])
      })
    }
  })

  const overRoad = (ring) => {
    const xs = ring.map((p) => p[0])
    const ys = ring.map((p) => p[1])
    const seen = new Set()
    for (let cx = Math.floor(Math.min(...xs) / CELL_M); cx <= Math.floor(Math.max(...xs) / CELL_M); cx += 1) {
      for (let cy = Math.floor(Math.min(...ys) / CELL_M); cy <= Math.floor(Math.max(...ys) / CELL_M); cy += 1) {
        for (const segment of grid.get(`${cx},${cy}`) ?? []) {
          if (seen.has(segment)) continue
          seen.add(segment)
          const [a, b] = segment
          if (inside(ring, a) || inside(ring, b)) return true
          for (let i = 0; i + 1 < ring.length; i += 1) if (crosses(a, b, ring[i], ring[i + 1])) return true
        }
      }
    }
    return false
  }

  const lifted = []
  const out = elements.map((e) => {
    if (e.type !== 'way') return e
    const span = spanOf(e.tags)
    if (!span || span.bottom >= CLEARANCE_M) return e
    const ring = pointsOf(e)
    if (ring.length < 4 || e.nodes[0] !== e.nodes.at(-1) || !overRoad(ring)) return e
    const tags = { ...e.tags, min_height: String(CLEARANCE_M), height: String(CLEARANCE_M + span.top - span.bottom) }
    delete tags['building:min_level']
    lifted.push(e.id)
    return { ...e, tags }
  })
  return { elements: out, lifted }
}
