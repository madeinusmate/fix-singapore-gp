import { MAX_LAP_M, MIN_LAP_M } from '../sim/const.js'

const kmLabel = (metres) => {
  const km = metres / 1000
  return Number.isInteger(km) ? String(km) : km.toFixed(1)
}

// A lap under the circuit minimum still blocks publishing. A lap over the maximum stays flagged and can be saved.
export const lapLengthCheck = (lapM, started, limits = {}) => {
  const minLapM = limits.minLapM ?? MIN_LAP_M
  const maxLapM = limits.maxLapM ?? MAX_LAP_M
  const longEnough = lapM >= minLapM
  const overLimit = lapM > maxLapM
  let note = ''
  if (started && !longEnough) note = '. Too short, keep going.'
  else if (started && overLimit) note = `. Above the ${kmLabel(maxLapM)} km limit.`
  return {
    longEnough,
    overLimit,
    minLapM,
    maxLapM,
    state: !started ? 'wait' : !longEnough ? 'bad' : overLimit ? 'warn' : 'ok',
    note,
  }
}
