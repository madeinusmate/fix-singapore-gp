import proj4 from 'proj4'

proj4.defs(
  'EPSG:3414',
  '+proj=tmerc +lat_0=1.36666666666667 +lon_0=103.833333333333 +k=1 +x_0=28001.642 +y_0=38744.572 +ellps=WGS84 +units=m +no_defs',
)

const svy21 = proj4('EPSG:4326', 'EPSG:3414')

// Local equirectangular metres. Used when a graph names its own origin, so a
// lap in Monaco is not measured on the Singapore projection.
const localMetres = (lng, lat, [lon0, lat0]) => {
  const cos = Math.cos((lat0 * Math.PI) / 180)
  return [(lng - lon0) * 111320 * cos, (lat - lat0) * 110540]
}

const localLngLat = (x, y, [lon0, lat0]) => {
  const cos = Math.cos((lat0 * Math.PI) / 180)
  return [lon0 + x / (111320 * cos), lat0 + y / 110540]
}

export const toMetres = (lng, lat, origin) => (origin ? localMetres(lng, lat, origin) : svy21.forward([lng, lat]))

export const toLngLat = (x, y, origin) => (origin ? localLngLat(x, y, origin) : svy21.inverse([x, y]))
