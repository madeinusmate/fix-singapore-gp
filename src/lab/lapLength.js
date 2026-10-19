import { MAX_LAP_M, MIN_LAP_M } from '../sim/const.js'

// A lap under 3.5 km still blocks publishing. A lap over 7 km stays flagged and can be saved.
export const lapLengthCheck = (lapM, started) => {
  const longEnough = lapM >= MIN_LAP_M
  const overLimit = lapM > MAX_LAP_M
  let note = ''
  if (started && !longEnough) note = '. Too short, keep going.'
  else if (started && overLimit) note = '. Above the 7 km limit.'
  return {
    longEnough,
    overLimit,
    state: !started ? 'wait' : !longEnough ? 'bad' : overLimit ? 'warn' : 'ok',
    note,
  }
}
