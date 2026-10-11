import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { clearDraft, readDraft, writeDraft } from '../draft/storage.js'
import { accountName, auth, firebaseConfigured, signIn, useAuth } from '../firebase/client.js'
import { createLayout, readLayout, saveLayout } from '../firebase/layouts.js'
import { LabView } from '../lab/LabView.jsx'
import { pickColor, senseLabel } from '../lab/numbers.js'
import { MIN_LAP_M, MAX_LAP_M } from '../sim/const.js'
import { encodePath, simplify } from '../sim/polyline.js'
import { analyze } from '../sim/analyze.js'
import { buildLap, snapNode } from '../sim/route.js'
import { useWorld } from '../world.js'

const asPoints = (waypoints) => (waypoints || []).map((point) => (Array.isArray(point) ? point : [point.lng, point.lat]))

export const Create = () => {
  const { world, error } = useWorld()
  const user = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [waypoints, setWaypoints] = useState([])
  const [sense, setSense] = useState('ccw')
  const [title, setTitle] = useState('')
  const [color, setColor] = useState(pickColor)
  const [editingId, setEditingId] = useState(null)
  const [hint, setHint] = useState('')
  const [busy, setBusy] = useState(false)
  const [is3d, setIs3d] = useState(params.get('mode') === '3d')
  const [playing, setPlaying] = useState(true)
  const [overtakeOn, setOvertakeOn] = useState(false)
  const [computed, setComputed] = useState(null)
  const [hydrated, setHydrated] = useState(false)
  const [canUndo, setCanUndo] = useState(false)
  const past = useRef([])
  const booted = useRef('')
  const requestKey = `${params.get('edit') || ''}|${params.get('from') || ''}`

  useEffect(() => {
    if (!world || booted.current === requestKey) return undefined
    booted.current = requestKey
    const edit = params.get('edit')
    const from = params.get('from')
    const load = async () => {
      if (edit && edit !== 'current') {
        if (!firebaseConfigured) throw new Error('Firebase is not configured.')
        const layout = await readLayout(edit)
        if (!layout) return null
        return {
          waypoints: asPoints(layout.waypoints),
          sense: layout.racingSense || 'ccw',
          title: layout.title || '',
          color: layout.color,
          editingId: layout.id,
        }
      }
      if (from === 'current') {
        return { waypoints: world.current.waypoints, sense: world.current.racingSense, title: '', color: pickColor(), editingId: null }
      }
      if (from) {
        if (!firebaseConfigured) throw new Error('Firebase is not configured.')
        const layout = await readLayout(from)
        if (!layout) return null
        return { waypoints: asPoints(layout.waypoints), sense: layout.racingSense || 'ccw', title: '', color: pickColor(), editingId: null }
      }
      return null
    }
    load().then((incoming) => {
      const draft = readDraft()
      const useIncoming = incoming && (!draft?.waypoints?.length || window.confirm('Replace the layout on this browser with the one you opened?'))
      const next = useIncoming ? incoming : draft
      if (next) {
        setWaypoints(asPoints(next.waypoints))
        setSense(next.sense || 'ccw')
        setTitle(next.title || '')
        if (next.color) setColor(next.color)
        setEditingId(next.editingId || null)
      }
      setHydrated(true)
    }).catch((err) => {
      setHint(err.message)
      setHydrated(true)
    })
    return undefined
  }, [world, params, requestKey])

  useEffect(() => {
    if (!hydrated) return
    writeDraft({ waypoints, sense, title, color, editingId })
  }, [hydrated, waypoints, sense, title, color, editingId])

  const lap = useMemo(() => {
    if (!world) return null
    if (!waypoints.length) return { ok: false, issues: [], path: [], stretches: [], edgeIds: [], legs: [] }
    const ids = waypoints.map(([lng, lat]) => snapNode(world.graph, lng, lat, 40)?.id).filter((id) => id != null)
    return buildLap(world.graph, ids, sense)
  }, [world, waypoints, sense])

  useEffect(() => {
    if (!world || !lap?.ok) return undefined
    const token = lap
    const timer = setTimeout(() => setComputed({ lap: token, result: analyze(token.path, world.dem) }), 300)
    return () => clearTimeout(timer)
  }, [world, lap])
  const result = computed?.lap === lap ? computed.result : null

  const pushUndo = () => {
    past.current = [...past.current, { waypoints, sense }].slice(-50)
    setCanUndo(true)
  }

  const undo = () => {
    const prev = past.current.pop()
    setCanUndo(past.current.length > 0)
    if (!prev) return
    setWaypoints(prev.waypoints)
    setSense(prev.sense)
  }

  const onMapClick = (lngLat) => {
    if (!world) return
    if (waypoints.length >= 60) {
      setHint('60 points is the maximum.')
      return
    }
    const snap = snapNode(world.graph, lngLat.lng, lngLat.lat, 40)
    if (!snap) {
      setHint('Click closer to a road.')
      return
    }
    pushUndo()
    setWaypoints((points) => [...points, world.graph.nodes[snap.id]])
    setHint('')
  }

  const onWaypointDrag = (index, lngLat) => {
    const snap = snapNode(world.graph, lngLat.lng, lngLat.lat, 40)
    if (!snap) return
    pushUndo()
    setWaypoints((points) => points.map((point, i) => (i === index ? world.graph.nodes[snap.id] : point)))
  }

  const flipSense = () => {
    pushUndo()
    setSense((value) => (value === 'ccw' ? 'cw' : 'ccw'))
    setWaypoints((points) => [...points].reverse())
  }

  const clear = () => {
    if (waypoints.length && !window.confirm('Clear this draft?')) return
    pushUndo()
    setWaypoints([])
    setTitle('')
    setEditingId(null)
    setColor(pickColor())
  }

  const lengthM = result ? result.metrics.length_km * 1000 : 0
  const lengthBad = result && (lengthM < MIN_LAP_M || lengthM > MAX_LAP_M)
  const messages = [
    !waypoints.length ? 'The starting grid is locked. Click a street to add the first point.' : null,
    ...(lap?.issues.map((issue) => issue.message) || []),
    lengthBad ? `This lap is ${result.metrics.length_km.toFixed(2)} km. It needs to be between 3.5 and 7 km.` : null,
    hint,
  ].filter(Boolean)

  const issueLines = (lap?.issues || []).flatMap((issue) => {
    if (issue.line) return [issue.line]
    return (issue.edgeIds || []).map((id) => {
      const edge = world.graph.edges[id]
      return [world.graph.nodes[edge.a], world.graph.nodes[edge.b]]
    })
  })

  const publish = async () => {
    if (!firebaseConfigured) {
      setHint('Firebase is not configured, so this layout stays on this browser.')
      return
    }
    setBusy(true)
    try {
      let currentUser = user || auth.currentUser
      if (!currentUser) currentUser = (await signIn()).user
      const name = await accountName(currentUser)
      if (!name) {
        setHint('This Google account has no display name, so it cannot publish.')
        return
      }
      const body = {
        title: title.trim(),
        racingSense: sense,
        color,
        waypoints: waypoints.map(([lng, lat]) => ({ lng, lat })),
        path: encodePath(lap.path),
        thumb: encodePath(simplify(lap.path)),
        summary: {
          lengthKm: result.metrics.length_km,
          lapS: result.metrics.lap_s,
          lapOvertakeS: result.metrics.lap_overtake_s,
          overtakingIndex: result.metrics.overtaking_score_2026,
          heavyBraking: result.metrics.heavy_braking_zones,
          corners: result.metrics.corners,
          topKmh: result.metrics.top_kmh,
        },
        creatorId: currentUser.uid,
        creatorName: name,
      }
      if (editingId) {
        await saveLayout(editingId, body)
        clearDraft()
        navigate(`/l/${editingId}`)
      } else {
        const ref = await createLayout(body)
        clearDraft()
        navigate(`/l/${ref.id}`)
      }
    } catch (err) {
      setHint(err.message || 'Could not publish.')
    } finally {
      setBusy(false)
    }
  }

  if (error) return <p className="loading">{error.message}</p>
  if (!world || !hydrated) return <p className="loading">Loading the streets…</p>

  const grid = sense === 'cw' ? [...world.current.grid].reverse() : world.current.grid
  const runs = [{
    id: 'draft',
    name: title.trim() || 'Untitled layout',
    short: 'Yours',
    color,
    result,
    paths: lap?.stretches,
    grid,
  }, ...(result ? [{
    id: 'current',
    name: world.current.title,
    short: world.current.short,
    color: world.current.color,
    result: world.result,
  }] : [])]

  const titleOk = title.trim().length >= 3 && title.trim().length <= 60
  const canPublish = Boolean(result) && !lengthBad && titleOk && lap?.ok && !busy

  return (
    <LabView
      style={world.style}
      graph={world.graph}
      runs={runs}
      is3d={is3d}
      on3d={setIs3d}
      fitKey={`create-${sense}`}
      playing={playing}
      onPlaying={setPlaying}
      overtakeOn={overtakeOn}
      onOvertake={setOvertakeOn}
      waypoints={waypoints}
      onMapClick={onMapClick}
      onWaypointDrag={onWaypointDrag}
      issues={issueLines}
      tools={(
        <>
          <span className="seg">
            <button type="button" className={sense === 'ccw' ? 'on' : ''} onClick={() => sense !== 'ccw' && flipSense()}>Anticlockwise</button>
            <button type="button" className={sense === 'cw' ? 'on' : ''} onClick={() => sense !== 'cw' && flipSense()}>Clockwise</button>
          </span>
          <button type="button" className="tool" onClick={undo} disabled={!canUndo}>Undo</button>
          <button type="button" className="tool" onClick={clear}>Clear</button>
        </>
      )}
      notice={messages.length > 0 && <div className="issues">{messages.map((message, index) => <p key={`${message}-${index}`}>{message}</p>)}</div>}
      actions={(
        <div className="publish">
          <label>
            Title
            <input value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder="Name this layout" />
          </label>
          <p className="small">{senseLabel(sense)}. {user ? `Publishing as ${user.displayName || 'your Google account'}.` : 'You will sign in with Google to publish.'}</p>
          <button type="button" className="go" disabled={!canPublish} onClick={publish}>{busy ? 'Publishing…' : editingId ? 'Save' : 'Publish'}</button>
          <Link to="/" className="textlink">Back to the gallery</Link>
          <ol className="wplist">
            {waypoints.map((point, index) => (
              <li key={`${point[0]}-${point[1]}-${index}`}>
                <span>Point {index + 1}</span>
                <button type="button" onClick={() => { pushUndo(); setWaypoints((points) => points.filter((_, i) => i !== index)) }}>Remove</button>
                <button type="button" disabled={index === 0} onClick={() => { pushUndo(); setWaypoints((points) => { const next = points.slice(); const [item] = next.splice(index, 1); next.splice(index - 1, 0, item); return next }) }}>Up</button>
                <button type="button" disabled={index === waypoints.length - 1} onClick={() => { pushUndo(); setWaypoints((points) => { const next = points.slice(); const [item] = next.splice(index, 1); next.splice(index + 1, 0, item); return next }) }}>Down</button>
              </li>
            ))}
          </ol>
        </div>
      )}
    />
  )
}
