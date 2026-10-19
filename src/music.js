// Site theme. The drive page has its own car sound, so the theme stays off there.
export const MUSIC_URL = `${import.meta.env.BASE_URL}audio/f1-theme.mp3`
export const MUSIC_VOLUME = 0.45
const MUTE_KEY = 'music-muted'

export const isDrivePath = (pathname) => /^\/(?:(?:singapore|azerbaijan|monaco|las-vegas|miami|madrid)\/)?l\/[^/]+\/drive\/?$/.test(pathname)

export const readMusicMuted = () => {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

export const saveMusicMuted = (muted) => {
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
  } catch {
    // Private mode: the toggle still works for this visit.
  }
}
