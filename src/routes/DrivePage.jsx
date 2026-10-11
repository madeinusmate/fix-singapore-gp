import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { carSpec } from '../drive/car.js'
import { buildCourse } from '../drive/course.js'
import { DriveScene } from '../drive/DriveScene.jsx'
import { bestKey, readBest, saveBest } from '../drive/lap.js'
import { TouchPad } from '../drive/TouchPad.jsx'
import { useControls } from '../drive/useControls.js'
import '../drive/drive.css'
import { fmtLap } from '../lab/numbers.js'
import { useLayoutView } from '../lab/useLayoutView.js'

const fmtGap = (s) => `${s >= 0 ? '+' : '−'}${Math.abs(s).toFixed(2)}`

const Hud = ({ hud, last, best, simLap, color }) => (
  <div className="drive-hud" style={{ '--c': color }}>
    <div className="speed">
      <span>{hud ? Math.round(hud.kmh) : 0}</span>
      <small>km/h</small>
    </div>
    <div>
      <b>{hud?.timed ? 'Timed lap' : 'Out lap'}</b>
      <span>{hud?.timed ? fmtLap(hud.time, 2) : 'Cross the line'}</span>
      {hud?.timed && hud.spoiled && <em className="bad">Not clean</em>}
      {!hud?.spoiled && hud?.offRoad && <em className="warn">Off the road</em>}
    </div>
    <div>
      <b>Sim ghost</b>
      <span className={hud?.gap == null ? '' : hud.gap > 0 ? 'behind' : 'ahead'}>{hud?.gap == null ? fmtLap(simLap, 2) : fmtGap(hud.gap)}</span>
    </div>
    <div>
      <b>Last lap</b>
      <span>{last ? fmtLap(last.time, 3) : '—'}</span>
      {last && !last.clean && <em className="bad">Not clean</em>}
    </div>
    <div>
      <b>Personal best</b>
      <span>{best ? fmtLap(best, 3) : '—'}</span>
    </div>
  </div>
)

export const DrivePage = () => {
  const { id } = useParams()
  const { world, error, view, missing, unavailable } = useLayoutView(id)
  const { read, press } = useControls()
  const [hud, setHud] = useState(null)
  const [last, setLast] = useState(null)
  const [resetKey, setResetKey] = useState(0)
  const course = useMemo(() => (view && world ? buildCourse(view.result, world.graph) : null), [view, world])
  const spec = useMemo(() => (view ? carSpec(view.result.metrics.top_kmh) : null), [view])
  const key = view ? bestKey(id, view.result.features.prep.length) : null
  const [saved, setSaved] = useState({})
  const best = key ? (saved[key] ?? readBest(key)) : null

  const restart = useCallback(() => {
    setResetKey((k) => k + 1)
    setHud(null)
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'KeyR' && !e.repeat) restart()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [restart])

  const onLap = useCallback((lap) => {
    setLast(lap)
    if (!lap.clean || !key) return
    const next = saveBest(key, lap.time)
    setSaved((all) => ({ ...all, [key]: next }))
  }, [key, setSaved])

  if (error) return <p className="loading">{error.message}</p>
  if (missing || unavailable) return (
    <div className="missing">
      <h1>This layout has left the track.</h1>
      <p>It may have been deleted, or the link is wrong.</p>
      <Link to="/">Back to the leaderboard</Link>
    </div>
  )
  if (!course) return <p className="loading">Warming the tyres…</p>

  return (
    <div className="drive">
      <DriveScene
        course={course}
        trace={view.result.trace}
        spec={spec}
        color={view.color}
        read={read}
        resetKey={resetKey}
        onLap={onLap}
        onHud={setHud}
      />
      <Hud hud={hud} last={last} best={best} simLap={view.result.metrics.lap_s} color={view.color} />
      <div className="drive-bar">
        <Link to={`/l/${id}`} className="tool">Back</Link>
        <button type="button" className="tool" onClick={restart}>Restart</button>
        <span className="drive-title">{view.title}</span>
        <span className="drive-keys">↑ throttle · ↓ brake / reverse · ← → steer · R restart</span>
      </div>
      <TouchPad press={press} />
    </div>
  )
}
