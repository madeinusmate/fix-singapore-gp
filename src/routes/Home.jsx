import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { firebaseConfigured } from '../firebase/client.js'
import { pageLayouts } from '../firebase/layouts.js'
import { CircuitMap } from '../lab/CircuitMap.jsx'
import { fmtLap, senseLabel } from '../lab/numbers.js'
import { decodePath } from '../sim/polyline.js'
import { useWorld } from '../world.js'

const Thumb = ({ points, color }) => {
  if (!points || points.length < 2) return <div className="thumb" />
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const w = maxX - minX || 1e-9
  const h = maxY - minY || 1e-9
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${((p[0] - minX) / w) * 100} ${(1 - (p[1] - minY) / h) * 100}`).join(' ')
  return (
    <svg className="thumb" viewBox="-6 -6 112 112" aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

const Card = ({ title, meta, points, color, onSelect, selected }) => (
  <button type="button" className={`card${selected ? ' on' : ''}`} onClick={onSelect}>
    <Thumb points={points} color={color} />
    <div>
      <b>{title}</b>
      <span>{meta}</span>
    </div>
  </button>
)

export const Home = () => {
  const { world, error } = useWorld()
  const [items, setItems] = useState([])
  const [cursor, setCursor] = useState(null)
  const [more, setMore] = useState(false)
  const [galleryError, setGalleryError] = useState('')
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    if (!firebaseConfigured) return undefined
    let live = true
    pageLayouts(null).then((page) => {
      if (!live) return
      setItems(page.items)
      setCursor(page.cursor)
      setMore(page.items.length === 24)
    }).catch((err) => { if (live) setGalleryError(err.message) })
    return () => { live = false }
  }, [])

  const loadMore = async () => {
    const page = await pageLayouts(cursor)
    setItems((prev) => [...prev, ...page.items])
    setCursor(page.cursor)
    setMore(page.items.length === 24)
  }

  const currentPoints = world?.current.path
  const currentSummary = world?.result.metrics
  const preview = selected === 'current'
    ? { id: 'current', title: world.current.title, color: world.current.color, points: currentPoints, sense: world.current.racingSense, creatorName: 'Marina Bay', summary: currentSummary && { lengthKm: currentSummary.length_km, lapS: currentSummary.lap_s, overtakingIndex: currentSummary.overtaking_score_2026, heavyBraking: currentSummary.heavy_braking_zones } }
    : items.find((item) => item.id === selected)

  return (
    <div className="home">
      <section className="pitch">
        <p className="kicker">Singapore Grand Prix · 2026 regulations</p>
        <h1>Draw a lap of Marina Bay. See where the overtaking is.</h1>
        <p>The start/finish straight stays where it is. You choose the streets after that, and whether the race runs clockwise or anticlockwise. A point-mass sim estimates the lap and a simple overtaking index. The numbers are estimates, not a prediction of a real race.</p>
        <Link to="/create" className="go">Create a layout</Link>
      </section>
      {error && <p>{error.message}</p>}
      <h2>The current circuit</h2>
      {world && (
        <div className="pinned"><Card
          title={world.current.title}
          color={world.current.color}
          points={currentPoints}
          selected={selected === 'current'}
          meta={currentSummary ? `${currentSummary.length_km.toFixed(2)} km · ${fmtLap(currentSummary.lap_s)} · index ${currentSummary.overtaking_score_2026.toFixed(2)}` : ''}
          onSelect={() => setSelected('current')}
        /></div>
      )}
      <h2>Layouts people have published</h2>
      {!firebaseConfigured && <p className="small">The gallery needs Firebase. Until then you can still open the current circuit and draft a layout on this browser.</p>}
      {galleryError && <p className="small">{galleryError}</p>}
      <div className="cards">
        {items.map((item) => (
          <Card
            key={item.id}
            title={item.title}
            color={item.color}
            points={decodePath(item.thumb || item.path)}
            selected={selected === item.id}
            meta={`${item.creatorName || 'Someone'} · ${senseLabel(item.racingSense)} · ${item.summary?.lengthKm?.toFixed?.(2) || '—'} km`}
            onSelect={() => setSelected(item.id)}
          />
        ))}
      </div>
      {more && <button type="button" className="tool" onClick={loadMore}>Load more</button>}
      {preview && world && (
        <div className="sheet" role="dialog" aria-label={preview.title}>
          <div className="sheet-map">
            <CircuitMap
              style={world.style}
              color={preview.color}
              centerline={preview.points || decodePath(preview.path)}
              grid={(preview.sense || preview.racingSense) === 'cw' ? [...world.current.grid].reverse() : world.current.grid}
              is3d={false}
              fitKey={preview.id}
            />
          </div>
          <div className="sheet-copy">
            <h3>{preview.title}</h3>
            <p>{preview.creatorName} · {senseLabel(preview.sense || preview.racingSense)}</p>
            <p className="figures">
              <span>{(preview.summary?.lengthKm ?? 0).toFixed(2)} km</span>
              <span>{fmtLap(preview.summary?.lapS || 0)}</span>
              <span>Index {(preview.summary?.overtakingIndex ?? 0).toFixed(2)}</span>
              <span>{preview.summary?.heavyBraking ?? 0} heavy stops</span>
            </p>
            <Link to={`/l/${preview.id}`} className="go">Open</Link>
            <button type="button" className="tool" onClick={() => setSelected(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
