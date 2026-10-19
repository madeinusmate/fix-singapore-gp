import { useEffect, useState } from 'react'
import { analyze } from './sim/analyze.js'
import { loadGraph } from './sim/route.js'

const asset = (file) => `${import.meta.env.BASE_URL}data/${file}`

const loadJson = async (file) => {
  const res = await fetch(asset(file))
  if (!res.ok) throw new Error(`Could not load ${file}`)
  return res.json()
}

const filesFor = (slug) => (slug === 'singapore'
  ? ['graph.json', 'dem.json', 'current.json', 'style-min-dark.json']
  : [`${slug}/graph.json`, `${slug}/dem.json`, `${slug}/current.json`, 'style-min-dark.json'])

const pending = new Map()

export const loadWorld = (slug = 'singapore') => {
  if (!pending.has(slug)) {
    pending.set(slug, Promise.all(filesFor(slug).map(loadJson)).then(([graphDoc, dem, current, style]) => {
      const graph = loadGraph(graphDoc)
      return { slug, graph, dem, current, style, result: analyze(current.path, dem, graph) }
    }))
  }
  return pending.get(slug)
}

export const useWorld = (slug = 'singapore') => {
  const [state, setState] = useState({ slug: null, world: null, error: null })
  useEffect(() => {
    let live = true
    loadWorld(slug).then((next) => {
      if (live) setState({ slug, world: next, error: null })
    }).catch((err) => {
      if (live) setState({ slug, world: null, error: err })
    })
    return () => { live = false }
  }, [slug])
  if (state.slug !== slug) return { world: null, error: null }
  return { world: state.world, error: state.error }
}
