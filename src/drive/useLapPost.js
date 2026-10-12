import { useCallback, useEffect, useRef, useState } from 'react'
import { accountName, firebaseConfigured } from '../firebase/client.js'
import { postTime, readFastest, readMyTime } from '../firebase/times.js'
import { bestKey, readBest, saveBest } from './lap.js'
import { postOutcome } from './postLap.js'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const retryable = (err) => err?.code !== 'permission-denied' && err?.code !== 'no-name'

// Local best, account best, lap record, and the in-memory retry for a post.
export const useLapPost = ({ id, user, revision, liveRevision, simLapS, pinPending }) => {
  const [saved, setSaved] = useState({})
  const [account, setAccount] = useState(null)
  const [recordFor, setRecordFor] = useState(null)
  const [note, setNote] = useState(null)
  const held = useRef(null)
  const job = useRef(null)
  const wake = useRef(() => {})
  const snap = useRef({})
  const key = id && revision ? bestKey(id, revision) : null
  const accountBest = user && account?.uid === user.uid && account.revision === liveRevision ? account.timeS : null
  const rowReady = !user || !liveRevision || (account?.uid === user.uid && account.revision === liveRevision)
  const record = recordFor?.revision === revision ? recordFor.timeS : null

  useEffect(() => {
    snap.current = { user, key, liveRevision, simLapS, pinPending, rowReady, accountBest }
  }, [user, key, liveRevision, simLapS, pinPending, rowReady, accountBest])

  useEffect(() => {
    if (!firebaseConfigured || !user || !id || !liveRevision) return undefined
    let live = true
    const uid = user.uid
    const revisionNow = liveRevision
    readMyTime(id, uid)
      .then((row) => {
        if (!live) return
        setAccount({
          uid,
          revision: revisionNow,
          timeS: row?.revision === revisionNow ? row.timeS : null,
        })
      })
      .catch(() => { if (live) setAccount({ uid, revision: revisionNow, timeS: null }) })
    return () => { live = false }
  }, [user, id, liveRevision])

  useEffect(() => {
    if (!firebaseConfigured || !id || !revision) return undefined
    let live = true
    const revisionNow = revision
    readFastest(id, revisionNow)
      .then((row) => { if (live) setRecordFor({ revision: revisionNow, timeS: row ? row.timeS : null }) })
      .catch(() => { if (live) setRecordFor({ revision: revisionNow, timeS: null }) })
    return () => { live = false }
  }, [id, revision, accountBest])

  const apply = useCallback((lap, now) => {
    const row = now.accountBest != null && now.liveRevision
      ? { timeS: now.accountBest, revision: now.liveRevision }
      : null
    const outcome = postOutcome({
      clean: lap.clean,
      signedIn: Boolean(now.user),
      timeS: lap.time,
      simLapS: now.simLapS,
      liveRevision: now.liveRevision,
      row,
    })
    if (!outcome.post) {
      setNote(outcome.note)
      return
    }
    job.current = { timeS: lap.time, revision: now.liveRevision }
    setNote('trying')
    wake.current()
  }, [])

  const accept = useCallback((lap) => {
    const now = snap.current
    const previous = now.key ? readBest(now.key) : null
    if (lap.clean && now.key) {
      const next = saveBest(now.key, lap.time)
      setSaved((all) => ({ ...all, [now.key]: next }))
    }
    if (!lap.clean) {
      setNote(null)
      return previous
    }
    if (now.user && (now.pinPending || !now.rowReady)) {
      held.current = lap
      setNote('trying')
      return previous
    }
    held.current = null
    apply(lap, now)
    return previous
  }, [apply])

  useEffect(() => {
    if (pinPending || !rowReady || !held.current) return undefined
    const lap = held.current
    const now = snap.current
    held.current = null
    let live = true
    queueMicrotask(() => { if (live) apply(lap, now) })
    return () => { live = false }
  }, [pinPending, rowReady, liveRevision, simLapS, apply])

  useEffect(() => {
    if (!firebaseConfigured || !user || !id) return undefined
    let live = true
    let waiting = null
    wake.current = () => {
      waiting?.()
      waiting = null
    }
    const run = async () => {
      while (live) {
        const current = job.current
        if (!current) {
          await new Promise((resolve) => { waiting = resolve })
          continue
        }
        try {
          const name = await accountName(user)
          if (!name) throw Object.assign(new Error('This Google account has no display name.'), { code: 'no-name' })
          await postTime(id, user.uid, { timeS: current.timeS, name, revision: current.revision })
          if (!live || job.current !== current) continue
          job.current = null
          setAccount({ uid: user.uid, revision: current.revision, timeS: current.timeS })
          setRecordFor((prev) => (
            prev?.revision === current.revision && prev.timeS != null && prev.timeS <= current.timeS
              ? prev
              : { revision: current.revision, timeS: current.timeS }
          ))
          setNote(null)
        } catch (err) {
          if (!live || job.current !== current) continue
          if (!retryable(err)) {
            job.current = null
            setNote(err?.code === 'no-name' ? 'noname' : 'denied')
            continue
          }
          await sleep(1500)
        }
      }
    }
    run()
    return () => {
      live = false
      waiting?.()
      wake.current = () => {}
    }
  }, [user, id])

  return {
    note,
    record,
    best: user ? accountBest : (key ? (saved[key] ?? readBest(key)) : null),
    accept,
  }
}
