import { useEffect, useState } from 'react'
import { analyze } from './sim/analyze.js'
import { loadGraph } from './sim/route.js'

const asset = (file) => `${import.meta.env.BASE_URL}data/${file}`

const loadJson = async (file) => {
  const res = await fetch(asset(file))
  if (!res.ok) throw new Error(`Could not load ${file}`)
  return res.json()
}

let pending
export const loadWorld = () => {
  pending ||= Promise.all([
    loadJson('graph.json'),
    loadJson('dem.json'),
    loadJson('current.json'),
    loadJson('style-min-dark.json'),
  ]).then(([graphDoc, dem, current, style]) => {
    const graph = loadGraph(graphDoc)
    return { graph, dem, current, style, result: analyze(current.path, dem, graph) }
  })
  return pending
}

export const useWorld = () => {
  const [world, setWorld] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    let live = true
    loadWorld().then((next) => { if (live) setWorld(next) }).catch((err) => { if (live) setError(err) })
    return () => { live = false }
  }, [])
  return { world, error }
}
