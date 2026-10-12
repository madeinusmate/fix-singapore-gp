import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@getrheo/react', () => ({
  identify: vi.fn(async () => ({ ok: true })),
  track: vi.fn(async () => ({ accepted: true })),
  logEvent: vi.fn(),
  setUserId: vi.fn(),
}))

import { identify, logEvent, setUserId, track } from '@getrheo/react'
import { linkSignedInAccount, onSignedOut, resetLinkedAccounts } from './account.js'

const user = { uid: 'uid-1', email: 'fan@example.com' }

describe('linkSignedInAccount', () => {
  beforeEach(() => {
    resetLinkedAccounts()
    identify.mockClear()
    track.mockClear()
    logEvent.mockClear()
    setUserId.mockClear()
  })

  it('writes marketing consent and tracks a new sign-in', async () => {
    await linkSignedInAccount(user, { trackSignIn: true })

    expect(setUserId).toHaveBeenCalledWith('uid-1')
    expect(logEvent).toHaveBeenCalledWith('signed_in', { method: 'google' })
    expect(identify).toHaveBeenCalledWith(expect.objectContaining({
      email: 'fan@example.com',
      marketingConsent: 'granted',
      customUserId: 'uid-1',
    }), expect.any(Object))
    const config = identify.mock.calls[0][1]
    expect(config.customUserId).toBe('uid-1')
    expect(config.platform).toBe('web')
    expect(config).not.toHaveProperty('apiBaseUrl')
    expect(track).toHaveBeenCalledWith(
      { name: 'signed_in', properties: { method: 'google' } },
      config,
    )
  })

  it('identifies a restored session once and does not track it', async () => {
    await linkSignedInAccount(user)
    await linkSignedInAccount(user)

    expect(identify).toHaveBeenCalledTimes(1)
    expect(track).not.toHaveBeenCalled()
    expect(logEvent).not.toHaveBeenCalled()
  })

  it('tracks the next sign-in after sign-out', async () => {
    await linkSignedInAccount(user, { trackSignIn: true })
    onSignedOut(user.uid)
    expect(logEvent).toHaveBeenLastCalledWith('signed_out')
    expect(setUserId).toHaveBeenCalledWith(null)

    identify.mockClear()
    track.mockClear()
    await linkSignedInAccount(user, { trackSignIn: true })
    expect(identify).toHaveBeenCalledTimes(1)
    expect(track).toHaveBeenCalledTimes(1)
  })
})
