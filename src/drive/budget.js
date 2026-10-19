// Frame budget for the drive page.
//
// A street-circuit city is a lot of triangles. Drawing it with a PBR shader,
// two shadow maps and a second camera for the bay reflection is what makes the
// page stall or drop the WebGL context. The settings below follow the usual
// real-time limits: one shadow map, shadows only from the car and the barriers,
// a pixel ratio near 1, and a water mirror that is small, infrequent, and
// switched off when frames stay slow.
//
// Open-source options that were tried against this and not taken:
// - streets-gl (MIT) draws OpenStreetMap in 3D, but its deferred shading, SSAO
//   and screen-space reflections expect a discrete GPU.
// - three.js Water (examples/jsm/objects/Water.js) is the same full-scene
//   mirror. When the mirror is off, the bay uses the PMREM environment map
//   that is already lighting the car.
// - OSM2World's web module can bake LOD 0–4. This city is already LOD 2.
//   meshoptimizer's simplifier (MIT) reduces that bake without regenerating it.
// - @react-three/drei PerformanceMonitor does the same frame-time step-down
//   as Tune in DriveScene. The loop is short, so the page does not take the
//   package on.

export const ENV_PX = 512
export const ANISOTROPY = 4
export const REFLECT_EVERY = 4
export const SHADOW_HIGH = 1024
export const SHADOW_LOW = 512
// Spot lights that dress the track. They do not share a layer with the city,
// so the city shader does not carry them.
export const TRACK_LAYER = 1

export const readDevice = (nav = typeof navigator === 'undefined' ? undefined : navigator, match) => {
  const cores = nav?.hardwareConcurrency || 8
  const memory = nav?.deviceMemory || 8
  const matchOf = match ?? (typeof matchMedia === 'function' ? (query) => matchMedia(query) : null)
  let coarse = false
  try {
    coarse = matchOf ? !!matchOf('(pointer: coarse)').matches : false
  } catch {
    coarse = false
  }
  return { cores, memory, coarse, saveData: !!nav?.connection?.saveData }
}

export const budgetFor = (device) => {
  const low = !!(device.saveData || device.coarse || device.cores <= 4 || device.memory <= 4)
  return {
    low,
    dpr: low ? [1, 1] : [1, 1.25],
    shadowMap: low ? SHADOW_LOW : SHADOW_HIGH,
    shadows: low ? 'basic' : 'percentage',
    reflect: !low,
  }
}

// Ground under the car, sized to the fog. Cells stay wide enough that the
// plane does not flicker through the road, and narrow enough that a couple of
// huge triangles do not either.
export const groundGrid = (fogFar, low) => {
  const span = Math.min(12000, Math.max(2000, fogFar * 2 + 600))
  const cell = low ? 550 : 400
  const cells = Math.max(6, Math.round(span / cell))
  return { span, cells }
}
