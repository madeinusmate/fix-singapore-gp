export const LAP_FLOOR = 0.5

const underFloor = (timeS, simLapS) => simLapS > 0 && timeS < simLapS * LAP_FLOOR

// What to do with a finished lap. `row` is this account's stored time, if any.
// A signed-out lap never posts. An equal time keeps the earlier row.
export const postOutcome = ({ signedIn, timeS, simLapS, liveRevision, row }) => {
  if (signedIn && underFloor(timeS, simLapS)) return { saveLocal: true, post: false, note: 'floor' }
  if (!signedIn) return { saveLocal: true, post: false, note: null }
  if (liveRevision == null || !(simLapS > 0)) return { saveLocal: true, post: false, note: 'changed' }
  const sameRevision = row?.revision === liveRevision
  if (sameRevision && !(timeS < row.timeS)) return { saveLocal: true, post: false, note: null }
  return { saveLocal: true, post: true, note: null }
}

export const byBoardOrder = (a, b) => {
  const at = typeof a.setAt?.toMillis === 'function' ? a.setAt.toMillis() : 0
  const bt = typeof b.setAt?.toMillis === 'function' ? b.setAt.toMillis() : 0
  return a.timeS - b.timeS || at - bt
}

export const postNote = (code) => ({
  floor: 'Not saved. Faster than half the sim lap.',
  changed: 'Not saved. This layout has changed.',
  trying: 'Not saved. Still trying.',
  denied: 'Not saved.',
  noname: 'Not saved. This Google account has no display name.',
}[code] || null)
