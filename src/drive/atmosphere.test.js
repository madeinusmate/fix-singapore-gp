import { describe, expect, it } from 'vitest'
import { atmosphereFor } from './atmosphere.js'

describe('atmosphere', () => {
  it('races Singapore and Las Vegas after dark', () => {
    expect(atmosphereFor('singapore').night).toBe(true)
    expect(atmosphereFor('las-vegas').sky).toBe('sky-night.jpg')
    ;['monaco', 'miami', 'azerbaijan', 'madrid'].forEach((slug) => {
      expect(atmosphereFor(slug).night).toBe(false)
      expect(atmosphereFor(slug).sky).toBe('sky.jpg')
    })
  })

  it('keeps the daytime sun the same brightness once the wide fill is added', () => {
    const day = atmosphereFor('monaco')
    expect(day.sun + day.fill).toBeCloseTo(2.4)
    expect(day.fogNear).toBeLessThan(day.fogFar)
    expect(atmosphereFor('singapore').fogNear).toBeLessThan(atmosphereFor('singapore').fogFar)
  })
})
