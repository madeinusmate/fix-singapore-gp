import { collection, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore'
import { db } from './client.js'
import { byBoardOrder } from '../drive/postLap.js'

const BATCH = 400

const timesCol = (layoutId) => collection(db, 'lapBoards', layoutId, 'times')
const timeRef = (layoutId, uid) => doc(db, 'lapBoards', layoutId, 'times', uid)

const rowFrom = (item) => ({
  uid: item.id,
  timeS: item.data().timeS,
  name: item.data().name,
  revision: item.data().revision,
  setAt: item.data().setAt,
})

export const boardId = (circuit, id) => (
  id === 'current' && circuit && circuit !== 'singapore' ? `${circuit}-current` : id
)

export const readCurrentPin = async (id = 'current') => {
  const snap = await getDoc(doc(db, 'lapBoards', id))
  if (!snap.exists()) return null
  const data = snap.data()
  if (typeof data.revision !== 'string' || typeof data.simLapS !== 'number' || !(data.simLapS > 0)) return null
  return { revision: data.revision, simLapS: data.simLapS }
}

export const readMyTime = async (layoutId, uid) => {
  const snap = await getDoc(timeRef(layoutId, uid))
  if (!snap.exists()) return null
  return rowFrom(snap)
}

export const readFastest = async (layoutId, revision) => {
  const rows = await listTimes(layoutId, revision)
  return rows[0] ? { uid: rows[0].uid, timeS: rows[0].timeS, name: rows[0].name, revision: rows[0].revision } : null
}

// Every row for this revision. The page shows the whole board, sorted fastest
// first with the earlier equal time ahead.
export const listTimes = async (layoutId, revision) => {
  const snap = await getDocs(query(timesCol(layoutId), where('revision', '==', revision)))
  return snap.docs.map(rowFrom).sort(byBoardOrder)
}

export const postTime = async (layoutId, uid, { timeS, name, revision }) => {
  const ref = timeRef(layoutId, uid)
  const data = { timeS, name, revision, setAt: serverTimestamp() }
  const snap = await getDoc(ref)
  if (snap.exists()) await updateDoc(ref, data)
  else await setDoc(ref, data)
}

// Removes every row. Used only while deleting the layout those rows belong to.
export const deleteBoard = async (layoutId) => {
  for (;;) {
    const snap = await getDocs(query(timesCol(layoutId), limit(BATCH)))
    if (snap.empty) return
    const batch = writeBatch(db)
    snap.docs.forEach((item) => batch.delete(item.ref))
    await batch.commit()
    if (snap.size < BATCH) return
  }
}
