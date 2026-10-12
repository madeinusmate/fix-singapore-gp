import { useEffect, useState } from 'react'
import { firebaseConfigured, useAuth } from '../firebase/client.js'
import { listTimes } from '../firebase/times.js'
import { fmtLap } from './numbers.js'

const useLapBoard = (layoutId, revision) => {
  const [loaded, setLoaded] = useState(null)

  useEffect(() => {
    if (!firebaseConfigured || !layoutId || !revision) return undefined
    let live = true
    const revisionNow = revision
    listTimes(layoutId, revisionNow)
      .then((items) => { if (live) setLoaded({ revision: revisionNow, rows: items, error: false }) })
      .catch(() => { if (live) setLoaded({ revision: revisionNow, rows: [], error: true }) })
    return () => { live = false }
  }, [layoutId, revision])

  const ready = loaded?.revision === revision
  return {
    rows: ready ? loaded.rows : [],
    ready,
    error: Boolean(ready && loaded.error),
  }
}

export const LapBoard = ({ layoutId, revision }) => {
  const user = useAuth()
  const board = useLapBoard(layoutId, revision)
  return (
    <section className="lap-board" aria-label="Lap board">
      <h3>Lap board</h3>
      {!firebaseConfigured && <p>The lap board is not available.</p>}
      {firebaseConfigured && !revision && <p>Reading the lap board…</p>}
      {firebaseConfigured && revision && !board.ready && !board.error && <p>Reading the lap board…</p>}
      {board.error && <p>The lap board could not be loaded.</p>}
      {board.ready && !board.error && board.rows.length === 0 && <p>No lap has been posted on this layout.</p>}
      {board.rows.length > 0 && (
        <ol>
          {board.rows.map((row, index) => (
            <li key={row.uid} className={user?.uid === row.uid ? 'mine' : ''} aria-current={user?.uid === row.uid ? 'true' : undefined}>
              <span>{index + 1}</span>
              <b>{row.name}</b>
              <em>{fmtLap(row.timeS, 3)}</em>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
