import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@getrheo/react', () => ({
  identify: vi.fn(async () => ({ ok: true })),
  track: vi.fn(async () => ({ accepted: true })),
  logEvent: vi.fn(),
  setUserId: vi.fn(),
}))

vi.mock('./config.js', () => ({
  rheoPublishableKey: () => 'ob_pk_test_account',
}))

import { identify, logEvent, setUserId, track } from '@getrheo/react'
import { layoutShotUrl } from '../share/shot.js'
import { linkSignedInAccount, noteLayoutPublished, onSignedOut, resetLinkedAccounts } from './account.js'

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
      appUserId: 'uid-1',
      email: 'fan@example.com',
      marketingConsent: 'granted',
      customUserId: 'uid-1',
    }), expect.any(Object))
    const config = identify.mock.calls[0][1]
    expect(config.customUserId).toBe('uid-1')
    expect(config.platform).toBe('web')
    expect(config).not.toHaveProperty('apiBaseUrl')
    expect(track).toHaveBeenCalledWith(
      { name: 'signed_in', appUserId: 'uid-1', properties: { method: 'google' } },
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

  it('maps the Google profile onto Rheo name, phone, locale, and country', async () => {
    await linkSignedInAccount({
      uid: 'uid-4',
      email: 'fan@example.com',
      displayName: 'Ignored Name',
      phoneNumber: '+6591234567',
      providerData: [],
    }, {
      profile: {
        given_name: 'Ada',
        family_name: 'Lovelace',
        locale: 'en_GB',
        picture: 'https://example.com/a.png',
      },
    })

    const sent = identify.mock.calls[0][0]
    expect(sent).toEqual(expect.objectContaining({
      firstName: 'Ada',
      lastName: 'Lovelace',
      phone: '+6591234567',
      locale: 'en-GB',
      country: 'GB',
    }))
    expect(sent).not.toHaveProperty('picture')
  })

  it('splits a display name when Google does not send given and family names', async () => {
    await linkSignedInAccount({
      uid: 'uid-5',
      email: 'fan@example.com',
      displayName: 'Grace Hopper',
    })

    expect(identify).toHaveBeenCalledWith(expect.objectContaining({
      firstName: 'Grace',
      lastName: 'Hopper',
    }), expect.any(Object))
  })

  it('uses the Google profile email when the Firebase user has none', async () => {
    await linkSignedInAccount({
      uid: 'uid-2',
      email: null,
      providerData: [],
      getIdTokenResult: async () => ({ claims: {} }),
    }, {
      trackSignIn: true,
      profile: { email: 'from-google@example.com' },
    })

    expect(identify).toHaveBeenCalledWith(expect.objectContaining({
      appUserId: 'uid-2',
      email: 'from-google@example.com',
      marketingConsent: 'granted',
    }), expect.any(Object))
  })

  it('does not record granted consent when the account has no email', async () => {
    await expect(linkSignedInAccount({
      uid: 'uid-3',
      email: null,
      providerData: [],
      getIdTokenResult: async () => ({ claims: {} }),
    }, { trackSignIn: true })).rejects.toThrow(/email/)
    expect(identify).not.toHaveBeenCalled()
    expect(track).not.toHaveBeenCalled()
  })

  it('stores the published layout url and name before the automation event', async () => {
    await noteLayoutPublished('uid-1', 'layout-9', '  The Bayfront Slingshot  ')

    const config = identify.mock.calls.at(-1)[1]
    const attributes = {
      layout_id: 'layout-9',
      layout_url: 'https://fixsingaporegp.com/singapore/l/layout-9',
      layout_name: 'The Bayfront Slingshot',
    }
    expect(identify).toHaveBeenLastCalledWith({ appUserId: 'uid-1', attributes }, config)
    expect(track).toHaveBeenLastCalledWith({
      name: 'layout_published',
      appUserId: 'uid-1',
      properties: attributes,
    }, config)
    expect(identify.mock.invocationCallOrder[0]).toBeLessThan(track.mock.invocationCallOrder[0])
  })

  it('sends the public 3D picture with the publish email', async () => {
    const image = layoutShotUrl('sgp-2027.firebasestorage.app', 'uid-1', 'layout9')
    await noteLayoutPublished('uid-1', 'layout9', 'The Bayfront Slingshot', image)

    const attributes = identify.mock.calls.at(-1)[0].attributes
    expect(attributes.layout_image).toBe(image)
    expect(track.mock.calls.at(-1)[0].properties.layout_image).toBe(image)
  })

  it('leaves the picture off the email when the url is not this layout', async () => {
    await noteLayoutPublished('uid-1', 'layout-9', 'The Bayfront Slingshot', 'https://evil.example/track.jpg')
    expect(identify.mock.calls.at(-1)[0].attributes).not.toHaveProperty('layout_image')
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
