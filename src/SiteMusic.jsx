import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { MUSIC_URL, MUSIC_VOLUME, isDrivePath, readMusicMuted, saveMusicMuted } from './music.js'

const SpeakerIcon = ({ off }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path fill="currentColor" d="M3.5 9.2h3.4L11.2 5v14l-4.3-4.2H3.5z" />
    {off ? (
      <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" d="M15.2 9.6l5.2 5.2M20.4 9.6l-5.2 5.2" />
    ) : (
      <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" d="M15 8.6a4.4 4.4 0 0 1 0 6.8M17.5 6.2a7.6 7.6 0 0 1 0 11.6" />
    )}
  </svg>
)

export const SiteMusic = () => {
  const { pathname } = useLocation()
  const onDrive = isDrivePath(pathname)
  const audioRef = useRef(null)
  const [muted, setMuted] = useState(readMusicMuted)
  const [playing, setPlaying] = useState(false)
  const mutedRef = useRef(muted)
  const driveRef = useRef(onDrive)

  useLayoutEffect(() => {
    const audio = audioRef.current
    if (!audio) return undefined
    const sync = () => setPlaying(!audio.paused)
    audio.addEventListener('play', sync)
    audio.addEventListener('pause', sync)
    audio.addEventListener('ended', sync)
    sync()
    return () => {
      audio.removeEventListener('play', sync)
      audio.removeEventListener('pause', sync)
      audio.removeEventListener('ended', sync)
    }
  }, [])

  useEffect(() => {
    mutedRef.current = muted
    driveRef.current = onDrive
    const audio = audioRef.current
    if (!audio) return
    audio.loop = true
    audio.volume = MUSIC_VOLUME
    if (muted || onDrive) audio.pause()
  }, [muted, onDrive])

  const toggle = () => {
    const audio = audioRef.current
    if (!muted && audio?.paused && !onDrive) {
      audio.play()?.catch(() => {})
      return
    }
    const next = !muted
    mutedRef.current = next
    setMuted(next)
    saveMusicMuted(next)
    if (!audio || onDrive) return
    if (next) audio.pause()
    else audio.play()?.then(() => {
      if (mutedRef.current || driveRef.current) audio.pause()
    }).catch(() => {})
  }

  const off = muted || !playing
  const label = off ? 'Play music' : 'Pause music'

  return (
    <>
      <audio className="site-music" ref={audioRef} src={MUSIC_URL} loop preload="none" aria-hidden="true" />
      {!onDrive && (
        <button
          type="button"
          className={`music${playing ? ' on' : ''}`}
          aria-pressed={!off}
          aria-label={label}
          title={label}
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onClick={toggle}
        >
          <SpeakerIcon off={off} />
        </button>
      )}
    </>
  )
}
