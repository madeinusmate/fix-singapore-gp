import { ASSUME } from './const.js'

const rollIndex = (n, shift) => {
  const idx = new Array(n)
  for (let i = 0; i < n; i += 1) idx[i] = (i + shift) % n
  return idx
}

export const corners = (prep) => {
  const { k, seg } = prep
  const n = k.length
  const ds = seg.reduce((a, b) => a + b, 0) / n
  const kmin = 1 / 200
  const st = k.reduce((best, value, i, arr) => (Math.abs(value) < Math.abs(arr[best]) ? i : best), 0)
  const idx = rollIndex(n, st)
  const hot = idx.map((i) => Math.abs(k[i]) > kmin)
  const runs = []
  let i = 0
  while (i < n) {
    if (hot[i]) {
      let j = i
      while (j < n && hot[j]) j += 1
      runs.push([i, j])
      i = j
    } else i += 1
  }
  const merged = []
  runs.forEach((run) => {
    const prev = merged[merged.length - 1]
    if (prev && (run[0] - prev[1]) * ds < 40 && Math.sign(k[idx[run[0]]]) === Math.sign(k[idx[prev[1] - 1]])) prev[1] = run[1]
    else merged.push(run.slice())
  })
  const found = []
  merged.forEach(([a, b]) => {
    const ii = idx.slice(a, b)
    let ang = 0
    ii.forEach((sample) => { ang += k[sample] * seg[sample] })
    ang = (ang * 180) / Math.PI
    if (Math.abs(ang) >= 20) {
      let apex = ii[0]
      ii.forEach((sample) => { if (Math.abs(k[sample]) > Math.abs(k[apex])) apex = sample })
      found.push({ i0: ii[0], i1: ii[ii.length - 1], apex, angle: ang, rmin: 1 / Math.abs(k[apex]) })
    }
  })
  found.sort((a, b) => a.i0 - b.i0)
  const straights = []
  found.forEach((corner, t) => {
    const next = found[(t + 1) % found.length]
    const i0 = corner.i1
    const i1 = next.i0
    const samples = []
    const end = i1 > i0 ? i1 : i1 + n
    for (let s = i0; s < end; s += 1) samples.push(s % n)
    const len = samples.reduce((sum, sample) => sum + seg[sample], 0)
    straights.push({ idx: samples, len, into: next })
  })
  return { corners: found, straights }
}

export const xmodeMask = (prep, run) => {
  const n = prep.k.length
  const ok = prep.k.map((k, i) => !run.brk[i] && Math.abs(k) < 1 / ASSUME.xmode_min_radius_m)
  const st = ok.findIndex((v) => !v)
  const shift = st < 0 ? 0 : st
  const idx = rollIndex(n, shift)
  const mask = new Array(n).fill(false)
  let i = 0
  while (i < n) {
    if (ok[idx[i]]) {
      let j = i
      while (j < n && ok[idx[j]]) j += 1
      const ii = idx.slice(i, j)
      const dt = ii.reduce((sum, sample) => sum + run.dt[sample], 0)
      if (dt >= ASSUME.xmode_min_s) ii.forEach((sample) => { mask[sample] = true })
      i = j
    } else i += 1
  }
  return mask
}

export const runsOf = (mask) => {
  const out = []
  let i = 0
  while (i < mask.length) {
    if (mask[i]) {
      let j = i
      while (j < mask.length && mask[j]) j += 1
      const ii = []
      for (let k = i; k < j; k += 1) ii.push(k)
      out.push(ii)
      i = j
    } else i += 1
  }
  return out
}
