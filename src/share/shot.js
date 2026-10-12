export const SHOT_WIDTH = 1200
export const SHOT_HEIGHT = 630

const ID = /^[A-Za-z0-9]+$/
const UID = /^[A-Za-z0-9_-]+$/
const BUCKET = /^[A-Za-z0-9.-]+$/

// Public object path. The Firestore and Storage rules allow this shape only.
export const layoutShotPath = (uid, id) => (
  typeof uid === 'string' && typeof id === 'string' && UID.test(uid) && ID.test(id)
    ? `layouts/${uid}/${id}.jpg`
    : null
)

export const layoutShotUrl = (bucket, uid, id) => {
  const path = layoutShotPath(uid, id)
  if (!path || !BUCKET.test(bucket || '')) return null
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media`
}

export const isLayoutShotUrl = (url, uid, id) => {
  if (typeof url !== 'string') return false
  const bucket = /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/([A-Za-z0-9.-]+)\/o\//.exec(url)?.[1]
  return Boolean(bucket && url === layoutShotUrl(bucket, uid, id))
}
