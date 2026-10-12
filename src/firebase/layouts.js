import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, increment, limit, orderBy, query, serverTimestamp, startAfter, updateDoc, writeBatch } from 'firebase/firestore'
import { SIM_VERSION } from '../sim/const.js'
import { db } from './client.js'
import { deleteBoard } from './times.js'

export const PAGE_SIZE = 24

const col = () => collection(db, 'layouts')
const voteDoc = (id, uid) => doc(db, 'layouts', id, 'votes', uid)

export const pageLayouts = async (after) => {
  const ranked = [orderBy('votes', 'desc'), orderBy('createdAt', 'desc')]
  const q = after
    ? query(col(), ...ranked, startAfter(after), limit(PAGE_SIZE))
    : query(col(), ...ranked, limit(PAGE_SIZE))
  const snap = await getDocs(q)
  return {
    items: snap.docs.map((item) => ({ id: item.id, ...item.data() })),
    cursor: snap.docs.at(-1) || null,
  }
}

export const readLayout = async (id) => {
  const snap = await getDoc(doc(db, 'layouts', id))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() }
}

export const createLayout = (data) => addDoc(col(), {
  ...data,
  votes: 0,
  simVersion: SIM_VERSION,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
})

export const saveLayout = (id, data) => updateDoc(doc(db, 'layouts', id), {
  ...data,
  simVersion: SIM_VERSION,
  updatedAt: serverTimestamp(),
})

export const setLayoutImage = (id, imageUrl) => updateDoc(doc(db, 'layouts', id), {
  imageUrl,
  updatedAt: serverTimestamp(),
})

export const removeLayout = async (id) => {
  await deleteBoard(id)
  await deleteDoc(doc(db, 'layouts', id))
}

export const votedOn = async (ids, uid) => {
  const snaps = await Promise.all(ids.map((id) => getDoc(voteDoc(id, uid))))
  return new Set(snaps.filter((snap) => snap.exists()).map((snap) => snap.ref.parent.parent.id))
}

export const setVote = async (id, uid, on) => {
  const batch = writeBatch(db)
  if (on) batch.set(voteDoc(id, uid), { createdAt: serverTimestamp() })
  else batch.delete(voteDoc(id, uid))
  batch.update(doc(db, 'layouts', id), { votes: increment(on ? 1 : -1) })
  await batch.commit()
}
