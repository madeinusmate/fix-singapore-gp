import { describe, expect, it } from 'vitest'
import { budgetFor, groundGrid, readDevice } from './budget.js'

describe('drive budget', () => {
  it('reads a coarse, low-memory device as a low budget', () => {
    const device = readDevice(
      { hardwareConcurrency: 8, deviceMemory: 8, connection: { saveData: false } },
      (query) => ({ matches: query === '(pointer: coarse)' }),
    )
    expect(device.coarse).toBe(true)
    expect(budgetFor(device).low).toBe(true)
    expect(budgetFor(device).reflect).toBe(false)
    expect(budgetFor(device).dpr).toEqual([1, 1])
    expect(budgetFor(device).shadowMap).toBe(512)
  })

  it('keeps a reflection and a softer shadow on a desktop machine', () => {
    const device = readDevice({ hardwareConcurrency: 8, deviceMemory: 8 }, () => ({ matches: false }))
    const budget = budgetFor(device)
    expect(budget.low).toBe(false)
    expect(budget.reflect).toBe(true)
    expect(budget.dpr[1]).toBeLessThanOrEqual(1.25)
    expect(budget.shadows).toBe('percentage')
  })

  it('sizes the ground to the fog', () => {
    const night = groundGrid(1500, false)
    const day = groundGrid(5200, false)
    expect(night.span).toBeLessThan(day.span)
    expect(night.span / night.cells).toBeGreaterThan(300)
    expect(day.span).toBeLessThanOrEqual(12000)
    expect(groundGrid(5200, true).cells).toBeLessThan(day.cells)
  })
})
