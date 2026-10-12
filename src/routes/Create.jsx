import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { clearDraft, readDraft, writeDraft } from '../draft/storage.js'
import { useRequestSignIn } from '../auth/requestSignIn.js'
import { accountName, auth, firebaseConfigured, useAuth } from '../firebase/client.js'
import { createLayout, layoutNameTaken, readLayout, saveLayout } from '../firebase/layouts.js'
import { storeLayoutShot } from '../firebase/shots.js'
import { captureLayoutShot } from '../lab/captureShot.js'
import { noteLayoutPublished } from '../rheo/account.js'
import { logLayoutPublished, logLayoutUpdated } from '../rheo/events.js'
import { LabView } from '../lab/LabView.jsx'
import { pickColor, senseLabel } from '../lab/numbers.js'
import { MAX_WAYPOINTS, MIN_LAP_M, MAX_LAP_M } from '../sim/const.js'
import { revisionOf } from '../lab/revision.js'
import { encodePath, simplify } from '../sim/polyline.js'
import { analyze } from '../sim/analyze.js'
import { toMetres } from '../sim/project.js'
import { ribbonFor } from '../sim/ribbon.js'
import { buildLap, networkLines, nodeAt, snapNode } from '../sim/route.js'
import { NAME_LENGTH, NAME_MAX, NAME_TAKEN, layoutName, moderateLayoutName } from '../moderation/name.js'
import { useConfirmDialog } from '../ui/useConfirmDialog.jsx'
import { useWorld } from '../world.js'

const EMPTY_LAP = { ok: false, issues: [], path: [], edgeIds: [], legs: [], skipped: [] }

const asPoints = (waypoints) => (waypoints || []).map((point) => (Array.isArray(point) ? point : [point.lng, point.lat]))

const onRoads = (graph, points) => points
  .map(([lng, lat]) => nodeAt(graph, lng, lat) ?? snapNode(graph, lng, lat, 40)?.id)
  .filter((id) => id != null)
  .map((id) => graph.nodes[id])

const lengthM = (coords) => coords.reduce((sum, point, i) => {
  if (!i) return 0
  const [x0, y0] = toMetres(...coords[i - 1])
  const [x1, y1] = toMetres(...point)
  return sum + Math.hypot(x1 - x0, y1 - y0)
}, 0)

const listOf = (names) => {
  if (!names?.length) return 'A road'
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1)

const edgeLines = (graph, edgeIds) => edgeIds.map((id) => [graph.nodes[graph.edges[id].a], graph.nodes[graph.edges[id].b]])

const Check = ({ state, label, detail, onShow }) => (
  <li className={`check ${state}`}>
    <i aria-hidden="true">{state === 'ok' ? '✓' : state === 'bad' ? '!' : '·'}</i>
    <div>
      <b>{label}</b>
      {detail && <span>{detail}</span>}
    </div>
    {onShow && <button type="button" onClick={onShow}>Show me</button>}
  </li>
)

