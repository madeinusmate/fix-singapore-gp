import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { firebaseConfigured, useAuth } from '../firebase/client.js'
import { readLayout, removeLayout } from '../firebase/layouts.js'
import { LabView } from '../lab/LabView.jsx'
import { senseLabel } from '../lab/numbers.js'
import { analyze } from '../sim/analyze.js'
import { decodePath } from '../sim/polyline.js'
import { useWorld } from '../world.js'

export const LayoutPage = () => {
  const { id } = useParams()
  const [params] = useSearchParams()
  const { world, error } = useWorld()
  const user = useAuth()
  const navigate = useNavigate()
  const [layout, setLayout] = useState(undefined)
  const [is3d, setIs3d] = useState(params.get('mode') === '3d')
  const [playing, setPlaying] = useState(true)
  const [overtakeOn, setOvertakeOn] = useState(false)
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
      setLayout({ ...doc, result: analyze(path, world.dem) })
    }).catch(() => { if (live) setMissingId(id) })
    return () => { live = false }
  }, [world, id])

  const currentLayout = id === 'current' && world ? {
    id: 'current',
    title: world.current.title,
    short: world.current.short,
    color: world.current.color,
    racingSense: world.current.racingSense,
    creatorName: 'Marina Bay',
    result: world.result,
  } : null
  const view = currentLayout || (layout?.id === id ? layout : null)
  const unavailable = id !== 'current' && !firebaseConfigured
  const missing = missingId === id

  if (error) return <p className="loading">{error.message}</p>
  if (missing || unavailable) return (
    <div className="missing">
      <h1>This layout is not available.</h1>
      <Link to="/">Back to the gallery</Link>
    </div>
  )
  if (!world || !view) return <p className="loading">Loading the lap…</p>

  const mine = user && view.creatorId === user.uid
  const runs = id === 'current'
    ? [{ id: 'current', name: view.title, short: view.short || 'Current', color: view.color, result: view.result }]
    : [
      { id: 'layout', name: view.title, short: view.title, color: view.color, result: view.result },
      { id: 'current', name: world.current.title, short: world.current.short, color: world.current.color, result: world.result },
    ]

  const remove = async () => {
    if (!window.confirm('Delete this layout? It will leave the gallery.')) return
    await removeLayout(id)
    navigate('/')
  }

  return (
    <LabView
      style={world.style}
      graph={world.graph}
      runs={runs}
      is3d={is3d}
      on3d={setIs3d}
      fitKey={id + (is3d ? '-3d' : '')}
      playing={playing}
      onPlaying={setPlaying}
      overtakeOn={overtakeOn}
      onOvertake={setOvertakeOn}
      actions={(
        <div className="actions">
          <p className="small">{senseLabel(view.racingSense)} · {view.creatorName}</p>
          <Link to={`/create?from=${id}`}>Start from this layout</Link>
          {mine && <Link to={`/create?edit=${id}`}>Edit</Link>}
          {mine && <button type="button" onClick={remove}>Delete</button>}
        </div>
      )}
    />
  )
}
