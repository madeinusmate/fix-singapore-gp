import { statSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isDrivePath, readMusicMuted, saveMusicMuted } from './music.js'

describe('site music', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('plays on every page except a layout drive', () => {
    expect(isDrivePath('/')).toBe(false)
    expect(isDrivePath('/create')).toBe(false)
    expect(isDrivePath('/l/layout9')).toBe(false)
    expect(isDrivePath('/l/layout9/drive')).toBe(true)
    expect(isDrivePath('/singapore/l/layout9/drive')).toBe(true)
    expect(isDrivePath('/l/current/drive/')).toBe(true)
    expect(isDrivePath('/singapore/l/current/drive/')).toBe(true)
    expect(isDrivePath('/l/layout9/drive/extra')).toBe(false)
  })

  it('remembers when the theme is muted', () => {
    const store = new Map()
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key) => store.get(key) ?? null,
        setItem: (key, value) => store.set(key, value),
      },
    })
    expect(readMusicMuted()).toBe(false)
    saveMusicMuted(true)
    expect(readMusicMuted()).toBe(true)
    saveMusicMuted(false)
    expect(readMusicMuted()).toBe(false)
  })

  it('ships the theme recording', () => {
    const file = statSync(new URL('../public/audio/f1-theme.mp3', import.meta.url))
    expect(file.size).toBeGreaterThan(1_000_000)
  })
})
