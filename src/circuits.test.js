import { describe, expect, it } from 'vitest'
import { CIRCUITS, circuitBySlug, createPath, drivePath, layoutPath } from './circuits.js'

describe('street circuits', () => {
  it('lists Singapore first and gives every other circuit its own page', () => {
    expect(CIRCUITS.map((circuit) => circuit.slug)).toEqual([
      'singapore',
      'azerbaijan',
      'monaco',
      'las-vegas',
      'miami',
      'madrid',
    ])
    expect(CIRCUITS.filter((circuit) => circuit.open).map((circuit) => circuit.slug)).toEqual(['singapore'])
    expect(new Set(CIRCUITS.map((circuit) => circuit.slug)).size).toBe(CIRCUITS.length)
  })

  it('keeps the Singapore lap under /singapore', () => {
    expect(circuitBySlug('monaco')?.circuit).toBe('Circuit de Monaco')
    expect(circuitBySlug('nope')).toBeNull()
    expect(createPath()).toBe('/singapore/create')
    expect(createPath('from=current')).toBe('/singapore/create?from=current')
    expect(layoutPath('current')).toBe('/singapore/l/current')
    expect(drivePath('layout9')).toBe('/singapore/l/layout9/drive')
  })
})
