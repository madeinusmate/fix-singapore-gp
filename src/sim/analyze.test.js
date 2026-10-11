import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { analyze } from './analyze.js'
import { toMetres } from './project.js'

const fixture = JSON.parse(readFileSync(new URL('../../analysis/fixtures/sim-path.json', import.meta.url), 'utf8'))
const published = JSON.parse(readFileSync(new URL('../../analysis/metrics2026.json', import.meta.url), 'utf8')).layouts.CURRENT

describe('2026 lap sim', () => {
  it('projects SVY21 the same way pyproj does', () => {
    const [x, y] = toMetres(103.86397, 1.28868)
    expect(x).toBeCloseTo(31411.243469, 2)
    expect(y).toBeCloseTo(30121.22681, 2)
  })

  it('matches the published current-layout figures', () => {
    const { metrics } = analyze(fixture.path)
    expect(Math.abs(metrics.lap_s - published.lap_s)).toBeLessThanOrEqual(0.05)
    expect(Math.abs(metrics.lap_overtake_s - published.lap_overtake_s)).toBeLessThanOrEqual(0.05)
    expect(Math.abs(metrics.corners - published.corners)).toBeLessThanOrEqual(1)
    expect(Math.abs(metrics.heavy_braking_zones - published.heavy_braking_zones)).toBeLessThanOrEqual(1)
    expect(Math.abs(metrics.longest_straight_m - published.longest_straight_m)).toBeLessThanOrEqual(2)
    const indexDelta = Math.abs(metrics.overtaking_score_2026 - published.overtaking_score_2026) / published.overtaking_score_2026
    expect(indexDelta).toBeLessThanOrEqual(0.02)
  })
})
