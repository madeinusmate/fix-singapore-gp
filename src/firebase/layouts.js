import { collection, doc, getDoc, getDocs, increment, limit, orderBy, query, runTransaction, serverTimestamp, startAfter, updateDoc, where, writeBatch } from 'firebase/firestore'
import { NAME_LENGTH, NAME_TAKEN, layoutName, nameIsTaken, nameKey } from '../moderation/name.js'
import { SIM_VERSION } from '../sim/const.js'
import { db } from './client.js'
import { deleteBoard } from './times.js'

export const PAGE_SIZE = 24

const col = () => collection(db, 'layouts')
const voteDoc = (id, uid) => doc(db, 'layouts', id, 'votes', uid)
const nameRef = (key) => doc(db, 'layoutNames', key)

const takenError = () => Object.assign(new Error(NAME_TAKEN), { code: 'name-taken' })

const claimHolder = async (key, read) => {
  const claim = await read(nameRef(key))
  const holder = claim.exists() ? claim.data().layoutId : null
  if (!holder) return null
  const layout = await read(doc(db, 'layouts', holder))
  return layout.exists() ? holder : null
}

export const layoutNameTaken = async (title, exceptId = null) => {
  const normalized = layoutName(title)
  const key = nameKey(normalized)
  if (!key) return false
  const [holder, titled] = await Promise.all([
    claimHolder(key, getDoc),
    getDocs(query(col(), where('title', '==', normalized), limit(5))),
  ])
  return nameIsTaken(holder, titled.docs.map((item) => item.id), exceptId)
}

const reserveName = async (ref, data, creating) => {
  const title = layoutName(data.title)
  const key = nameKey(title)
  if (!title || !key) throw new Error(NAME_LENGTH)
  if (await layoutNameTaken(title, creating ? null : ref.id)) throw takenError()
  const record = { ...data, title, titleKey: key, simVersion: SIM_VERSION }
  await runTransaction(db, async (tx) => {
    const read = (target) => tx.get(target)
    const holder = await claimHolder(key, read)
    const current = creating ? null : await tx.get(ref)
    const previousKey = current?.data()?.titleKey
    const previousSnap = previousKey && previousKey !== key ? await tx.get(nameRef(previousKey)) : null
    if (holder && holder !== ref.id) throw takenError()
    if (creating) {
      tx.set(ref, { ...record, votes: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
    } else {
      tx.update(ref, { ...record, updatedAt: serverTimestamp() })
    }
    if (holder !== ref.id) tx.set(nameRef(key), { layoutId: ref.id })
    if (previousSnap?.exists() && previousSnap.data().layoutId === ref.id) tx.delete(nameRef(previousKey))
  })
}

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

export const createLayout = async (data) => {
  const ref = doc(col())
  await reserveName(ref, data, true)
  return ref
}

export const saveLayout = (id, data) => reserveName(doc(db, 'layouts', id), data, false)

export const setLayoutImage = (id, imageUrl) => updateDoc(doc(db, 'layouts', id), {
  imageUrl,
  updatedAt: serverTimestamp(),
})

export const removeLayout = async (id) => {
  const ref = doc(db, 'layouts', id)
  const snap = await getDoc(ref)
  const key = snap.data()?.titleKey
  await deleteBoard(id)
  const batch = writeBatch(db)
  if (key) {
    const claim = await getDoc(nameRef(key))
    if (claim.exists() && claim.data().layoutId === id) batch.delete(nameRef(key))
  }
  batch.delete(ref)
  await batch.commit()
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
