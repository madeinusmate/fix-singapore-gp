const kernel = (sigma) => {
  const radius = Math.trunc(4 * sigma + 0.5)
  const sigma2 = sigma * sigma
  const phi = []
  for (let i = -radius; i <= radius; i += 1) phi.push(Math.exp((-0.5 / sigma2) * i * i))
  const sum = phi.reduce((a, b) => a + b, 0)
  return phi.map((v) => v / sum)
}

const KERNEL7 = kernel(7)
const KERNEL3 = kernel(3)

export const filterWrap = (values, weights) => {
  const radius = (weights.length - 1) / 2
  const n = values.length
  const out = new Array(n)
  for (let i = 0; i < n; i += 1) {
    let acc = 0
    for (let k = 0; k < weights.length; k += 1) {
      let j = i + k - radius
      j %= n
      if (j < 0) j += n
      acc += values[j] * weights[k]
    }
    out[i] = acc
  }
  return out
}

export const smoothWrap = (xs, ys, sigma) => {
  const weights = sigma === 7 ? KERNEL7 : sigma === 3 ? KERNEL3 : kernel(sigma)
  return [filterWrap(xs, weights), filterWrap(ys, weights)]
}

const hypot = (dx, dy) => Math.hypot(dx, dy)

// Drop out-and-back spikes. Same rule as analysis/lib.py despike.
export const despike = (points, win = 60, tol = 12) => {
  let p = points.map((q) => [q[0], q[1]])
  let changed = true
  while (changed) {
    changed = false
    const s = [0]
    for (let i = 1; i < p.length; i += 1) s.push(s[i - 1] + hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]))
    for (let i = 0; i < p.length; i += 1) {
      let jHit = -1
      for (let j = i + 1; j < p.length; j += 1) {
        if (s[j] <= s[i] + 3 * tol) continue
        if (s[j] >= s[i] + win * 10) break
        if (hypot(p[j][0] - p[i][0], p[j][1] - p[i][1]) < tol) jHit = j
      }
      if (jHit < 0) continue
      const slice = p.slice(i, jHit + 1)
      let area = 0
      for (let k = 0; k < slice.length; k += 1) {
        const n = slice[(k + 1) % slice.length]
        area += slice[k][0] * n[1] - slice[k][1] * n[0]
      }
      area = 0.5 * Math.abs(area)
      const length = s[jHit] - s[i]
      if (area < (0.15 * length * length) / 4 / Math.PI && area < 4000) {
        p = p.slice(0, i + 1).concat(p.slice(jHit + 1))
        changed = true
        break
      }
    }
  }
  return p
}
