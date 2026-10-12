import { deleteObject, ref, uploadBytes } from 'firebase/storage'
import { layoutShotPath, layoutShotUrl } from '../share/shot.js'
import { storage } from './client.js'
import { setLayoutImage } from './layouts.js'

const bucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET
const MAX_BYTES = 2 * 1024 * 1024

const uploadLayoutShot = async (uid, id, blob) => {
  const path = layoutShotPath(uid, id)
  const imageUrl = layoutShotUrl(bucket, uid, id)
  if (!storage || !path || !imageUrl) throw new Error('Storage is not configured.')
  if (!blob || blob.size < 1 || blob.size >= MAX_BYTES) throw new Error('The 3D picture is the wrong size.')
  await uploadBytes(ref(storage, path), blob, {
    contentType: 'image/jpeg',
    cacheControl: 'public, max-age=3600',
  })
  return imageUrl
}

export const storeLayoutShot = async (uid, id, blob) => {
  const imageUrl = await uploadLayoutShot(uid, id, blob)
  await setLayoutImage(id, imageUrl)
  return imageUrl
}

export const deleteLayoutShot = async (uid, id) => {
  const path = layoutShotPath(uid, id)
  if (!storage || !path) return
  try {
    await deleteObject(ref(storage, path))
  } catch (error) {
    if (error?.code !== 'storage/object-not-found') throw error
  }
}
