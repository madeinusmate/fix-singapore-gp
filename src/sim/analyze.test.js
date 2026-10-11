import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { analyze } from './analyze.js'
import { toMetres } from './project.js'
import { loadGraph } from './route.js'

const fixture = JSON.parse(readFileSync(new URL('../../analysis/fixtures/sim-path.json', import.meta.url), 'utf8'))
const published = JSON.parse(readFileSync(new URL('../../analysis/metrics2026.json', import.meta.url), 'utf8')).layouts.CURRENT
const graph = loadGraph(JSON.parse(readFileSync(new URL('../../public/data/graph.json', import.meta.url), 'utf8')))
const current = JSON.parse(readFileSync(new URL('../../public/data/current.json', import.meta.url), 'utf8'))

const offRoadM = (lng, lat) => {
  const [x, y] = toMetres(lng, lat)
  return graph.edges.reduce((best, edge) => {
    const [ax, ay] = graph.xy[edge.a]
    const [bx, by] = graph.xy[edge.b]
    const abx = bx - ax
    const aby = by - ay
    const t = Math.max(0, Math.min(1, ((x - ax) * abx + (y - ay) * aby) / (abx * abx + aby * aby || 1e-9)))
    return Math.min(best, Math.hypot(ax + abx * t - x, ay + aby * t - y) - edge.width / 2)
  }, Infinity)
}

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

  it('opens up junction corners by using the width of the road', () => {
    const centre = analyze(current.path)
    const wide = analyze(current.path, null, graph)
    const tightest = (result) => Math.min(...result.features.turns.map((turn) => turn.min_radius_m))
    expect(wide.metrics.lap_s).toBeLessThan(centre.metrics.lap_s)
    expect(tightest(wide)).toBeGreaterThan(tightest(centre))
    wide.features.centerline.filter((_, i) => i % 10 === 0).forEach(([lng, lat]) => {
      expect(offRoadM(lng, lat)).toBeLessThanOrEqual(5)
    })
  })
})
