import { useEffect, useMemo, useState } from 'react'
import { firebaseConfigured } from '../firebase/client.js'
import { readLayout } from '../firebase/layouts.js'
import { analyze } from '../sim/analyze.js'
import { decodePath } from '../sim/polyline.js'
import { useWorld } from '../world.js'

// The current layout or a published one, scored on the street graph.
// `view` is null while loading; `missing` and `unavailable` explain why it never arrives.
export const useLayoutView = (id) => {
  const { world, error } = useWorld()
  const [layout, setLayout] = useState(undefined)
  const [missingId, setMissingId] = useState(null)

  useEffect(() => {
    if (!world || id === 'current' || !firebaseConfigured) return undefined
    let live = true
    readLayout(id).then((doc) => {
      if (!live) return
      if (!doc) {
        setMissingId(id)
        return
      }
      const path = decodePath(doc.path)
      setMissingId(null)
      setLayout({ ...doc, result: analyze(path, world.dem, world.graph) })
    }).catch(() => { if (live) setMissingId(id) })
    return () => { live = false }
  }, [world, id])

  const currentLayout = useMemo(() => (id === 'current' && world ? {
    id: 'current',
    title: world.current.title,
    short: world.current.short,
    color: world.current.color,
    racingSense: world.current.racingSense,
    creatorName: 'Marina Bay',
    result: world.result,
  } : null), [id, world])
  return {
    world,
    error,
    view: currentLayout || (layout?.id === id ? layout : null),
    missing: missingId === id,
    unavailable: id !== 'current' && !firebaseConfigured,
  }
}
