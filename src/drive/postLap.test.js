import { describe, expect, it } from 'vitest'
import { byBoardOrder, postOutcome } from './postLap.js'

const base = {
  signedIn: true,
  timeS: 80,
  simLapS: 100,
  liveRevision: 'rev-a',
  row: null,
}

describe('posting a lap', () => {
  it('stores a lap that is not clean', () => {
    expect(postOutcome({ ...base, clean: false, timeS: 70 })).toEqual({ saveLocal: true, post: true, note: null })
  })

  it('keeps a signed-out lap in the browser and off the board', () => {
    expect(postOutcome({ ...base, signedIn: false })).toEqual({ saveLocal: true, post: false, note: null })
  })

  it('rejects a time faster than half the sim lap', () => {
    expect(postOutcome({ ...base, timeS: 49.999 }).note).toBe('floor')
    expect(postOutcome({ ...base, timeS: 49.999 }).post).toBe(false)
    expect(postOutcome({ ...base, timeS: 50 }).post).toBe(true)
  })

  it('refuses a lap when the layout revision is not the one you loaded', () => {
    expect(postOutcome({ ...base, liveRevision: null }).note).toBe('changed')
    expect(postOutcome({ ...base, liveRevision: null }).post).toBe(false)
  })

  it('posts a first lap and a faster one, and keeps an equal or slower time', () => {
    expect(postOutcome(base).post).toBe(true)
    expect(postOutcome({ ...base, row: { timeS: 90, revision: 'rev-a' }, timeS: 80 }).post).toBe(true)
    expect(postOutcome({ ...base, row: { timeS: 80, revision: 'rev-a' }, timeS: 80 })).toMatchObject({ post: false, note: null })
    expect(postOutcome({ ...base, row: { timeS: 70, revision: 'rev-a' }, timeS: 80 }).post).toBe(false)
  })

  it('replaces a row from an older revision even when the new time is slower', () => {
    expect(postOutcome({ ...base, row: { timeS: 70, revision: 'rev-old' }, timeS: 90 }).post).toBe(true)
  })
})

describe('lap board order', () => {
  it('ranks the fastest time first and the earlier equal time ahead', () => {
    const rows = [
      { timeS: 90, setAt: { toMillis: () => 2 } },
      { timeS: 80, setAt: { toMillis: () => 5 } },
      { timeS: 90, setAt: { toMillis: () => 1 } },
    ].sort(byBoardOrder)
    expect(rows.map((row) => row.setAt.toMillis())).toEqual([5, 1, 2])
  })
})
