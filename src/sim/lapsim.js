import { ASSUME, G0 } from './const.js'

const m = ASSUME.mass_kg

export const pk = (vk, ot) => {
  if (ot) return vk < 355 ? Math.max(0, Math.min(350, 7100 - 20 * vk)) : 0
  if (vk < 340) return Math.min(350, 1800 - 5 * vk)
  if (vk < 345) return Math.max(0, 6900 - 20 * vk)
  return 0
}

export const lapsim = (prep, xmode, ot = false, vcut = null) => {
  const { k: curvature, seg } = prep
  const n = curvature.length
  const vlim = curvature.map((k) => Math.min(360 / 3.6, Math.sqrt((ASSUME.a_lat_g * G0) / Math.max(Math.abs(k), 1e-6))))
  const cda = xmode.map((on) => (on ? ASSUME.CdA_X : ASSUME.CdA_Z))
  const v = vlim.slice()
  for (let pass = 0; pass < 2; pass += 1) {
    for (let i = 1; i < 2 * n + 1; i += 1) {
      const a = (i - 1) % n
      const b = i % n
      const va = Math.max(v[a], 5)
      const vk = va * 3.6
      const pK = vcut == null || vk < vcut ? pk(vk, ot) : 0
      const force = Math.min(((ASSUME.P_ice_kW + pK) * 1000) / va, ASSUME.a_trac_g * G0 * m) - 0.5 * ASSUME.rho * cda[a] * va * va - ASSUME.Crr * m * G0
      v[b] = Math.min(v[b], Math.sqrt(Math.max(1, va * va + (2 * force) / m * seg[a])))
    }
    for (let i = 2 * n; i > 0; i -= 1) {
      const a = i % n
      const b = (i - 1) % n
      const va = v[a]
      const dec = ASSUME.a_brake_g * G0 + (0.5 * ASSUME.rho * cda[b] * va * va) / m
      v[b] = Math.min(v[b], Math.sqrt(va * va + 2 * dec * seg[b]))
    }
  }
  const dt = seg.map((ds, i) => ds / v[i])
  const brk = v.map((speed, i) => v[(i + 1) % n] - speed < -1e-3)
  let eDep = 0
  let eReg = 0
  for (let i = 0; i < n; i += 1) {
    const vk = v[i] * 3.6
    const pK = vcut == null || vk < vcut ? pk(vk, ot) : 0
    if (!brk[i]) eDep += pK * dt[i]
    const pb = Math.min(ASSUME.regen_max_kW, (m * ASSUME.a_brake_g * G0 * v[i]) / 1000)
    if (brk[i]) eReg += pb * dt[i]
  }
  return { v, t: dt.reduce((a, b) => a + b, 0), Edep: eDep / 1000, Ereg: eReg / 1000, brk, dt }
}

export const energyLimited = (prep, xmode, ot = false) => {
  const cap = ASSUME.harvest_cap_MJ + (ot ? ASSUME.overtake_extra_MJ : 0)
  const open = lapsim(prep, xmode, ot)
  if (open.Edep <= cap) return { ...open, vcut: null, budget: cap }
  let lo = 60
  let hi = 360
  for (let i = 0; i < 14; i += 1) {
    const mid = (lo + hi) / 2
    const run = lapsim(prep, xmode, ot, mid)
    if (run.Edep > cap) hi = mid
    else lo = mid
  }
  const limited = lapsim(prep, xmode, ot, lo)
  return { ...limited, vcut: lo, budget: cap }
}
