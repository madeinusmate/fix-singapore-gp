import { afterEach, describe, expect, it, vi } from 'vitest'
import { NAME_CHECK_FAILED, UNSUITABLE_NAME, layoutName, moderateLayoutName, nameIsTaken, nameKey, nameVerdict } from './name.js'

const score = (value, probabilities) => ({ type: 'score', score: value, probabilities })

describe('layoutName', () => {
  it('keeps a name inside the published length', () => {
    expect(layoutName('  Bayfront  ')).toBe('Bayfront')
  })

  it('drops a name that is too short, too long, or not text', () => {
    expect(layoutName('ab')).toBeNull()
    expect(layoutName('a'.repeat(61))).toBeNull()
    expect(layoutName(null)).toBeNull()
  })

  it('treats spacing and capital letters as the same name', () => {
    expect(layoutName('  The   Bayfront  ')).toBe('The Bayfront')
    expect(nameKey('The Bayfront')).toBe(nameKey(' the   bayfront '))
    expect(nameKey('The Bayfront')).toBe('the%20bayfront')
  })
})

describe('nameIsTaken', () => {
  it('lets a layout keep its own name', () => {
    expect(nameIsTaken('layout-1', ['layout-1'], 'layout-1')).toBe(false)
  })

  it('blocks a name reserved by another layout', () => {
    expect(nameIsTaken('layout-1', [], null)).toBe(true)
    expect(nameIsTaken(null, ['layout-2'], 'layout-1')).toBe(true)
  })
})

describe('nameVerdict', () => {
  it('accepts a name that scores as suitable', () => {
    expect(nameVerdict(score(1.88, { 0: 0.02, 1: 0.08, 2: 0.9 }))).toEqual({ ok: true, score: 1.88 })
  })

  it('accepts the suitable score when the unsuitable chance stays under the line', () => {
    expect(nameVerdict(score(1.5, { 0: 0.29, 1: 0.01, 2: 0.7 })).ok).toBe(true)
  })

  it('rejects a name that is unsuitable or only borderline', () => {
    expect(nameVerdict(score(0.25, { 0: 0.8, 1: 0.15, 2: 0.05 })).code).toBe('unsuitable')
    expect(nameVerdict(score(1.2, { 0: 0.05, 1: 0.7, 2: 0.25 })).code).toBe('unsuitable')
    expect(nameVerdict(score(1.5, { 0: 0.3, 1: 0.1, 2: 0.6 })).code).toBe('unsuitable')
  })

  it('rejects a score that has no unsuitable probability', () => {
    expect(nameVerdict(score(2)).code).toBe('unchecked')
    expect(nameVerdict({ type: 'boolean', probability: 0.99 }).code).toBe('unchecked')
  })
})

describe('moderateLayoutName', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends the signed-in token and the name', async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    await moderateLayoutName({ getIdToken: async () => 'token-1' }, 'Bayfront')
    expect(fetchMock).toHaveBeenCalledWith('/api/moderate-name', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer token-1',
      },
      body: JSON.stringify({ name: 'Bayfront' }),
    })
  })

  it('surfaces the server rejection', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: false, error: UNSUITABLE_NAME }, { status: 422 })))
    await expect(moderateLayoutName({ getIdToken: async () => 'token-1' }, 'nope')).rejects.toThrow(UNSUITABLE_NAME)
  })

  it('reports a failed request without saving', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    await expect(moderateLayoutName({ getIdToken: async () => 'token-1' }, 'Bayfront')).rejects.toThrow(NAME_CHECK_FAILED)
  })
})
