import { describe, expect, it, vi } from 'vitest'
import { POST, verifyFirebaseUser } from './moderate-name.js'
import { NAME_CHECK_FAILED, NAME_LENGTH, NAME_SIGN_IN, UNSUITABLE_NAME } from '../src/moderation/name.js'

const signedIn = async () => ({ localId: 'user-1' })

const request = (name, authorization = 'Bearer token') => new Request('http://localhost/api/moderate-name', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    ...(authorization ? { authorization } : {}),
  },
  body: JSON.stringify({ name }),
})

const suitable = async () => ({
  answers: { suitable: { type: 'score', score: 1.9, probabilities: { 0: 0.02, 1: 0.06, 2: 0.92 } } },
})

describe('POST /api/moderate-name', () => {
  it('asks Jev to score the name and allows a suitable one', async () => {
    const decide = vi.fn(suitable)
    const response = await POST(request('  The Bayfront Slingshot  '), { verifyUser: signedIn, decide })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(decide).toHaveBeenCalledWith(expect.objectContaining({
      model: expect.objectContaining({ modelId: 'typesafe-ai/jev', provider: 'gateway' }),
      state: 'The Bayfront Slingshot',
      providerOptions: { gateway: { zeroDataRetention: true } },
      questions: {
        suitable: expect.objectContaining({ type: 'score' }),
      },
    }))
  })

  it('blocks an unsuitable name', async () => {
    const decide = vi.fn(async () => ({
      answers: { suitable: { type: 'score', score: 0.2, probabilities: { 0: 0.9, 1: 0.08, 2: 0.02 } } },
    }))
    const response = await POST(request('bad name'), { verifyUser: signedIn, decide })
    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ ok: false, error: UNSUITABLE_NAME })
  })

  it('does not score a name until the caller is signed in', async () => {
    const decide = vi.fn(suitable)
    const response = await POST(request('Bayfront', ''), { verifyUser: async () => null, decide })
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ ok: false, error: NAME_SIGN_IN })
    expect(decide).not.toHaveBeenCalled()
  })

  it('does not score a name outside the published length', async () => {
    const decide = vi.fn(suitable)
    const response = await POST(request('no'), { verifyUser: signedIn, decide })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ ok: false, error: NAME_LENGTH })
    expect(decide).not.toHaveBeenCalled()
  })

  it('fails closed when Jev cannot be reached', async () => {
    const decide = vi.fn(async () => { throw new Error('gateway down') })
    const response = await POST(request('Bayfront'), { verifyUser: signedIn, decide })
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ ok: false, error: NAME_CHECK_FAILED })
  })
})

describe('verifyFirebaseUser', () => {
  it('accepts a token Identity Toolkit recognizes', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ users: [{ localId: 'user-1' }] }))
    const user = await verifyFirebaseUser('Bearer token-1', { fetchImpl, apiKey: 'key' })
    expect(user).toEqual({ localId: 'user-1' })
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=key',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ idToken: 'token-1' }),
      }),
    )
  })

  it('rejects a missing token, a missing key, and a rejected token', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ error: { message: 'INVALID_ID_TOKEN' } }, { status: 400 }))
    expect(await verifyFirebaseUser('', { fetchImpl, apiKey: 'key' })).toBeNull()
    expect(await verifyFirebaseUser('Bearer token-1', { fetchImpl, apiKey: '' })).toBeNull()
    expect(await verifyFirebaseUser('Bearer token-1', { fetchImpl, apiKey: 'key' })).toBeNull()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
