import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isLayoutShotUrl, layoutShotPath, layoutShotUrl } from './shot.js'

describe('layout shots', () => {
  const url = layoutShotUrl('sgp-2027.firebasestorage.app', 'uid_1', 'layout9')

  it('builds a public download url in the creator folder', () => {
    expect(layoutShotPath('uid_1', 'layout9')).toBe('layouts/uid_1/layout9.jpg')
    expect(url).toBe('https://firebasestorage.googleapis.com/v0/b/sgp-2027.firebasestorage.app/o/layouts%2Fuid_1%2Flayout9.jpg?alt=media')
    expect(isLayoutShotUrl(url, 'uid_1', 'layout9')).toBe(true)
  })

  it('rejects anything that is not this layout\'s picture', () => {
    expect(layoutShotUrl('', 'uid_1', 'layout9')).toBeNull()
    expect(layoutShotPath(undefined, 'layout9')).toBeNull()
    expect(isLayoutShotUrl(url, 'other', 'layout9')).toBe(false)
    expect(isLayoutShotUrl(url, 'uid_1', 'other')).toBe(false)
    expect(isLayoutShotUrl('https://evil.example/layouts%2Fuid_1%2Flayout9.jpg?alt=media', 'uid_1', 'layout9')).toBe(false)
    expect(isLayoutShotUrl(`${url}&token=secret`, 'uid_1', 'layout9')).toBe(false)
  })

  it('uses the same public url the storage rules allow', () => {
    const firestore = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8')
    const storage = readFileSync(new URL('../../storage.rules', import.meta.url), 'utf8')
    const [host, uid, file] = url.split('%2F')
    expect(uid).toBe('uid_1')
    expect(file).toBe('layout9.jpg?alt=media')
    expect(host).toMatch(/^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[A-Za-z0-9.-]+\/o\/layouts$/)
    expect(firestore).toContain("d.imageUrl.split('%2F')[1] == d.creatorId")
    expect(firestore).toContain("id + '.jpg?alt=media'")
    expect(storage).toContain('allow get: if isShot()')
    expect(storage).toContain('request.auth.uid == uid')
    expect(storage).toContain("contentType == 'image/jpeg'")
  })
})
