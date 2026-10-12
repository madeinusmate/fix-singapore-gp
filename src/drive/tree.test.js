import { Texture } from 'three'
import { describe, expect, it } from 'vitest'
import { uprightTreeTexture } from './city.js'

const sampleV = (texture, v) => {
  texture.updateMatrix()
  const m = texture.matrix.elements
  return m[4] * v + m[7]
}

describe('tree textures', () => {
  it('puts the canopy back at the top of an upside-down tree card', () => {
    const texture = new Texture()
    texture.userData = {}
    uprightTreeTexture(texture)
    expect(sampleV(texture, 1)).toBeCloseTo(0)
    expect(sampleV(texture, 0)).toBeCloseTo(1)
    uprightTreeTexture(texture)
    expect(sampleV(texture, 1)).toBeCloseTo(0)
  })
})
