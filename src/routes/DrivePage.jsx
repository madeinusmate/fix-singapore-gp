import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { Link, useParams } from 'react-router-dom'
import { auth, firebaseConfigured, signIn, useAuth } from '../firebase/client.js'
import { boardId, readCurrentPin } from '../firebase/times.js'
import { createCarAudio, readMuted, saveMuted } from '../drive/audio.js'
import { IDLE_RPM, LIMIT_RPM, SHIFT_RPM } from '../drive/car.js'
import { brakingPoints } from '../drive/braking.js'
import { buildCourse } from '../drive/course.js'
import { CAMERA_NAMES, CAMERAS } from '../drive/cameras.js'
import { DRIVE_CREDITS } from '../drive/credits.js'
import { DriveScene } from '../drive/DriveScene.jsx'
import { postNote } from '../drive/postLap.js'
import { TouchPad } from '../drive/TouchPad.jsx'
import { useControls } from '../drive/useControls.js'
import { useLapPost } from '../drive/useLapPost.js'
import '../drive/drive.css'
import { fmtLap } from '../lab/numbers.js'
import { layoutRevision } from '../lab/revision.js'
import { useLayoutView } from '../lab/useLayoutView.js'
import { drivePageMeta } from '../seo.js'
import { usePageMeta } from '../usePageMeta.js'
import { logDriveStarted, logLapCompleted } from '../rheo/events.js'

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

