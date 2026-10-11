import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { createCarAudio, readMuted, saveMuted } from '../drive/audio.js'
import { IDLE_RPM, LIMIT_RPM, SHIFT_RPM } from '../drive/car.js'
import { buildCourse } from '../drive/course.js'
import { CAMERA_NAMES, CAMERAS } from '../drive/cameras.js'
import { DRIVE_CREDITS } from '../drive/credits.js'
import { DriveScene } from '../drive/DriveScene.jsx'
import { bestKey, readBest, saveBest } from '../drive/lap.js'
import { TouchPad } from '../drive/TouchPad.jsx'
import { useControls } from '../drive/useControls.js'
import '../drive/drive.css'
import { fmtLap } from '../lab/numbers.js'
import { useLayoutView } from '../lab/useLayoutView.js'

const fmtGap = (s) => `${s >= 0 ? '+' : '−'}${Math.abs(s).toFixed(2)}`
const SHIFT_LIGHTS = 10
const LIGHTS_FROM_RPM = 9000

const RevLights = ({ rpm }) => {
  const lit = Math.round(((rpm - LIGHTS_FROM_RPM) / (SHIFT_RPM - LIGHTS_FROM_RPM)) * SHIFT_LIGHTS)
  const flash = rpm >= SHIFT_RPM
  return (
    <span className={`revs${flash ? ' flash' : ''}`} aria-hidden="true">
      {Array.from({ length: SHIFT_LIGHTS }, (_, k) => (
        <i key={k} className={k < lit ? (k < 4 ? 'g' : k < 7 ? 'r' : 'b') : ''} />
      ))}
    </span>
  )
}

const Hud = ({ hud, last, best, simLap, color }) => {
  const rpm = hud?.rpm ?? IDLE_RPM
  const gear = hud ? (hud.gear === 0 ? 'R' : hud.gear) : 'N'
  return (
    <div className="drive-hud" style={{ '--c': color }}>
      <div className="speed">
        <RevLights rpm={rpm} />
        <span className="gear">{gear}</span>
        <span>{hud ? Math.round(hud.kmh) : 0}</span>
        <small>km/h</small>
        <span className="rpm-bar" aria-label={`${Math.round(rpm)} rpm`}>
          <i style={{ width: `${Math.max(0, Math.min(1, (rpm - IDLE_RPM) / (LIMIT_RPM - IDLE_RPM))) * 100}%` }} />
        </span>
        <em className="tags">
          {hud?.manual ? 'Manual' : 'Auto'}
          {hud?.xmode && <b className="xmode">X-mode</b>}
        </em>
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
}

const Credits = ({ onClose }) => (
  <div className="drive-credits" role="dialog" aria-label="Credits">
    <div className="head">
      <h2>Credits</h2>
      <button type="button" className="tool" onClick={onClose}>Close</button>
    </div>
    <p>The city, car, sky and sounds are open data and openly licensed work.</p>
    <ul>
      {DRIVE_CREDITS.map((credit) => (
        <li key={credit.what}>
          <b>{credit.what}</b>
          <span>
            <a href={credit.url} target="_blank" rel="noreferrer">{credit.title}</a> by {credit.by}, {credit.license}
            {credit.note ? `. ${credit.note}.` : ''}
          </span>
        </li>
      ))}
    </ul>
  </div>
)

export const DrivePage = () => {
  const { id } = useParams()
  const { world, error, view, missing, unavailable } = useLayoutView(id)
  const { read, press } = useControls()
  const [hud, setHud] = useState(null)
  const [last, setLast] = useState(null)
  const [resetKey, setResetKey] = useState(0)
  const [camera, setCamera] = useState(CAMERAS[0])
  const [muted, setMuted] = useState(readMuted)
  const [credits, setCredits] = useState(false)
  const audio = useRef(null)
  const course = useMemo(() => (view && world ? buildCourse(view.result, world.graph) : null), [view, world])
  const key = view ? bestKey(id, view.result.features.prep.length) : null
  const [saved, setSaved] = useState({})
  const best = key ? (saved[key] ?? readBest(key)) : null

  const restart = useCallback(() => {
    setResetKey((k) => k + 1)
    setHud(null)
  }, [])
  const nextCamera = useCallback(() => setCamera((c) => CAMERAS[(CAMERAS.indexOf(c) + 1) % CAMERAS.length]), [])
  const toggleMute = useCallback(() => setMuted((m) => !m), [])

  const mutedRef = useRef(muted)
  useEffect(() => {
    mutedRef.current = muted
    saveMuted(muted)
    audio.current?.setMuted(muted)
  }, [muted])

  // Browsers only start sound from a gesture, so the engine starts on the first key or tap.
  useEffect(() => {
    let starting = false
    let closed = false
    const start = () => {
      if (starting || audio.current) return
      starting = true
      createCarAudio({ muted: mutedRef.current })
        .then((made) => {
          if (closed) made.close()
          else audio.current = made
        })
        .catch(() => { starting = false })
    }
    window.addEventListener('keydown', start)
    window.addEventListener('pointerdown', start)
    return () => {
      closed = true
      window.removeEventListener('keydown', start)
      window.removeEventListener('pointerdown', start)
      audio.current?.close()
      audio.current = null
    }
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.repeat || e.target.closest?.('input, textarea')) return
      if (e.code === 'KeyR') restart()
      if (e.code === 'KeyC') nextCamera()
      if (e.code === 'KeyM') toggleMute()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [restart, nextCamera, toggleMute])

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
        color={view.color}
        read={read}
        resetKey={resetKey}
        view={camera}
        audio={audio}
        onLap={onLap}
        onHud={setHud}
      />
      <Hud hud={hud} last={last} best={best} simLap={view.result.metrics.lap_s} color={view.color} />
      <div className="drive-bar">
        <Link to={`/l/${id}`} className="tool">Back</Link>
        <button type="button" className="tool" onClick={restart}>Restart</button>
        <button type="button" className="tool" onClick={nextCamera}>{CAMERA_NAMES[camera]} cam</button>
        <button type="button" className="tool" onClick={toggleMute} aria-pressed={muted}>{muted ? 'Sound off' : 'Sound on'}</button>
        <span className="drive-title">{view.title}</span>
        <span className="drive-keys">↑ throttle · ↓ brake, hold to reverse · ← → steer · E/Q shift · C camera · M sound · R restart</span>
        <button type="button" className="drive-credit" onClick={() => setCredits(true)}>
          Credits: OpenStreetMap, OSM2World, Blender458 (CC BY), audible-edge (CC BY)…
        </button>
      </div>
      {credits && <Credits onClose={() => setCredits(false)} />}
      <TouchPad press={press} />
    </div>
  )
}
