import { toLngLat, toMetres } from './project.js'

export const heightOf = (layer, bridge) => {
  const raised = bridge || layer > 0
  const extra = Math.max(0, (layer || 0) - (raised ? 1 : 0))
  return (raised ? 6 : 1.5) + extra * 6
}

const cellOf = (lng, lat) => `${Math.floor(lng / 0.002)},${Math.floor(lat / 0.002)}`

export const tagIndex = (graph) => {
  const buckets = new Map()
  graph.edges.forEach((edge) => {
    const [lng, lat] = graph.nodes[edge.a]
    const key = cellOf(lng, lat)
    const list = buckets.get(key)
    if (list) list.push(edge)
    else buckets.set(key, [edge])
  })
  return buckets
}

export const nearestTags = (graph, points, buckets = tagIndex(graph)) => points.map(([lng, lat]) => {
  const origin = graph.origin
  const [x, y] = toMetres(lng, lat, origin)
  const cx = Math.floor(lng / 0.002)
  const cy = Math.floor(lat / 0.002)
  let pool = []
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      pool = pool.concat(buckets.get(`${cx + dx},${cy + dy}`) || [])
    }
  }
  if (!pool.length) pool = graph.edges
  let best = pool[0]
  let dist = Infinity
  pool.forEach((edge) => {
    const a = graph.xy?.[edge.a] || toMetres(...graph.nodes[edge.a], origin)
    const b = graph.xy?.[edge.b] || toMetres(...graph.nodes[edge.b], origin)
    const abx = b[0] - a[0]
    const aby = b[1] - a[1]
    const L2 = abx * abx + aby * aby || 1e-9
    const t = Math.max(0, Math.min(1, ((x - a[0]) * abx + (y - a[1]) * aby) / L2))
    const d = Math.hypot(a[0] + abx * t - x, a[1] + aby * t - y)
    if (d < dist) {
      dist = d
      best = edge
    }
  })
  return { layer: best?.layer || 0, bridge: Boolean(best?.bridge) }
})

export const ribbonFor = (graph, result, buckets) => {
  if (!result || !graph) return []
  return ribbonQuads(result.features.prep, nearestTags(graph, result.features.centerline, buckets))
}

export const ribbonQuads = (prep, tags) => {
  const { x, y } = prep
  const n = x.length
  const quads = []
  const step = 4
  for (let i = 0; i < n; i += step) {
    const j = (i + step) % n
    const dx = x[j] - x[i]
    const dy = y[j] - y[i]
    const len = Math.hypot(dx, dy) || 1
    const px = (-dy / len) * 7
    const py = (dx / len) * 7
    const ring = [
      toLngLat(x[i] + px, y[i] + py, prep.origin),
      toLngLat(x[i] - px, y[i] - py, prep.origin),
      toLngLat(x[j] - px, y[j] - py, prep.origin),
      toLngLat(x[j] + px, y[j] + py, prep.origin),
      toLngLat(x[i] + px, y[i] + py, prep.origin),
    ]
    const tag = tags[Math.min(i, tags.length - 1)] || { layer: 0, bridge: false }
    quads.push({ ring, h: heightOf(tag.layer, tag.bridge) })
  }
  return quads
}
