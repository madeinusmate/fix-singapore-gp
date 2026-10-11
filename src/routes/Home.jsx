import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { firebaseConfigured, useAuth } from '../firebase/client.js'
import { pageLayouts, PAGE_SIZE } from '../firebase/layouts.js'
import { useVotes } from '../firebase/votes.js'
import { CircuitMap } from '../lab/CircuitMap.jsx'
import { senseLabel } from '../lab/numbers.js'
import { analyze } from '../sim/analyze.js'
import { decodePath } from '../sim/polyline.js'
import { ribbonFor, tagIndex } from '../sim/ribbon.js'
import { useWorld } from '../world.js'

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

export const Home = () => {
  const { world, error } = useWorld()
  const user = useAuth()
  const [items, setItems] = useState([])
  const [cursor, setCursor] = useState(null)
  const [more, setMore] = useState(false)
  const [loaded, setLoaded] = useState(!firebaseConfigured)
  const [boardError, setBoardError] = useState('')
  const [selected, setSelected] = useState(null)
  const hero = useRef(null)
  const ids = useMemo(() => items.map((item) => item.id), [items])
  const votes = useVotes(ids, user)

  useEffect(() => {
    if (!firebaseConfigured) return undefined
    let live = true
    pageLayouts(null).then((page) => {
      if (!live) return
      setItems(page.items)
      setCursor(page.cursor)
      setMore(page.items.length === PAGE_SIZE)
      setLoaded(true)
    }).catch((err) => {
      if (!live) return
      console.error(err)
      setBoardError(err.code === 'failed-precondition'
        ? 'The leaderboard is still being set up. Check back in a few minutes.'
        : 'The leaderboard did not load. Refresh to try again.')
      setLoaded(true)
    })
    return () => { live = false }
  }, [])

  const loadMore = async () => {
    const page = await pageLayouts(cursor)
    setItems((prev) => [...prev, ...page.items])
    setCursor(page.cursor)
    setMore(page.items.length === PAGE_SIZE)
  }

  const picked = items.find((item) => item.id === selected) || null
  const pickedResult = useMemo(() => (picked && world ? analyze(decodePath(picked.path), world.dem, world.graph) : null), [picked, world])
  const shown = pickedResult || world?.result
  const buckets = useMemo(() => (world ? tagIndex(world.graph) : null), [world])
  const ribbon = useMemo(() => (buckets && shown ? ribbonFor(world.graph, shown, buckets) : []), [world, shown, buckets])

  const today = world?.result.metrics
  const todayIndex = today?.overtaking_score_2026 || 0

  const preview = (id) => {
    setSelected((prev) => (prev === id ? null : id))
    if (window.innerWidth < 900) hero.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const versus = (index) => {
    if (!todayIndex || index == null) return ''
    const ratio = index / todayIndex
    if (ratio >= 1.05) return `${ratio.toFixed(1)}× today`
    if (ratio <= 0.95) return 'worse than today'
    return 'level with today'
  }

  return (
    <div className="home">
      <section className="home-copy">
        <p className="kicker">Singapore Grand Prix · Fan redesign</p>
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
          <p>{user ? 'Vote for the layouts you would watch.' : 'Sign in to vote your favorites.'}</p>
        </div>
        {error && <p className="error">{error.message}</p>}
        {!firebaseConfigured && <p className="small">The leaderboard needs Firebase. You can still draw a layout and keep it on this browser.</p>}
        {boardError && <p className="error">{boardError}</p>}
        {votes.error && <p className="error">{votes.error}</p>}
        {loaded && firebaseConfigured && !boardError && items.length === 0 && (
          <div className="empty">
            <b>The leaderboard is empty.</b>
            <p>Nobody has published a layout yet. Draw one and take the top spot.</p>
            <Link to="/create" className="go">Claim pole</Link>
          </div>
        )}
        {!loaded && <p className="small">Lining up the grid…</p>}
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
                    <em>Index {(item.summary?.overtakingIndex ?? 0).toFixed(2)}</em>
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
            </li>
          ))}
        </ol>
        {more && <button type="button" className="tool" onClick={loadMore}>Show more layouts</button>}
        <p className="fineprint">Numbers come from a point-mass sim of the 2026 rules: good for comparing layouts, not for predicting a race. Not affiliated with Formula 1 or the Singapore Grand Prix.</p>
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
                <span className="tag">P{items.indexOf(picked) + 1} · fan layout</span>
                <b>{picked.title}</b>
                <p>by {picked.creatorName} · {(picked.summary?.lengthKm ?? 0).toFixed(2)} km · index {(picked.summary?.overtakingIndex ?? 0).toFixed(2)}.</p>
                <div className="hero-actions">
                  <Link to={`/l/${picked.id}`} className="go">Open in the lab</Link>
                  <button type="button" className="tool" onClick={() => setSelected(null)}>Back to today&apos;s lap</button>
                </div>
              </>
            ) : (
              <>
                <span className="tag">Today&apos;s lap</span>
                <b>Marina Bay Circuit, as raced since 2023</b>
                <p>{today.length_km.toFixed(2)} km · {today.corners} corners · index {todayIndex.toFixed(2)}. Pick a layout from the grid to see it here.</p>
                <div className="hero-actions">
                  <Link to="/l/current" className="tool">Open in the lab</Link>
                </div>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
