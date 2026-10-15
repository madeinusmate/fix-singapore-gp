import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { SiteFooter } from '../SiteFooter.jsx'
import { firebaseConfigured, useAuth } from '../firebase/client.js'
import { listTracks, pageLayouts, PAGE_SIZE } from '../firebase/layouts.js'
import { listTimes } from '../firebase/times.js'
import { useVotes } from '../firebase/votes.js'
import { CircuitMap } from '../lab/CircuitMap.jsx'
import { fmtLap, senseLabel } from '../lab/numbers.js'
import { layoutRevision } from '../lab/revision.js'
import { analyze } from '../sim/analyze.js'
import { decodePath } from '../sim/polyline.js'
import { ribbonFor, tagIndex } from '../sim/ribbon.js'
import { useWorld } from '../world.js'

const MODES = [
  { id: 'votes', label: 'Votes' },
  { id: 'index', label: 'Overtaking' },
  { id: 'lap', label: 'Lap time' },
]

const boardMessage = (err) => (
  err?.code === 'failed-precondition'
    ? 'The leaderboard is still being set up. Check back in a few minutes.'
    : 'The leaderboard did not load. Refresh to try again.'
)

const Thumb = ({ points, color }) => {
  if (!points || points.length < 2) return <div className="thumb" />
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const span = Math.max(maxX - minX, maxY - minY) || 1e-9
  const ox = (span - (maxX - minX)) / 2
  const oy = (span - (maxY - minY)) / 2
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${((p[0] - minX + ox) / span) * 100} ${(1 - (p[1] - minY + oy) / span) * 100}`).join(' ')
  return (
    <svg className="thumb" viewBox="-8 -8 116 116" aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

const VoteButton = ({ count, on, busy, onClick, title }) => (
  <button
    type="button"
    className={`vote${on ? ' on' : ''}`}
    onClick={onClick}
    disabled={busy}
    aria-pressed={on}
    aria-label={on ? `Remove your upvote from ${title}` : `Upvote ${title}`}
  >
    <span aria-hidden="true">▲</span>
    <b>{count}</b>
  </button>
)

const useLayoutBoard = (rank, active) => {
  const [state, setState] = useState(() => ({
    items: [],
    cursor: null,
    more: false,
    loaded: !firebaseConfigured,
    error: '',
    loading: false,
  }))
  const paging = useRef(false)

  useEffect(() => {
    if (!active || !firebaseConfigured) return undefined
    let live = true
    pageLayouts(null, rank).then((page) => {
      if (!live) return
      setState({
        items: page.items,
        cursor: page.cursor,
        more: page.items.length === PAGE_SIZE,
        loaded: true,
        error: '',
        loading: false,
      })
    }).catch((err) => {
      if (!live) return
      console.error(err)
      setState((prev) => ({ ...prev, loaded: true, loading: false, error: boardMessage(err) }))
    })
    return () => { live = false }
  }, [active, rank])

  const loadMore = async () => {
    if (paging.current || !state.cursor) return
    paging.current = true
    setState((prev) => ({ ...prev, loading: true, error: '' }))
    try {
      const page = await pageLayouts(state.cursor, rank)
      setState((prev) => ({
        items: [...prev.items, ...page.items],
        cursor: page.cursor,
        more: page.items.length === PAGE_SIZE,
        loaded: true,
        error: '',
        loading: false,
      }))
    } catch (err) {
      console.error(err)
      setState((prev) => ({ ...prev, loading: false, error: boardMessage(err) }))
    } finally {
      paging.current = false
    }
  }

  return { ...state, loadMore }
}

const useTracks = (active) => {
  const [state, setState] = useState(() => ({ items: [], loaded: !firebaseConfigured, error: '' }))

  useEffect(() => {
    if (!active || !firebaseConfigured) return undefined
    let live = true
    listTracks().then((items) => {
      if (!live) return
      setState({ items, loaded: true, error: '' })
    }).catch((err) => {
      if (!live) return
      console.error(err)
      setState({ items: [], loaded: true, error: 'The track list did not load. Refresh to try again.' })
    })
    return () => { live = false }
  }, [active])

  return state
}

const useTrackTimes = (layoutId, revision, active) => {
  const [state, setState] = useState(null)

  useEffect(() => {
    if (!active || !firebaseConfigured || !layoutId || !revision) return undefined
    let live = true
    listTimes(layoutId, revision).then((rows) => {
      if (!live) return
      setState({ layoutId, revision, rows, error: '' })
    }).catch((err) => {
      if (!live) return
      console.error(err)
      setState({ layoutId, revision, rows: [], error: 'The lap board did not load. Refresh to try again.' })
    })
    return () => { live = false }
  }, [active, layoutId, revision])

  const ready = Boolean(state && state.layoutId === layoutId && state.revision === revision)
  return {
    rows: ready ? state.rows : [],
    ready,
    error: ready ? state.error : '',
  }
}

export const Home = () => {
  const { world, error } = useWorld()
  const user = useAuth()
  const [mode, setMode] = useState('votes')
  const [trackId, setTrackId] = useState('current')
  const [selected, setSelected] = useState(null)
  const hero = useRef(null)
  const votesBoard = useLayoutBoard('votes', true)
  const indexBoard = useLayoutBoard('index', mode === 'index')
  const tracks = useTracks(mode === 'lap')
  const layoutBoard = mode === 'index' ? indexBoard : votesBoard
  const items = layoutBoard.items
  const ids = useMemo(() => (mode === 'lap' ? [] : items.map((item) => item.id)), [mode, items])
  const votes = useVotes(ids, user)

  const known = useMemo(() => {
    const map = new Map()
    for (const item of votesBoard.items) map.set(item.id, item)
    for (const item of indexBoard.items) map.set(item.id, item)
    for (const item of tracks.items) map.set(item.id, item)
    return map
  }, [votesBoard.items, indexBoard.items, tracks.items])

  const trackOptions = useMemo(() => {
    const map = new Map(tracks.items.map((item) => [item.id, item]))
    if (trackId !== 'current' && !map.has(trackId)) {
      const extra = known.get(trackId)
      if (extra) map.set(trackId, extra)
    }
    return [...map.values()].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))
  }, [tracks.items, trackId, known])

  const shownTrack = trackId !== 'current' && tracks.loaded && !known.has(trackId) ? 'current' : trackId
  const trackRevision = shownTrack === 'current'
    ? layoutRevision('current', world?.current, world)
    : layoutRevision(shownTrack, known.get(shownTrack) || null, world)
  const times = useTrackTimes(shownTrack, trackRevision, mode === 'lap')

  const previewId = mode === 'lap' ? (shownTrack === 'current' ? null : shownTrack) : selected
  const picked = previewId ? known.get(previewId) || null : null
  const pickedResult = useMemo(() => (picked && world ? analyze(decodePath(picked.path), world.dem, world.graph) : null), [picked, world])
  const shown = pickedResult || world?.result
  const buckets = useMemo(() => (world ? tagIndex(world.graph) : null), [world])
  const ribbon = useMemo(() => (buckets && shown ? ribbonFor(world.graph, shown, buckets) : []), [world, shown, buckets])

  const today = world?.result.metrics
  const todayIndex = today?.overtaking_score_2026 || 0
  const place = mode !== 'lap' && picked ? items.findIndex((item) => item.id === picked.id) : -1

  const preview = (id) => {
    setSelected((prev) => (prev === id ? null : id))
    if (window.innerWidth < 900) hero.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const chooseMode = (next) => {
    if (next === mode) return
    if (next === 'lap') {
      if (selected) setTrackId(selected)
    } else if (mode === 'lap') {
      setSelected(shownTrack === 'current' ? null : shownTrack)
    }
    setMode(next)
  }

  const versus = (index) => {
    if (!todayIndex || index == null) return ''
    const ratio = index / todayIndex
    if (ratio >= 1.05) return `${ratio.toFixed(1)}× today`
    if (ratio <= 0.95) return 'worse than today'
    return 'level with today'
  }

  const blurb = mode === 'index'
    ? 'Highest 2026 overtaking index first.'
    : mode === 'lap'
      ? 'Fastest driven lap on the track you pick.'
      : (user ? 'Vote for the layouts you would watch.' : 'Sign in to vote your favorites.')

  return (
    <div className="home">
      <section className="home-copy">
        <p className="kicker">Singapore GP Fan Redesign</p>
        <h1>Marina Bay Circuit has an overtaking problem. <em>Fix it.</em></h1>
        <p className="lede">62 laps under the lights and hardly anywhere to pass. Keep the start/finish straight, take any street after Turn 1, and find out in seconds whether your lap would let cars race under the 2026 rules.</p>
        <div className="ctas">
          <Link to="/create" className="go big">Draw your layout</Link>
          <Link to="/create?from=current" className="tool big">Remix today&apos;s lap</Link>
        </div>

        {today && (
          <div className="benchmark">
            <div>
              <span>The lap to beat</span>
              <b>{todayIndex.toFixed(2)}</b>
              <small>overtaking index</small>
            </div>
            <p>That&apos;s today&apos;s layout: {today.length_km.toFixed(2)} km and only {today.heavy_braking_zones} proper braking zones to pass into. Score higher and you&apos;ve out-designed the real thing.</p>
          </div>
        )}

        <div className="board-head">
          <h2>The Leaderboard</h2>
          <div className="board-modes" role="group" aria-label="Leaderboard">
            {MODES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={mode === item.id ? 'on' : ''}
                aria-pressed={mode === item.id}
                onClick={() => chooseMode(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <p>{blurb}</p>
        </div>
        {mode === 'lap' && (
          <label className="track-pick">
            <span>Track</span>
            <select value={shownTrack} onChange={(event) => setTrackId(event.target.value)}>
              <option value="current">Today&apos;s lap</option>
              {trackOptions.map((item) => (
                <option key={item.id} value={item.id}>{item.title}</option>
              ))}
            </select>
          </label>
        )}
        {error && <p className="error">{error.message}</p>}
        {!firebaseConfigured && <p className="small">The leaderboard needs Firebase. You can still draw a layout and keep it on this browser.</p>}
        {mode !== 'lap' && layoutBoard.error && <p className="error">{layoutBoard.error}</p>}
        {mode === 'lap' && tracks.error && <p className="error">{tracks.error}</p>}
        {mode === 'lap' && times.error && <p className="error">{times.error}</p>}
        {votes.error && <p className="error">{votes.error}</p>}
        {mode !== 'lap' && layoutBoard.loaded && firebaseConfigured && !layoutBoard.error && items.length === 0 && (
          <div className="empty">
            <b>The leaderboard is empty.</b>
            <p>Nobody has published a layout yet. Draw one and take the top spot.</p>
            <Link to="/create" className="go">Claim pole</Link>
          </div>
        )}
        {mode === 'lap' && firebaseConfigured && times.ready && !times.error && times.rows.length === 0 && (
          <div className="empty">
            <b>No laps yet.</b>
            <p>Nobody has posted a time on this track. Drive it and take pole.</p>
            <Link to={`/l/${shownTrack}/drive`} className="go">Drive it</Link>
          </div>
        )}
        {firebaseConfigured && ((mode !== 'lap' && !layoutBoard.loaded) || (mode === 'lap' && !times.ready && !times.error)) && (
          <p className="small">Lining up the grid…</p>
        )}
        {mode !== 'lap' && (
          <ol className="board">
            {items.map((item, index) => (
              <li key={item.id} className={selected === item.id ? 'on' : ''}>
                <span className={`pos${index < 3 ? ` p${index + 1}` : ''}`}>P{index + 1}</span>
                <button type="button" className="row" onClick={() => preview(item.id)} aria-pressed={selected === item.id}>
                  <Thumb points={decodePath(item.thumb || item.path)} color={item.color} />
                  <span className="row-copy">
                    <b>{item.title}</b>
                    <span>by {item.creatorName || 'someone'} · {senseLabel(item.racingSense)}</span>
                    <span className="stats">
                      <em className={mode === 'index' ? 'lead' : ''}>Index {(item.summary?.overtakingIndex ?? 0).toFixed(2)}</em>
                      {versus(item.summary?.overtakingIndex) && <em className="vs">{versus(item.summary?.overtakingIndex)}</em>}
                      <em>{item.summary?.lengthKm?.toFixed?.(2) || '—'} km</em>
                    </span>
                  </span>
                </button>
                <VoteButton
                  title={item.title}
                  count={votes.count(item.id, item.votes)}
                  on={votes.voted.has(item.id)}
                  busy={votes.busy === item.id}
                  onClick={() => votes.toggle(item.id)}
                />
                {mode === 'index' && <span className="mark index" title="Overtaking index">{(item.summary?.overtakingIndex ?? 0).toFixed(2)}</span>}
              </li>
            ))}
          </ol>
        )}
        {mode === 'lap' && times.rows.length > 0 && (
          <ol className="board">
            {times.rows.map((row, index) => {
              const mine = user?.uid === row.uid
              return (
                <li key={row.uid} className={mine ? 'mine' : ''} aria-current={mine ? 'true' : undefined}>
                  <span className={`pos${index < 3 ? ` p${index + 1}` : ''}`}>P{index + 1}</span>
                  <div className="row static">
                    <span className="row-copy">
                      <b>{row.name}</b>
                      {mine && <span>Your lap</span>}
                    </span>
                  </div>
                  <span className="mark">{fmtLap(row.timeS, 3)}</span>
                </li>
              )
            })}
          </ol>
        )}
        {mode !== 'lap' && layoutBoard.more && (
          <button type="button" className="tool" onClick={layoutBoard.loadMore} disabled={layoutBoard.loading}>Show more layouts</button>
        )}
        {mode === 'lap' && times.rows.length > 0 && (
          <Link to={`/l/${shownTrack}/drive`} className="tool">Drive this track</Link>
        )}
        <p className="fineprint">
          Numbers come from a point-mass sim of the 2026 rules: good for comparing layouts, not for predicting a race. Not affiliated with Formula 1 or the Singapore Grand Prix.
        </p>
        <SiteFooter />
      </section>

      <section className="home-hero" ref={hero} aria-label="3D view of the selected lap">
        {world && shown && (
          <CircuitMap
            style={world.style}
            color={picked ? picked.color : world.current.color}
            centerline={shown.features.centerline}
            grid={shown.features.grid}
            ribbon={ribbon}
            trace={shown.trace}
            playing
            is3d
            fitKey={`hero-${picked?.id || 'current'}`}
            spin
          />
        )}
        {!world && <p className="loading">Closing the roads…</p>}
        {world && (
          <div className="hero-card">
            {picked ? (
              <>
                <span className="tag">{place >= 0 ? `P${place + 1} · fan layout` : (mode === 'lap' ? 'Track' : 'Fan layout')}</span>
                <b>{picked.title}</b>
                <p>by {picked.creatorName} · {(picked.summary?.lengthKm ?? 0).toFixed(2)} km · index {(picked.summary?.overtakingIndex ?? 0).toFixed(2)}.</p>
                <div className="hero-actions">
                  <Link to={`/l/${picked.id}`} className="go">Open in the lab</Link>
                  <Link to={`/l/${picked.id}/drive`} className="tool">Drive it</Link>
                </div>
              </>
            ) : (
              <>
                <span className="tag">Today&apos;s lap</span>
                <b>Marina Bay Circuit, as raced since 2023</b>
                <p>{today.length_km.toFixed(2)} km · {today.corners} corners · index {todayIndex.toFixed(2)}. {mode === 'lap' ? 'Lap times for this track are in the list.' : 'Pick a layout from the grid to see it here.'}</p>
                <div className="hero-actions">
                  <Link to="/l/current" className="tool">Open in the lab</Link>
                  <Link to="/l/current/drive" className="tool">Drive it</Link>
                </div>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