export const Create = () => {
  const { world, error } = useWorld()
  const user = useAuth()
  const requestSignIn = useRequestSignIn()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [waypoints, setWaypoints] = useState([])
  const [sense, setSense] = useState('ccw')
  const [title, setTitle] = useState('')
  const [color, setColor] = useState(pickColor)
  const [editingId, setEditingId] = useState(null)
  const [toast, setToast] = useState(null)
  const [publishError, setPublishError] = useState('')
  const [busy, setBusy] = useState(false)
  const [is3d, setIs3d] = useState(params.get('mode') === '3d')
  const [playing, setPlaying] = useState(true)
  const [computed, setComputed] = useState(null)
  const [hydrated, setHydrated] = useState(false)
  const [canUndo, setCanUndo] = useState(false)
  const [focus, setFocus] = useState(null)
  const [ghostOn, setGhostOn] = useState(false)
  const { confirm, dialog: confirmDialog } = useConfirmDialog()
  const past = useRef([])
  const booted = useRef('')
  const keys = useRef({})
  const requestKey = `${params.get('edit') || ''}|${params.get('from') || ''}`

  const say = (text) => setToast({ text, at: Date.now() })

  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => setToast(null), 2800)
    return () => clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (!world || booted.current === requestKey) return undefined
    booted.current = requestKey
    let cancelled = false
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
    load().then(async (incoming) => {
      if (cancelled) return
      const draft = readDraft()
      const useIncoming = incoming && draft?.waypoints?.length
        ? await confirm({
          kicker: 'Layout in progress',
          title: 'Replace your layout?',
          body: 'You have a layout in progress on this browser. Replace it with the one you just opened?',
          confirmLabel: 'Replace it',
          cancelLabel: 'Keep mine',
        })
        : Boolean(incoming)
      if (cancelled) return
      const next = useIncoming ? incoming : draft
      if (next) {
        setWaypoints(onRoads(world.graph, asPoints(next.waypoints)))
        setSense(next.sense || 'ccw')
        setTitle(next.title || '')
        if (next.color) setColor(next.color)
        setEditingId(next.editingId || null)
      }
      setHydrated(true)
    }).catch((err) => {
      if (cancelled) return
      say(err.message)
      setHydrated(true)
    })
    return () => { cancelled = true }
  }, [world, params, requestKey, confirm])

  useEffect(() => {
    if (!hydrated) return
    writeDraft({ waypoints, sense, title, color, editingId })
  }, [hydrated, waypoints, sense, title, color, editingId])

  const lap = useMemo(() => {
    if (!world || !waypoints.length) return EMPTY_LAP
    const ids = waypoints.map(([lng, lat]) => nodeAt(world.graph, lng, lat))
    return buildLap(world.graph, ids, sense)
  }, [world, waypoints, sense])

  useEffect(() => {
    if (!world || !lap.ok) return undefined
    const token = lap
    const timer = setTimeout(() => setComputed({ lap: token, result: analyze(token.path, world.dem, world.graph) }), 250)
    return () => clearTimeout(timer)
  }, [world, lap])
  const result = computed?.lap === lap ? computed.result : null

  const paths = useMemo(() => lap.legs
    .map((leg, i) => ({ coords: leg.coords, auto: leg.auto, leg: i, ok: leg.ok }))
    .filter((part) => part.ok && part.coords.length > 1), [lap])

  const problems = useMemo(() => {
    if (!world) return { gaps: [], reuse: null, cross: null, lines: [] }
    const gaps = lap.issues.filter((issue) => issue.type === 'gap')
    const reuse = lap.issues.find((issue) => issue.type === 'reuse') || null
    const cross = lap.issues.find((issue) => issue.type === 'cross') || null
    const lines = [
      ...gaps.map((issue) => issue.line),
      ...(reuse ? edgeLines(world.graph, reuse.edgeIds) : []),
      ...(cross ? edgeLines(world.graph, cross.edgeIds) : []),
    ]
    return { gaps, reuse, cross, lines }
  }, [world, lap])

  const ghost = useMemo(() => (world && ghostOn ? [...world.current.path, world.current.path[0]] : null), [world, ghostOn])
  const network = useMemo(() => (world ? networkLines(world.graph) : null), [world])

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

  useEffect(() => {
    keys.current.undo = undo
  })

  useEffect(() => {
    const typing = (e) => e.target.closest?.('input, textarea')
    const down = (e) => {
      if (typing(e)) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        keys.current.undo()
      } else if (e.key.toLowerCase() === 'r' && !e.metaKey && !e.ctrlKey) setGhostOn(true)
    }
    const up = (e) => { if (e.key.toLowerCase() === 'r') setGhostOn(false) }
    const blur = () => setGhostOn(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [])

  const onMapClick = (lngLat, leg) => {
    if (!world) return
    if (waypoints.length >= MAX_WAYPOINTS) {
      say(`${MAX_WAYPOINTS} points is the limit. Drag the ones you have instead.`)
      return
    }
    const snap = snapNode(world.graph, lngLat.lng, lngLat.lat, 40)
    if (!snap) {
      say('No street there. Click right on a road.')
      return
    }
    const at = leg == null ? waypoints.length : Math.min(leg, waypoints.length)
    pushUndo()
    setWaypoints((points) => [...points.slice(0, at), world.graph.nodes[snap.id], ...points.slice(at)])
    if (at < waypoints.length) say(`Bend added as point ${at + 1}.`)
  }

  const onWaypointDrag = (index, lngLat) => {
    const snap = snapNode(world.graph, lngLat.lng, lngLat.lat, 40)
    if (!snap) {
      say('No street there, so the point went back.')
      setWaypoints((points) => [...points])
      return
    }
    pushUndo()
    setWaypoints((points) => points.map((point, i) => (i === index ? world.graph.nodes[snap.id] : point)))
  }

  const removePoint = (index) => {
    pushUndo()
    setWaypoints((points) => points.filter((_, i) => i !== index))
  }

  const movePoint = (index, by) => {
    pushUndo()
    setWaypoints((points) => {
      const next = points.slice()
      const [item] = next.splice(index, 1)
      next.splice(index + by, 0, item)
      return next
    })
  }

  const flipSense = () => {
    pushUndo()
    setSense((value) => (value === 'ccw' ? 'cw' : 'ccw'))
    setWaypoints((points) => [...points].reverse())
  }

  const clear = async () => {
    if (waypoints.length) {
      const ok = await confirm({
        kicker: 'Start again',
        title: 'Bin this layout?',
        body: 'The points, the name, and the colour are cleared so you can start again.',
        confirmLabel: 'Bin it',
        cancelLabel: 'Keep it',
      })
      if (!ok) return
    }
    pushUndo()
    setWaypoints([])
    setTitle('')
    setEditingId(null)
    setColor(pickColor())
  }

  const publish = async () => {
    if (!firebaseConfigured) {
      setPublishError('Publishing is switched off here, so this layout stays on this browser.')
      return
    }
    setBusy(true)
    setPublishError('')
    try {
      let currentUser = user || auth.currentUser
      if (!currentUser) currentUser = (await requestSignIn()).user
      const name = await accountName(currentUser)
      if (!name) {
        setPublishError('This Google account has no display name, so it cannot publish.')
        return
      }
      const layoutTitle = layoutName(title)
      if (!layoutTitle) {
        setPublishError(NAME_LENGTH)
        return
      }
      if (await layoutNameTaken(layoutTitle, editingId)) {
        setPublishError(NAME_TAKEN)
        return
      }
      await moderateLayoutName(currentUser, layoutTitle)
      let blob = null
      if (result?.features) {
        try {
          blob = await captureLayoutShot({
            color,
            centerline: result.features.centerline,
            grid: result.features.grid,
            ribbon: ribbonFor(world.graph, result),
          })
        } catch (error) {
          console.error('Layout shot failed', error)
        }
      }
      const keepShot = async (id) => {
        if (!blob) return null
        try {
          return await storeLayoutShot(currentUser.uid, id, blob)
        } catch (error) {
          console.error('Layout shot upload failed', error)
          return null
        }
      }
      const path = encodePath(lap.path)
      const body = {
        title: layoutTitle,
        racingSense: sense,
        color,
        waypoints: waypoints.map(([lng, lat]) => ({ lng, lat })),
        path,
        revision: revisionOf(path, sense),
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
        await keepShot(editingId)
        logLayoutUpdated(editingId)
        clearDraft()
        navigate(`/l/${editingId}`)
      } else {
        const ref = await createLayout(body)
        const imageUrl = await keepShot(ref.id)
        logLayoutPublished(ref.id, imageUrl)
        try {
          await noteLayoutPublished(currentUser.uid, ref.id, body.title, imageUrl)
        } catch {
          // The layout is already saved. A missed email should not block the page.
        }
        clearDraft()
        navigate(`/l/${ref.id}?new=1`)
      }
    } catch (err) {
      if (err?.code !== 'auth/popup-closed-by-user') setPublishError(err.message || 'Could not publish.')
    } finally {
      setBusy(false)
    }
  }

  if (error) return <p className="loading">{error.message}</p>
  if (!world || !hydrated) return (
    <>
      <p className="loading">Closing the roads…</p>
      {confirmDialog}
    </>
  )

  const runs = [{
    id: 'draft',
    name: title.trim() || 'Your layout',
    short: 'Yours',
    color,
    result,
    paths,
    grid: sense === 'cw' ? [...world.current.grid].reverse() : world.current.grid,
  }, ...(result ? [{
    id: 'current',
    name: world.current.title,
    short: 'Today',
    color: world.current.color,
    result: world.result,
  }] : [])]

  const started = waypoints.length > 0
  const routedM = lengthM(world.current.grid) + paths.reduce((sum, part) => sum + lengthM(part.coords), 0)
  const lapM = result ? result.metrics.length_km * 1000 : routedM
  const lengthOk = lapM >= MIN_LAP_M && lapM <= MAX_LAP_M
  const titleOk = Boolean(layoutName(title))
  const { gaps, reuse, cross } = problems
  const show = (lines) => () => setFocus({ coords: lines.flat() })
  const exitEnd = sense === 'cw' ? 'south' : 'north'

  const checks = [
    {
      id: 'route',
      state: !started ? 'wait' : gaps.length ? 'bad' : 'ok',
      label: 'Joins up with the grid',
      detail: !started ? 'Click a street to drop your first point.' : gaps.length ? capital(gaps[0].message) : null,
      onShow: gaps.length ? show(gaps.map((issue) => issue.line)) : null,
    },
    {
      id: 'reuse',
      state: !started ? 'wait' : reuse ? 'bad' : 'ok',
      label: 'Every road driven once',
      detail: reuse && `${capital(listOf(reuse.names))} ${reuse.names.length > 1 ? 'are' : 'is'} driven twice. ${reuse.closing
        ? 'That is the dashed route home. Add a point to send it another way.'
        : 'Drag a point, or click the line to add a bend that steers around it.'}`,
      onShow: reuse ? show(edgeLines(world.graph, reuse.edgeIds)) : null,
    },
    {
      id: 'cross',
      state: !started ? 'wait' : cross ? 'bad' : 'ok',
      label: 'No flat crossings',
      detail: cross && `The lap crosses itself on ${listOf(cross.names)}. Bridges and tunnels are fine; a flat junction is a crash waiting to happen.`,
      onShow: cross ? show(edgeLines(world.graph, cross.edgeIds)) : null,
    },
    {
      id: 'length',
      state: !started ? 'wait' : lengthOk ? 'ok' : 'bad',
      label: 'Between 3.5 and 7 km',
      detail: started ? `${result ? '' : '≈ '}${(lapM / 1000).toFixed(2)} km${lapM < MIN_LAP_M ? '. Too short, keep going.' : lapM > MAX_LAP_M ? '. Too long, trim it back.' : ''}` : null,
    },
    {
      id: 'title',
      state: titleOk ? 'ok' : 'wait',
      label: 'Has a name',
      detail: titleOk ? null : 'At least 3 characters. Make it memorable.',
    },
  ]
  const blocker = checks.find((check) => check.state !== 'ok')
  const canPublish = Boolean(result) && lap.ok && lengthOk && titleOk && !busy
  const coach = !started
    ? `Click a street near the ${exitEnd} end of the grid to start your lap.`
    : lap.ok && lengthOk ? 'Looking race-ready. Name it and publish.' : 'Keep clicking streets. The dashed line routes you home.'

  return (
    <>
    <LabView
      style={world.style}
      graph={world.graph}
      runs={runs}
      is3d={is3d}
      on3d={setIs3d}
      fitKey="create"
      playing={playing}
      onPlaying={setPlaying}
      waypoints={waypoints}
      skipped={lap.skipped}
      onMapClick={onMapClick}
      onWaypointDrag={onWaypointDrag}
      onWaypointRemove={removePoint}
      issues={problems.lines}
      focus={focus}
      ghost={ghost}
      network={network}
      tools={(
        <>
          <span className="seg">
            <button type="button" className={sense === 'ccw' ? 'on' : ''} onClick={() => sense !== 'ccw' && flipSense()}>
              <span className="wide-label">Anticlockwise</span>
              <span className="short-label">Anti</span>
            </button>
            <button type="button" className={sense === 'cw' ? 'on' : ''} onClick={() => sense !== 'cw' && flipSense()}>
              <span className="wide-label">Clockwise</span>
              <span className="short-label">Clock</span>
            </button>
          </span>
          <button type="button" className="tool" onClick={undo} disabled={!canUndo} title="Undo (Ctrl/Cmd+Z)">Undo</button>
          <button type="button" className="tool" onClick={clear}>Clear</button>
        </>
      )}
      overlay={(
        <div className="coachbar">
          {toast ? <p key={toast.at} className="toast" role="status">{toast.text}</p> : <p className="coach">{coach}</p>}
          <button
            type="button"
            className={`ghostbtn${ghostOn ? ' on' : ''}`}
            aria-pressed={ghostOn}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              setGhostOn(true)
            }}
            onPointerUp={() => setGhostOn(false)}
            onPointerCancel={() => setGhostOn(false)}
            onLostPointerCapture={() => setGhostOn(false)}
            onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') setGhostOn(true) }}
            onKeyUp={() => setGhostOn(false)}
            onContextMenu={(e) => e.preventDefault()}
          >
            {ghostOn ? 'Real track showing' : 'Hold to see the real track'} <kbd>R</kbd>
          </button>
        </div>
      )}
      actions={(
        <div className="publish">
          <label>
            Name your layout
            <input value={title} maxLength={NAME_MAX} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. The Bayfront Slingshot" />
          </label>
          <h3>Race-ready check</h3>
          <ul className="checks">
            {checks.map((check) => <Check key={check.id} {...check} />)}
          </ul>
          {lap.skipped.length > 0 && (
            <p className="tip">
              Reaching {lap.skipped.length === 1 ? `point ${lap.skipped[0] + 1}` : `points ${lap.skipped.map((i) => i + 1).join(', ')}`} would need a U-turn, so the lap skips {lap.skipped.length === 1 ? 'it' : 'them'} (hollow {lap.skipped.length === 1 ? 'marker' : 'markers'}). Move {lap.skipped.length === 1 ? 'it' : 'them'}, or add a point further on so the lap can carry through.
            </p>
          )}
          <button type="button" className="go big" disabled={!canPublish} onClick={publish}>
            {busy ? 'Publishing…' : editingId ? 'Save changes' : 'Publish to the leaderboard'}
          </button>
          <p className="small">
            {!canPublish && blocker && started ? `Next up: ${blocker.label.toLowerCase()}. ` : ''}
            {senseLabel(sense)}. {user ? `Publishing as ${user.displayName || 'your Google account'}.` : 'You will sign in with Google to publish.'}
          </p>
          {publishError && <p className="error">{publishError}</p>}
          <details className="howto" open={!started}>
            <summary>How to draw a lap</summary>
            <ol>
              <li>Click streets in the order you want to drive them. Your lap leaves the grid at the {exitEnd} end, where the white arrow points.</li>
              <li>The dashed line is the route home to the grid. It updates as you go.</li>
              <li>Click the line to add a bend there. Drag a point to move it. Double-click a point to delete it.</li>
              <li>Press and hold the real-track button, or the R key, to see today&apos;s lap on top of yours.</li>
            </ol>
          </details>
          {started && (
            <details className="points">
              <summary>Points ({waypoints.length})</summary>
              <ol className="wplist">
                {waypoints.map((point, index) => (
                  <li key={`${point[0]}-${point[1]}-${index}`} className={lap.skipped.includes(index) ? 'off' : ''}>
                    <span>Point {index + 1}</span>
                    <button type="button" aria-label={`Move point ${index + 1} earlier`} disabled={index === 0} onClick={() => movePoint(index, -1)}>↑</button>
                    <button type="button" aria-label={`Move point ${index + 1} later`} disabled={index === waypoints.length - 1} onClick={() => movePoint(index, 1)}>↓</button>
                    <button type="button" aria-label={`Remove point ${index + 1}`} onClick={() => removePoint(index)}>×</button>
                  </li>
                ))}
              </ol>
            </details>
          )}
          <Link to="/" className="textlink">Back to the leaderboard</Link>
        </div>
      )}
    />
    {confirmDialog}
    </>
  )
}
