import proj4 from 'proj4'

proj4.defs(
  'EPSG:3414',
  '+proj=tmerc +lat_0=1.36666666666667 +lon_0=103.833333333333 +k=1 +x_0=28001.642 +y_0=38744.572 +ellps=WGS84 +units=m +no_defs',
)

const svy21 = proj4('EPSG:4326', 'EPSG:3414')

export const toMetres = (lng, lat) => svy21.forward([lng, lat])

export const toLngLat = (x, y) => svy21.inverse([x, y])
