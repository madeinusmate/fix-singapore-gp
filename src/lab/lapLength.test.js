import { describe, expect, it } from 'vitest'
import { MAX_LAP_M, MIN_LAP_M } from '../sim/const.js'
import { lapLengthCheck } from './lapLength.js'

describe('lapLengthCheck', () => {
  it('waits until a lap has been started', () => {
    expect(lapLengthCheck(8000, false)).toMatchObject({ state: 'wait', note: '', longEnough: true, overLimit: true })
  })

  it('blocks a lap under 3.5 km', () => {
    const check = lapLengthCheck(MIN_LAP_M - 1, true)
    expect(check.state).toBe('bad')
    expect(check.longEnough).toBe(false)
    expect(check.note).toBe('. Too short, keep going.')
  })

  it('accepts a lap inside the range', () => {
    expect(lapLengthCheck((MIN_LAP_M + MAX_LAP_M) / 2, true)).toMatchObject({
      state: 'ok',
      longEnough: true,
      overLimit: false,
      note: '',
    })
  })

  it('flags a lap over 7 km without treating it as too short to save', () => {
    const check = lapLengthCheck(MAX_LAP_M + 1, true)
    expect(check.state).toBe('warn')
    expect(check.longEnough).toBe(true)
    expect(check.overLimit).toBe(true)
    expect(check.note).toBe('. Above the 7 km limit.')
  })
})
