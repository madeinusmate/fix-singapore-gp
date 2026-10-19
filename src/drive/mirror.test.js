import { PerspectiveCamera, Vector4 } from 'three'
import { describe, expect, it } from 'vitest'
import { aimMirror, createMirror } from './mirror.js'

describe('water mirror', () => {
  it('puts the reflection camera under a viewer standing above the bay', () => {
    const camera = new PerspectiveCamera(60, 1.5, 0.2, 2000)
    camera.position.set(10, 12, 40)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()
    camera.updateProjectionMatrix()
    const mirror = createMirror()
    expect(aimMirror(camera, mirror)).toBe(true)
    expect(mirror.camera.position.y).toBeLessThan(0)
    expect(mirror.camera.position.x).toBeCloseTo(10, 0)
    expect(mirror.camera.position.z).toBeCloseTo(40, 0)
    const origin = new Vector4(0, 0, 0, 1).applyMatrix4(mirror.textureMatrix)
    expect(origin.x / origin.w).toBeCloseTo(0.5, 1)
    expect(origin.y / origin.w).toBeCloseTo(0.5, 1)
    mirror.dispose()
  })

  it('skips the reflection when the camera is under the plane', () => {
    const camera = new PerspectiveCamera(60, 1, 0.2, 100)
    camera.position.set(0, -4, 10)
    camera.lookAt(0, -4, 0)
    camera.updateMatrixWorld()
    camera.updateProjectionMatrix()
    const mirror = createMirror()
    expect(aimMirror(camera, mirror)).toBe(false)
    mirror.dispose()
  })
})
