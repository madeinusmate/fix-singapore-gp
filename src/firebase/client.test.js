import { describe, expect, it } from 'vitest'
import { resolveAuthDomain } from './client.js'

describe('resolveAuthDomain', () => {
  it('uses the Firebase auth host Google already allows', () => {
    expect(resolveAuthDomain('', 'example-project')).toBe('example-project.firebaseapp.com')
    expect(resolveAuthDomain('   ', 'example-project')).toBe('example-project.firebaseapp.com')
    expect(resolveAuthDomain(undefined, 'example-project')).toBe('example-project.firebaseapp.com')
  })

  it('keeps an explicit auth domain', () => {
    expect(resolveAuthDomain('fixsingaporegp.com', 'example-project')).toBe('fixsingaporegp.com')
  })

  it('returns nothing when the project id is missing', () => {
    expect(resolveAuthDomain('', '')).toBeUndefined()
  })
})