const Hud = ({ hud, last, best, record, note, simLap, color }) => {
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
      <div className="drive-readouts">
        <div>
          <b>{hud?.timed ? <><span className="wide-label">Timed lap</span><span className="short-label">Lap</span></> : 'Out lap'}</b>
          <span>{hud?.timed ? fmtLap(hud.time, 2) : <><span className="wide-label">Cross the line</span><span className="short-label">Start</span></>}</span>
          {hud?.offRoad && <em className="warn">Off the road</em>}
        </div>
        <div>
          <b><span className="wide-label">Sim ghost</span><span className="short-label">Ghost</span></b>
          <span className={hud?.gap == null ? '' : hud.gap > 0 ? 'behind' : 'ahead'}>{hud?.gap == null ? fmtLap(simLap, 2) : fmtGap(hud.gap)}</span>
        </div>
        <div>
          <b><span className="wide-label">Last lap</span><span className="short-label">Last</span></b>
          <span>{last ? fmtLap(last.time, 3) : '—'}</span>
          {note && <em className="bad">{note}</em>}
        </div>
        <div>
          <b><span className="wide-label">Personal best</span><span className="short-label">Best</span></b>
          <span>{best ? fmtLap(best, 3) : '—'}</span>
        </div>
        <div>
          <b><span className="wide-label">Lap record</span><span className="short-label">Record</span></b>
          <span>{record ? fmtLap(record, 3) : '—'}</span>
        </div>
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
  const { id, slug = 'singapore' } = useParams()
  const { world, error, view, missing, unavailable } = useLayoutView(id, slug)
  usePageMeta(drivePageMeta({ id, view, missing, unavailable, circuit: slug }))
  const user = useAuth()
  const { read, press } = useControls()
  const [hud, setHud] = useState(null)
  const [last, setLast] = useState(null)
  const [resetKey, setResetKey] = useState(0)
  const [camera, setCamera] = useState(CAMERAS[0])
  const [muted, setMuted] = useState(readMuted)
  const [credits, setCredits] = useState(false)
  const pausedRef = useRef(false)
  const [signingIn, setSigningIn] = useState(false)
  const [signInError, setSignInError] = useState('')
  const [authReady, setAuthReady] = useState(!firebaseConfigured)
  const [pinFor, setPinFor] = useState(null)
  const audio = useRef(null)
  const course = useMemo(() => (view && world ? buildCourse(view.result, world.graph) : null), [view, world])
  const points = useMemo(
    () => (view ? brakingPoints(view.result.features.prep, view.result.features.def.brk) : []),
    [view],
  )
  const revision = layoutRevision(id, view, world)
  const pin = pinFor?.id === id ? pinFor.pin : null
  const pinPending = id === 'current' && firebaseConfigured && pinFor?.id !== id
  const pinMatches = id !== 'current' || (pin?.revision === revision && pin.simLapS > 0)
  const liveRevision = pinMatches ? revision : null
  const simLapS = id === 'current'
    ? (pinMatches ? pin.simLapS : null)
    : (view?.summary?.lapS ?? view?.result?.metrics?.lap_s ?? null)
  const { note, record, best, accept } = useLapPost({ id, circuit: slug, user, revision, liveRevision, simLapS, pinPending })

  const restart = useCallback(() => {
    setResetKey((k) => k + 1)
    setHud(null)
  }, [])
  const nextCamera = useCallback(() => setCamera((c) => CAMERAS[(CAMERAS.indexOf(c) + 1) % CAMERAS.length]), [])
  const toggleMute = useCallback(() => setMuted((m) => !m), [])
  const onSignIn = useCallback(async () => {
    if (signingIn || pausedRef.current) return
    pausedRef.current = true
    setSigningIn(true)
    setSignInError('')
    try {
      await signIn()
    } catch (err) {
      if (err?.code !== 'auth/popup-closed-by-user' && err?.code !== 'auth/cancelled-popup-request') {
        setSignInError(err?.code === 'auth/popup-blocked' ? 'Allow pop-ups for this site, then try again.' : 'Could not sign in.')
      }
    } finally {
      pausedRef.current = false
      setSigningIn(false)
    }
  }, [signingIn])

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

  useEffect(() => {
    if (!auth) return undefined
    return onAuthStateChanged(auth, () => setAuthReady(true))
  }, [])

  useEffect(() => {
    if (id !== 'current' || !firebaseConfigured) return undefined
    let live = true
    readCurrentPin(boardId(slug, 'current'))
      .then((next) => { if (live) setPinFor({ id, pin: next }) })
      .catch(() => { if (live) setPinFor({ id, pin: null }) })
    return () => { live = false }
  }, [id, slug])

  useEffect(() => {
    if (!course || !id) return
    logDriveStarted(id)
  }, [course, id])

  const onLap = useCallback((lap) => {
    setLast(lap)
    const previous = accept(lap)
    logLapCompleted({
      layoutId: id,
      clean: lap.clean,
      timeS: lap.time,
      personalBest: Boolean(previous == null || lap.time < previous),
    })
  }, [id, accept])

  if (error) return <p className="loading">{error.message}</p>
  if (missing || unavailable) return (
    <div className="missing">
      <h1>This layout has left the track.</h1>
      <p>It may have been deleted, or the link is wrong.</p>
      <Link to={`/${slug}`}>Back to the leaderboard</Link>
    </div>
  )
  if (!course) return <p className="loading">Warming the tyres…</p>

  const showBanner = firebaseConfigured && authReady && !user

  return (
    <div className="drive">
      {showBanner && (
        <div className="drive-signin" role="status">
          <p>Sign in to save your laps and see your name on the leaderboard.</p>
          <button type="button" onClick={onSignIn} disabled={signingIn}>
            {signingIn ? 'Waiting for Google…' : 'Sign in'}
          </button>
          {signInError && <p className="drive-signin-error">{signInError}</p>}
        </div>
      )}
      <div className="drive-stage">
        <DriveScene
          key={slug}
          citySlug={slug}
          course={course}
          trace={view.result.trace}
          points={points}
          color={view.color}
          read={read}
          resetKey={resetKey}
          view={camera}
          audio={audio}
          onLap={onLap}
          onHud={setHud}
          pausedRef={pausedRef}
        />
        <Hud
          hud={hud}
          last={last}
          best={best}
          record={record}
          note={postNote(note)}
          simLap={view.result.metrics.lap_s}
          color={view.color}
        />
        <div className="drive-dock">
          <TouchPad press={press} />
          <div className="drive-bar">
            <Link to={`/${slug}/l/${id}`} className="tool drive-back">Back</Link>
            <button type="button" className="tool drive-restart" onClick={restart}>
              <span className="wide-label">Restart</span>
              <span className="short-label">Reset</span>
            </button>
            <button type="button" className="tool drive-cam" onClick={nextCamera} aria-label={`${CAMERA_NAMES[camera]} camera`}>
              <span className="wide-label">{CAMERA_NAMES[camera]} cam</span>
              <span className="short-label">Cam</span>
            </button>
            <button type="button" className="tool drive-sound" onClick={toggleMute} aria-pressed={muted} aria-label={muted ? 'Sound off' : 'Sound on'}>
              <span className="wide-label">{muted ? 'Sound off' : 'Sound on'}</span>
              <span className="short-label">{muted ? 'Muted' : 'Sound'}</span>
            </button>
            <span className="drive-title">{view.title}</span>
            <span className="drive-keys">↑ throttle · ↓ brake, hold to reverse · ← → steer · E/Q shift · C camera · M sound · R restart</span>
            <button type="button" className="drive-credit" onClick={() => setCredits(true)}>
              <span className="wide-label">Credits: OpenStreetMap, OSM2World, Blender458 (CC BY), audible-edge (CC BY)…</span>
              <span className="short-label">Credits</span>
            </button>
          </div>
        </div>
        {credits && <Credits onClose={() => setCredits(false)} />}
      </div>
    </div>
  )
}
