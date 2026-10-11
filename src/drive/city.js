import { toMetres } from '../sim/project.js'

const text = (view, offset, length) => String.fromCharCode(...new Uint8Array(view.buffer, view.byteOffset + offset, length))

// Group position, in scene metres, that puts the city origin on its SVY21 point.
// The mesh itself is already in scene axes (x east, y up, z south) relative to that origin.
export const cityShift = (courseOrigin, originLng, originLat) => {
  const [ox, oy] = toMetres(originLng, originLat)
  return [ox - courseOrigin[0], 0, -(oy - courseOrigin[1])]
}

const align = (offset) => (offset + 3) & ~3

// Chunks of the baked OSM2World city. See analysis/bake_city.mjs.
export const parseCity = (buffer) => {
  const view = new DataView(buffer)
  if (text(view, 0, 4) !== 'CITY') throw new Error('Not a city mesh')
  let offset = 4
  const version = view.getUint32(offset, true)
  offset += 4
  if (version !== 1) throw new Error('Unknown city mesh')
  const originLng = view.getFloat64(offset, true)
  offset += 8
  const originLat = view.getFloat64(offset, true)
  offset += 8
  const count = view.getUint32(offset, true)
  offset += 4
  const chunks = []
  for (let i = 0; i < count; i += 1) {
    const verts = view.getUint32(offset, true)
    offset += 4
    const indexes = view.getUint32(offset, true)
    offset += 4
    const positions = new Float32Array(buffer, offset, verts * 3)
    offset += verts * 12
    const colors = new Uint8Array(buffer, offset, verts * 3)
    offset = align(offset + verts * 3)
    const indices = new Uint32Array(buffer, offset, indexes)
    offset += indexes * 4
    chunks.push({ positions, colors, indices })
  }
  return { originLng, originLat, chunks }
}

let pending
export const loadCity = () => {
  pending ||= fetch(`${import.meta.env.BASE_URL}data/city.bin`)
    .then((res) => {
      if (!res.ok) throw new Error('Could not load city.bin')
      return res.arrayBuffer()
    })
    .then(parseCity)
    .catch((err) => {
      pending = null
      throw err
    })
  return pending
}
