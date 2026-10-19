import { DataTexture, Matrix4, RGBAFormat } from 'three'

// Bay water keeps the OSM2World material and adds a ripple plus a planar
// reflection of the city. The reflection uniforms are shared by every water
// material so one render lights the whole shoreline.
const blank = () => {
  const texture = new DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, RGBAFormat)
  texture.needsUpdate = true
  return texture
}
const RIPPLE = `
  float ripple = sin(vCorridor.x * 0.35 + waterTime) * sin(vCorridor.z * 0.28 - waterTime * 0.8);
  normal = normalize(normal + vec3(dFdx(ripple), dFdy(ripple), 0.0) * 0.65);
`
const REFLECT = `
  if (waterReflectOn > 0.5) {
    vec4 wproj = waterMatrix * vec4(vCorridor, 1.0);
    vec2 wuv = wproj.xy / wproj.w;
    wuv += vec2(
      sin(vCorridor.x * 0.35 + waterTime),
      sin(vCorridor.z * 0.28 - waterTime * 0.8)
    ) * 0.012;
    if (wproj.w > 0.0 && wuv.x > 0.02 && wuv.x < 0.98 && wuv.y > 0.02 && wuv.y < 0.98) {
      vec3 reflected = texture2D(waterReflect, wuv).rgb;
      float fresnel = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 3.0);
      outgoingLight = mix(outgoingLight, reflected, 0.42 + fresnel * 0.5);
    }
  }
`

export const createWaterUniforms = () => ({
  waterTime: { value: 0 },
  waterReflect: { value: blank() },
  waterMatrix: { value: new Matrix4() },
  waterReflectOn: { value: 0 },
})

export const paintWater = (material, { color, night }) => {
  material.color.set(color)
  material.roughness = night ? 0.08 : 0.1
  material.metalness = night ? 0.22 : 0.14
  material.envMapIntensity = night ? 1.15 : 0.9
}

export const dressWater = (material, uniforms) => {
  if (material.userData.water) return
  material.userData.water = true
  const previous = material.onBeforeCompile
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer)
    shader.uniforms.waterTime = uniforms.waterTime
    shader.uniforms.waterReflect = uniforms.waterReflect
    shader.uniforms.waterMatrix = uniforms.waterMatrix
    shader.uniforms.waterReflectOn = uniforms.waterReflectOn
    shader.fragmentShader = `uniform float waterTime;\nuniform sampler2D waterReflect;\nuniform mat4 waterMatrix;\nuniform float waterReflectOn;\n${shader.fragmentShader}`
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${RIPPLE}`)
      .replace('#include <opaque_fragment>', `${REFLECT}\n#include <opaque_fragment>`)
  }
  material.needsUpdate = true
}
