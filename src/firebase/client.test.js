import { describe, expect, it } from 'vitest'
import { resolveAuthDomain } from './client.js'

describe('resolveAuthDomain', () => {
  it('uses the Firebase auth host Google already allows', () => {
    expect(resolveAuthDomain('', 'sgp-2027')).toBe('sgp-2027.firebaseapp.com')
    expect(resolveAuthDomain('   ', 'sgp-2027')).toBe('sgp-2027.firebaseapp.com')
    expect(resolveAuthDomain(undefined, 'sgp-2027')).toBe('sgp-2027.firebaseapp.com')
  })

  it('keeps an explicit auth domain', () => {
    expect(resolveAuthDomain('fixsingaporegp.com', 'sgp-2027')).toBe('fixsingaporegp.com')
  })

  it('returns nothing when the project id is missing', () => {
    expect(resolveAuthDomain('', '')).toBeUndefined()
  })
})
