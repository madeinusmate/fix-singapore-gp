import { useEffect, useState } from 'react'
import { accountName, auth, signIn } from './client.js'
import { setVote, votedOn } from './layouts.js'

// Tracks which of `ids` the signed-in account has upvoted, plus local count
// changes that have not come back from Firestore yet.
export const useVotes = (ids, user) => {
  const [mine, setMine] = useState({ uid: null, ids: new Set() })
  const [delta, setDelta] = useState({})
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const key = ids.join(',')

  useEffect(() => {
    if (!user || !key) return undefined
    let live = true
    votedOn(key.split(','), user.uid)
      .then((found) => { if (live) setMine((prev) => ({ uid: user.uid, ids: new Set([...(prev.uid === user.uid ? prev.ids : []), ...found]) })) })
      .catch(() => {})
    return () => { live = false }
  }, [user, key])

  const voted = user && mine.uid === user.uid ? mine.ids : new Set()

  const toggle = async (id) => {
    if (busy) return
    setError('')
    setBusy(id)
    try {
      let account = user || auth.currentUser
      if (!account) account = (await signIn()).user
      if (!(await accountName(account))) throw new Error('This Google account has no display name, so it cannot vote.')
      const already = mine.uid === account.uid ? mine.ids.has(id) : (await votedOn([id], account.uid)).has(id)
      const step = already ? -1 : 1
      const mark = (value) => setMine((prev) => {
        const next = new Set(prev.uid === account.uid ? prev.ids : [])
        if (value) next.add(id)
        else next.delete(id)
        return { uid: account.uid, ids: next }
      })
      mark(!already)
      setDelta((prev) => ({ ...prev, [id]: (prev[id] || 0) + step }))
      try {
        await setVote(id, account.uid, !already)
      } catch (err) {
        mark(already)
        setDelta((prev) => ({ ...prev, [id]: (prev[id] || 0) - step }))
        throw err
      }
    } catch (err) {
      if (err?.code !== 'auth/popup-closed-by-user' && err?.code !== 'auth/cancelled-popup-request') setError(err.message || 'Could not save your vote.')
    } finally {
      setBusy(null)
    }
  }

  return {
    voted,
    count: (id, base) => Math.max(0, (base || 0) + (delta[id] || 0)),
    toggle,
    busy,
    error,
  }
}
