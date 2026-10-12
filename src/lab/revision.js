import { encodePath } from '../sim/polyline.js'

const FNV_OFFSET = 0xcbf29ce484222325n
const FNV_PRIME = 0x100000001b3n
const FNV_MASK = 0xffffffffffffffffn

// Stable id for a path and racing sense. The same geometry always hashes
// the same way in the browser and in the pin script.
export const revisionOf = (path, racingSense) => {
  const text = `${racingSense}\n${path}`
  let hash = FNV_OFFSET
  for (let i = 0; i < text.length; i += 1) {
    hash ^= BigInt(text.charCodeAt(i))
    hash = (hash * FNV_PRIME) & FNV_MASK
  }
  return hash.toString(16).padStart(16, '0')
}

export const revisionFromPoints = (points, racingSense) => revisionOf(encodePath(points), racingSense)

export const layoutRevision = (id, view, world) => {
  if (!view) return null
  if (id === 'current') {
    if (!world?.current?.path || !world.current.racingSense) return null
    return revisionFromPoints(world.current.path, world.current.racingSense)
  }
  if (typeof view.revision === 'string' && view.revision) return view.revision
  if (typeof view.path === 'string' && view.racingSense) return revisionOf(view.path, view.racingSense)
  return null
}
