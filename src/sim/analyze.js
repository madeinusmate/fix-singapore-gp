import { GRID_A_LL, GRID_B_LL } from './const.js'
import { corners, runsOf, xmodeMask } from './corners.js'
import { energyLimited, lapsim } from './lapsim.js'
import { prepare } from './prep.js'
import { toLngLat, toMetres } from './project.js'

// The trace keeps every third lap sample: trace entry k is prep sample k * TRACE_EVERY.
export const TRACE_EVERY = 3

const lngLatAt = (prep, i) => toLngLat(prep.x[i], prep.y[i], prep.origin)

const line = (prep, samples) => samples.map((i) => lngLatAt(prep, i))

export const gridSlice = (prep) => {
  const [aLL, bLL] = prep.gridAnchors || [GRID_A_LL, GRID_B_LL]
  const axy = toMetres(aLL[0], aLL[1], prep.origin)
  const bxy = toMetres(bLL[0], bLL[1], prep.origin)
  let a = 0
  let b = 0
  let da = Infinity
  let db = Infinity
  for (let i = 0; i < prep.x.length; i += 1) {
    const xa = Math.hypot(prep.x[i] - axy[0], prep.y[i] - axy[1])
    const xb = Math.hypot(prep.x[i] - bxy[0], prep.y[i] - bxy[1])
    if (xa < da) { da = xa; a = i }
    if (xb < db) { db = xb; b = i }
  }
  const samples = []
  if (a > b) {
    for (let i = a; i < prep.x.length; i += 1) samples.push(i)
    for (let i = 0; i < b; i += 1) samples.push(i)
  } else {
    for (let i = a; i < b; i += 1) samples.push(i)
  }
  return samples
}

const sampleElev = (dem, lng, lat) => {
  if (!dem) return null
  const { west, south, east, north, cols, rows, z } = dem
  const fx = ((lng - west) / (east - west)) * (cols - 1)
  const fy = ((lat - south) / (north - south)) * (rows - 1)
  if (fx < 0 || fy < 0 || fx > cols - 1 || fy > rows - 1) return null
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const x1 = Math.min(cols - 1, x0 + 1)
  const y1 = Math.min(rows - 1, y0 + 1)
  const tx = fx - x0
  const ty = fy - y0
  const at = (c, r) => z[r * cols + c]
  const z00 = at(x0, y0)
  const z10 = at(x1, y0)
  const z01 = at(x0, y1)
  const z11 = at(x1, y1)
  if ([z00, z10, z01, z11].some((v) => v == null)) return null
  return z00 * (1 - tx) * (1 - ty) + z10 * tx * (1 - ty) + z01 * (1 - tx) * ty + z11 * tx * ty
}

export const analyze = (pathLngLat, dem = null, graph = null) => {
  const prep = prepare(pathLngLat, graph)
  const n = prep.k.length
  const plain = lapsim(prep, new Array(n).fill(false), false)
  const xmode = xmodeMask(prep, plain)
  const def = energyLimited(prep, xmode, false)
  const att = energyLimited(prep, xmode, true)
  const { corners: found, straights } = corners(prep)
  let heavy = 0
  let score = 0
  let best = straights[0]
  straights.forEach((straight) => {
    let vmax = 0
    let vmaxA = 0
    let dtD = 0
    let dtA = 0
    straight.idx.forEach((i) => {
      vmax = Math.max(vmax, def.v[i])
      vmaxA = Math.max(vmaxA, att.v[i])
      dtD += def.dt[i]
      dtA += att.dt[i]
    })
    const dv = vmax * 3.6 - def.v[straight.into.apex] * 3.6
    const gainS = dtD - dtA
    const gainM = gainS * vmaxA
    straight.dv = dv
    straight.gainM = gainM
    straight.braking = straight.idx.filter((i) => def.brk[i])
    if (straight.len > 400 && Math.abs(straight.into.angle) > 70) heavy += 1
    if (straight.len > 300 && Math.abs(straight.into.angle) > 70) score += (Math.max(0, gainM) / 5) * (dv / 100)
    if (!best || gainM > best.gainM) best = straight
  })
  let slow90 = 0
  found.forEach((corner) => {
    if (Math.abs(corner.angle) > 60 && def.v[corner.apex] * 3.6 < 120) slow90 += 1
  })
  const xmodeTotal = prep.seg.reduce((sum, ds, i) => sum + (xmode[i] ? ds : 0), 0)
  const longest = straights.reduce((max, s) => Math.max(max, s.len), 0)
  const metrics = {
    length_km: Math.round((prep.length / 1000) * 1000) / 1000,
    corners: found.length,
    slow90,
    longest_straight_m: Math.round(longest),
    heavy_braking_zones: heavy,
    xmode_total_m: Math.round(xmodeTotal),
    lap_s: Math.round(def.t * 100) / 100,
    lap_overtake_s: Math.round(att.t * 100) / 100,
    top_kmh: Math.round(Math.max(...def.v) * 3.6),
    energy_deployed_MJ: Math.round(def.Edep * 100) / 100,
    clip_speed_kmh: def.vcut == null ? null : Math.round(def.vcut),
    overtaking_score_2026: Math.round(score * 100) / 100,
  }
  const centerline = []
  for (let i = 0; i < n; i += 1) centerline.push(lngLatAt(prep, i))
  centerline.push(centerline[0])
  const traceI = []
  for (let i = 0; i < n; i += TRACE_EVERY) traceI.push(i)
  const cum = [0]
  const tAt = [0]
  const toAt = [0]
  for (let i = 0; i < n - 1; i += 1) {
    cum.push(cum[i] + prep.seg[i])
    tAt.push(tAt[i] + def.dt[i])
    toAt.push(toAt[i] + att.dt[i])
  }
  const trace = {
    s: traceI.map((i) => Math.round(cum[i] * 10) / 10),
    v: traceI.map((i) => Math.round(def.v[i] * 3.6 * 10) / 10),
    vo: traceI.map((i) => Math.round(att.v[i] * 3.6 * 10) / 10),
    t: traceI.map((i) => Math.round(tAt[i] * 1000) / 1000),
    to: traceI.map((i) => Math.round(toAt[i] * 1000) / 1000),
    lap: metrics.lap_s,
    lapo: metrics.lap_overtake_s,
    ll: traceI.map((i) => lngLatAt(prep, i).map((v) => Math.round(v * 1e7) / 1e7)),
    xm: traceI.map((i) => (xmode[i] ? 1 : 0)),
    elev: traceI.map((i) => {
      const [lng, lat] = lngLatAt(prep, i)
      const z = sampleElev(dem, lng, lat)
      return z == null ? null : Math.round(z * 10) / 10
    }),
  }
  const features = {
    centerline,
    grid: line(prep, gridSlice(prep)),
    turns: found.map((corner, t) => ({
      at: lngLatAt(prep, corner.apex),
      turn: t + 1,
      angle_deg: Math.round(corner.angle),
      min_radius_m: Math.round(corner.rmin),
      sim_min_speed_kmh: Math.round(def.v[corner.apex] * 3.6),
    })),
    xmode: runsOf(xmode).filter((ii) => ii.length > 3).map((ii) => line(prep, ii)),
    braking: straights.filter((s) => s.braking.length > 1).map((s) => ({
      line: line(prep, s.braking),
      heavy: s.len > 400 && Math.abs(s.into.angle) > 70,
    })),
    overtake: best ? lngLatAt(prep, best.idx[0]) : null,
    prep,
    xmodeMask: xmode,
    def,
  }
  return { metrics, features, trace }
}
