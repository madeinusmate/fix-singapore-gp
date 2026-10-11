import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, startAfter, updateDoc } from 'firebase/firestore'
import { SIM_VERSION } from '../sim/const.js'
import { db } from './client.js'

const col = () => collection(db, 'layouts')

export const pageLayouts = async (after) => {
  const q = after
    ? query(col(), orderBy('createdAt', 'desc'), startAfter(after), limit(24))
    : query(col(), orderBy('createdAt', 'desc'), limit(24))
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
  simVersion: SIM_VERSION,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
})

export const saveLayout = (id, data) => updateDoc(doc(db, 'layouts', id), {
  ...data,
  simVersion: SIM_VERSION,
  updatedAt: serverTimestamp(),
})

export const removeLayout = (id) => deleteDoc(doc(db, 'layouts', id))
