import { MeshStandardMaterial, Texture } from 'three'
import { describe, expect, it } from 'vitest'
import { cutCorridor } from './corridor.js'
import { paintWindows } from './dress.js'
import { createWaterUniforms, dressWater, paintWater } from './water.js'

describe('city dressing', () => {
  it('lights window panes only after dark', () => {
    const map = new Texture()
    const material = new MeshStandardMaterial({ name: 'Windows_Color', map })
    expect(paintWindows(material, 1.15)).toBe(true)
    expect(material.emissiveIntensity).toBe(1.15)
    expect(material.emissiveMap).toBe(map)
    paintWindows(material, 0)
    expect(material.emissiveIntensity).toBe(0)
    expect(material.emissiveMap).toBeNull()
    expect(paintWindows(new MeshStandardMaterial({ name: 'Asphalt010_Color', map }), 1)).toBe(false)
  })

  it('compiles water with a ripple and a reflection on top of the corridor cut', () => {
    const material = new MeshStandardMaterial({ name: 'P1140080E_Water' })
    const uniforms = createWaterUniforms()
    paintWater(material, { color: '#071722', night: true })
    dressWater(material, uniforms)
    cutCorridor(material, { corridorMap: { value: null }, corridorBox: { value: null } })
    const shader = {
      uniforms: {},
      vertexShader: 'void main() {\n#include <project_vertex>\n}\n',
      fragmentShader: 'void main() {\n#include <normal_fragment_maps>\n#include <opaque_fragment>\n}\n',
    }
    material.onBeforeCompile(shader)
    expect(material.metalness).toBeGreaterThan(0.1)
    expect(shader.vertexShader).toContain('vCorridor')
    expect(shader.fragmentShader).toContain('waterReflect')
    expect(shader.fragmentShader).toContain('corridorMap')
    expect(shader.fragmentShader).toContain('outgoingLight')
    expect(shader.uniforms.waterTime).toBe(uniforms.waterTime)
  })
})
