import { deleteApp, initializeApp } from 'firebase/app'
import { addDoc, collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, getFirestore, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createLayout, layoutNameTaken, removeLayout, saveLayout } from './layouts.js'

// Runs against the Firestore emulator only: pnpm test:rules
const emulator = process.env.FIRESTORE_EMULATOR_HOST

const state = { db: null }
vi.mock('./client.js', () => ({ get db() { return state.db } }))

const apps = []
const dbFor = (uid, name) => {
  const [host, port] = emulator.split(':')
  const app = initializeApp({ projectId: 'demo-sgp', apiKey: 'fake' }, uid)
  apps.push(app)
  const db = getFirestore(app)
  connectFirestoreEmulator(db, host, Number(port), { mockUserToken: { user_id: uid, sub: uid, name } })
  return db
}
const alice = { uid: 'alice', name: 'Alice', db: null }
const bob = { uid: 'bob', name: 'Bob', db: null }
const as = (user) => { state.db = user.db }

const body = (user, title, revision = 'rev-1') => ({
  title,
  racingSense: 'cw',
  color: '#ff0000',
  waypoints: [],
  path: 'abc',
  thumb: 'abc',
  revision,
  summary: { lengthKm: 5, lapS: 100, lapOvertakeS: 1, overtakingIndex: 1, heavyBraking: 1, corners: 10, topKmh: 300 },
  creatorId: user.uid,
  creatorName: user.name,
})

const oldCreate = (user, title) => addDoc(collection(user.db, 'layouts'), {
  ...body(user, title), votes: 0, simVersion: 5, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
})

const claimOf = async (user, key) => {
  const snap = await getDoc(doc(user.db, 'layoutNames', key))
  return snap.exists() ? snap.data().layoutId : null
}

describe.skipIf(!emulator)('name rules with the real client', () => {
  beforeAll(() => {
    alice.db = dbFor(alice.uid, alice.name)
    bob.db = dbFor(bob.uid, bob.name)
  })

  afterAll(async () => { await Promise.all(apps.map((app) => deleteApp(app))) })

  it('publishes a new layout and reserves its name', async () => {
    as(alice)
    const ref = await createLayout(body(alice, 'The  Bayfront'))
    const saved = (await getDoc(ref)).data()
    expect(saved.title).toBe('The Bayfront')
    expect(saved.titleKey).toBe('the-bayfront')
    expect(await claimOf(alice, 'the-bayfront')).toBe(ref.id)
  })

  it('blocks the same name in another case or spacing', async () => {
    as(bob)
    expect(await layoutNameTaken('the bayfront')).toBe(true)
    await expect(createLayout(body(bob, 'THE BAYFRONT'))).rejects.toThrow('A layout already uses that name.')
  })

  it('refuses a layout that points at someone else\'s claim', async () => {
    await expect(setDoc(doc(bob.db, 'layouts', 'bob-cheat'), {
      ...body(bob, 'The Bayfront'), titleKey: 'the-bayfront', votes: 0, simVersion: 5, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    })).rejects.toThrow(/permission/i)
  })

  it('refuses taking over a live claim', async () => {
    const id = await claimOf(bob, 'the-bayfront')
    await expect(setDoc(doc(bob.db, 'layoutNames', 'the-bayfront'), { layoutId: id })).rejects.toThrow(/permission/i)
  })

  it('still accepts the old client, which writes no titleKey', async () => {
    const ref = await oldCreate(bob, 'Old Client Loop')
    await updateDoc(ref, { title: 'Old Client Loop 2', updatedAt: serverTimestamp() })
    expect((await getDoc(ref)).data().title).toBe('Old Client Loop 2')
  })

  it('reserves a name when an older layout is saved again', async () => {
    const ref = await oldCreate(bob, 'Legacy Sweep')
    as(bob)
    await saveLayout(ref.id, body(bob, 'Legacy Sweep'))
    expect((await getDoc(ref)).data().titleKey).toBe('legacy-sweep')
    expect(await claimOf(bob, 'legacy-sweep')).toBe(ref.id)
  })

  it('releases the old name on rename', async () => {
    as(alice)
    const ref = await createLayout(body(alice, 'Marina Hook'))
    await saveLayout(ref.id, body(alice, 'Marina Hairpin'))
    expect(await claimOf(alice, 'marina-hook')).toBeNull()
    expect(await claimOf(alice, 'marina-hairpin')).toBe(ref.id)
    as(bob)
    expect(await layoutNameTaken('Marina Hook')).toBe(false)
  })

  it('keeps its own name when saved again', async () => {
    as(alice)
    const ref = await createLayout(body(alice, 'Esplanade Dash'))
    await saveLayout(ref.id, { ...body(alice, 'Esplanade Dash', 'rev-2'), path: 'abcd' })
    expect(await claimOf(alice, 'esplanade-dash')).toBe(ref.id)
  })

  it('frees the name when the layout is deleted', async () => {
    as(alice)
    const ref = await createLayout(body(alice, 'Short Lived'))
    await removeLayout(ref.id)
    expect(await claimOf(alice, 'short-lived')).toBeNull()
  })

  it('lets a new layout take a name left behind by a delete that skipped the claim', async () => {
    as(alice)
    const ref = await createLayout(body(alice, 'Orphan Corner'))
    await deleteDoc(ref)
    expect(await claimOf(alice, 'orphan-corner')).toBe(ref.id)
    as(bob)
    expect(await layoutNameTaken('Orphan Corner')).toBe(false)
    const next = await createLayout(body(bob, 'Orphan Corner'))
    expect(await claimOf(bob, 'orphan-corner')).toBe(next.id)
  })
})
