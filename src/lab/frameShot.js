// Where a set of screen points should sit inside the photograph.
// shiftX/shiftY move the camera so the box center lands on the padded frame center.
// scale is how much to zoom so the box fills that frame.
export const shotFrame = (points, { width, height, padding }) => {
  const pad = padding
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let count = 0
  for (const point of points) {
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) continue
    if (Math.abs(point.x) > width * 8 || Math.abs(point.y) > height * 8) continue
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
    count += 1
  }
  const boxW = maxX - minX
  const boxH = maxY - minY
  if (count < 2 || boxW < 1 || boxH < 1) return null
  const availW = Math.max(1, width - pad.left - pad.right)
  const availH = Math.max(1, height - pad.top - pad.bottom)
  return {
    scale: Math.min(availW / boxW, availH / boxH),
    shiftX: (minX + maxX) / 2 - (pad.left + availW / 2),
    shiftY: (minY + maxY) / 2 - (pad.top + availH / 2),
  }
}
