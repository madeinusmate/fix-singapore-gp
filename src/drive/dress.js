const WINDOWS = /window/i

// Window textures already paint the lit panes. At night that map becomes the
// light; by day the glass stays unlit.
export const paintWindows = (material, intensity) => {
  if (!WINDOWS.test(material?.name || '') || !material.map) return false
  material.emissive.set(intensity > 0 ? '#ffc98a' : '#000000')
  material.emissiveMap = intensity > 0 ? material.map : null
  material.emissiveIntensity = intensity
  return true
}
