const scale = 1e6

export const encodePath = (points) => {
  let out = ''
  let plat = 0
  let plng = 0
  points.forEach(([lng, lat]) => {
    const ilat = Math.round(lat * scale)
    const ilng = Math.round(lng * scale)
    out += chunk(ilat - plat)
    out += chunk(ilng - plng)
    plat = ilat
    plng = ilng
  })
  return out
}

const chunk = (value) => {
  let v = value < 0 ? ~(value << 1) : value << 1
  let out = ''
  while (v >= 0x20) {
    out += String.fromCharCode((0x20 | (v & 0x1f)) + 63)
    v >>= 5
  }
  return out + String.fromCharCode(v + 63)
}

export const decodePath = (text) => {
  const points = []
  let i = 0
  let lat = 0
  let lng = 0
  const pull = () => {
    let result = 0
    let shift = 0
    let byte = 0
    do {
      byte = text.charCodeAt(i) - 63
      i += 1
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    return result & 1 ? ~(result >> 1) : result >> 1
  }
  while (i < text.length) {
    lat += pull()
    lng += pull()
    points.push([lng / scale, lat / scale])
  }
  return points
}

export const simplify = (points, stepM = 40) => {
  if (points.length < 3) return points
  const keep = [points[0]]
  let since = 0
  for (let i = 1; i < points.length; i += 1) {
    const [x1, y1] = points[i - 1]
    const [x2, y2] = points[i]
    const dx = (x2 - x1) * 111320 * Math.cos(((y1 + y2) / 2) * Math.PI / 180)
    const dy = (y2 - y1) * 110540
    since += Math.hypot(dx, dy)
    if (since >= stepM) {
      keep.push(points[i])
      since = 0
    }
  }
  keep.push(points[points.length - 1])
  return keep
}
