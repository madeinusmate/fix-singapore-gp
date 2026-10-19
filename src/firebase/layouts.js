import { and, collection, doc, getDoc, getDocs, increment, limit, or, orderBy, query, runTransaction, serverTimestamp, startAfter, updateDoc, where, writeBatch } from 'firebase/firestore'
import { NAME_LENGTH, NAME_TAKEN, layoutName, nameIsTaken, nameKey } from '../moderation/name.js'
import { SIM_VERSION } from '../sim/const.js'
import { db } from './client.js'
import { deleteBoard } from './times.js'

export const PAGE_SIZE = 24

const col = () => collection(db, 'layouts')
const voteDoc = (id, uid) => doc(db, 'layouts', id, 'votes', uid)

export const claimId = (circuit, titleKey) => (
  !circuit || circuit === 'singapore' ? titleKey : `${circuit}_${titleKey}`
)

const nameRef = (circuit, key) => doc(db, 'layoutNames', claimId(circuit, key))

const circuitOf = (data) => data?.circuit || 'singapore'

const cityFilter = (circuit) => (circuit === 'singapore'
  ? or(where('circuit', '==', 'singapore'), where('circuit', '==', null))
  : where('circuit', '==', circuit))

const titleInCity = (title, circuit) => (circuit === 'singapore'
  ? or(
    and(where('title', '==', title), where('circuit', '==', 'singapore')),
    and(where('title', '==', title), where('circuit', '==', null)),
  )
  : and(where('title', '==', title), where('circuit', '==', circuit)))

const takenError = () => Object.assign(new Error(NAME_TAKEN), { code: 'name-taken' })

const claimHolder = async (circuit, key, read) => {
  const claim = await read(nameRef(circuit, key))
  const holder = claim.exists() ? claim.data().layoutId : null
  if (!holder) return null
  const layout = await read(doc(db, 'layouts', holder))
  return layout.exists() ? holder : null
}

export const layoutNameTaken = async (title, exceptId = null, circuit = 'singapore') => {
  const normalized = layoutName(title)
  const key = nameKey(normalized)
  if (!key) return false
  const [holder, titled] = await Promise.all([
    claimHolder(circuit, key, getDoc),
    getDocs(query(col(), titleInCity(normalized, circuit), limit(5))),
  ])
  return nameIsTaken(holder, titled.docs.map((item) => item.id), exceptId)
}

const reserveName = async (ref, data, creating) => {
  const circuit = data.circuit || 'singapore'
  const title = layoutName(data.title)
  const key = nameKey(title)
  if (!title || !key) throw new Error(NAME_LENGTH)
  if (await layoutNameTaken(title, creating ? null : ref.id, circuit)) throw takenError()
  const record = { ...data, circuit, title, titleKey: key, simVersion: SIM_VERSION }
  await runTransaction(db, async (tx) => {
    const read = (target) => tx.get(target)
    const holder = await claimHolder(circuit, key, read)
    const current = creating ? null : await tx.get(ref)
    const previous = current?.data()
    const previousKey = previous?.titleKey
    const previousCircuit = previous ? circuitOf(previous) : null
    const claimChanged = previousKey && (previousKey !== key || previousCircuit !== circuit)
    const previousSnap = claimChanged ? await tx.get(nameRef(previousCircuit, previousKey)) : null
    if (holder && holder !== ref.id) throw takenError()
    if (creating) {
      tx.set(ref, { ...record, votes: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
    } else {
      tx.update(ref, { ...record, updatedAt: serverTimestamp() })
    }
    if (holder !== ref.id) tx.set(nameRef(circuit, key), { layoutId: ref.id })
    if (previousSnap?.exists() && previousSnap.data().layoutId === ref.id) tx.delete(nameRef(previousCircuit, previousKey))
  })
}

const rankOrder = (rank) => (
  rank === 'index'
    ? [orderBy('summary.overtakingIndex', 'desc'), orderBy('createdAt', 'desc')]
    : [orderBy('votes', 'desc'), orderBy('createdAt', 'desc')]
)

export const pageLayouts = async (after, rank = 'votes', circuit = 'singapore') => {
  const ranked = [cityFilter(circuit), ...rankOrder(rank)]
  const q = after
    ? query(col(), ...ranked, startAfter(after), limit(PAGE_SIZE))
    : query(col(), ...ranked, limit(PAGE_SIZE))
  const snap = await getDocs(q)
  return {
    items: snap.docs.map((item) => ({ id: item.id, ...item.data() })),
    cursor: snap.docs.at(-1) || null,
  }
}

const TRACK_LIMIT = 200

export const listTracks = async (circuit = 'singapore') => {
  const snap = await getDocs(query(col(), cityFilter(circuit), orderBy('title'), limit(TRACK_LIMIT)))
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }))
}

export const readLayout = async (id, circuit = 'singapore') => {
  const snap = await getDoc(doc(db, 'layouts', id))
  if (!snap.exists()) return null
  const data = snap.data()
  if (circuitOf(data) !== circuit) return null
  return { id: snap.id, ...data }
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
  const data = snap.data()
  const key = data?.titleKey
  await deleteBoard(id)
  const batch = writeBatch(db)
  if (key) {
    const claim = await getDoc(nameRef(circuitOf(data), key))
    if (claim.exists() && claim.data().layoutId === id) batch.delete(nameRef(circuitOf(data), key))
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
