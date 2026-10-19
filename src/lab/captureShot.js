import * as maplibregl from 'maplibre-gl'
import { shotFrame } from './frameShot.js'
import { SHOT_HEIGHT, SHOT_WIDTH } from '../share/shot.js'

if (typeof window !== 'undefined') {
  maplibregl.setWorkerUrl(new URL('maplibre-gl-worker.mjs', `${window.location.origin}${import.meta.env.BASE_URL}`).href)
}

const PAINT = /^#[0-9a-fA-F]{3,8}$/
const PITCH = 58
const BEARING = -28
const MAX_ZOOM = 16.2
const FRAME_PAD = { top: 56, right: 72, bottom: 56, left: 72 }

const collection = (features) => ({ type: 'FeatureCollection', features })

const loadStyle = async () => {
  const res = await fetch(`${import.meta.env.BASE_URL}data/style-min-dark.json`)
  if (!res.ok) throw new Error('Could not load the map style.')
  return res.json()
}

// A still of the same 3D view the lab shows: pitched city, extruded lap, grid.
export const captureLayoutShot = async ({ color, centerline, grid, ribbon }) => {
  const style = await loadStyle()
  const line = centerline?.length > 1 ? centerline : grid
  if (!line || line.length < 2) throw new Error('This layout has no line to photograph.')
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText = `position:fixed;left:0;top:0;width:${SHOT_WIDTH}px;height:${SHOT_HEIGHT}px;transform:translateX(-120vw);pointer-events:none;`
  document.body.appendChild(host)
  let map
  let settled = false
  try {
    map = new maplibregl.Map({
      container: host,
      style,
      center: line[0],
      zoom: 13,
      bearing: BEARING,
      pitch: PITCH,
      maxPitch: 70,
      interactive: false,
      attributionControl: false,
      maplibreLogo: false,
      fadeDuration: 0,
      canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
    })
    return await new Promise((resolve, reject) => {
      let timer
      const done = (fn, value) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        fn(value)
      }
      timer = setTimeout(() => done(reject, new Error('The 3D view took too long to photograph.')), 10000)
      const shoot = () => {
        try {
          const source = map.getCanvas()
          const shot = document.createElement('canvas')
          shot.width = source.width
          shot.height = source.height
          const ctx = shot.getContext('2d', { willReadFrequently: true })
          ctx.drawImage(source, 0, 0)
          const probe = ctx.getImageData(Math.floor(shot.width / 2), Math.floor(shot.height / 2), 1, 1).data
          if (probe[3] === 0) throw new Error('The 3D view photographed blank.')
          shot.toBlob((blob) => {
            if (!blob) done(reject, new Error('Could not photograph the 3D view.'))
            else done(resolve, blob)
          }, 'image/jpeg', 0.86)
        } catch (error) {
          done(reject, error)
        }
      }
      map.on('error', () => {})
      map.on('load', () => {
        try {
          map.resize()
          map.addLayer({
            id: 'bld3d',
            type: 'fill-extrusion',
            source: 'openmaptiles',
            'source-layer': 'building',
            minzoom: 12,
            paint: {
              'fill-extrusion-color': '#262935',
              'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 10],
              'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
              'fill-extrusion-opacity': 0.35,
            },
          })
          if (map.getLayer('building')) map.setLayoutProperty('building', 'visibility', 'none')
          const paint = PAINT.test(color || '') ? color : '#e10600'
          map.addSource('ribbon', {
            type: 'geojson',
            data: collection((ribbon || []).filter((quad) => quad.ring?.length > 3).map((quad) => ({
              type: 'Feature',
              properties: { h: quad.h },
              geometry: { type: 'Polygon', coordinates: [quad.ring] },
            }))),
          })
          map.addLayer({
            id: 'ribbon',
            type: 'fill-extrusion',
            source: 'ribbon',
            paint: {
              'fill-extrusion-color': paint,
              'fill-extrusion-height': ['get', 'h'],
              'fill-extrusion-base': 0,
              'fill-extrusion-opacity': 0.92,
            },
          })
          map.addSource('grid', {
            type: 'geojson',
            data: collection(grid?.length > 1 ? [{
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates: grid },
            }] : []),
          })
          map.addLayer({
            id: 'grid',
            type: 'line',
            source: 'grid',
            paint: { 'line-color': '#ffffff', 'line-width': 3, 'line-dasharray': [2.5, 1.5] },
          })
          const bounds = new maplibregl.LngLatBounds()
          line.forEach((point) => bounds.extend(point))
          const camera = map.cameraForBounds(bounds, {
            padding: FRAME_PAD,
            pitch: PITCH,
            bearing: BEARING,
            maxZoom: MAX_ZOOM,
          })
          if (camera) map.jumpTo({ ...camera, pitch: PITCH, bearing: BEARING })
          // fitBounds at this pitch leaves the lap small and high: the near
          // ground is magnified, so the zoom backs off and the circuit sits
          // toward the horizon. Measure the lap on screen and correct.
          const width = map.getContainer().clientWidth || SHOT_WIDTH
          const height = map.getContainer().clientHeight || SHOT_HEIGHT
          for (let step = 0; step < 8; step += 1) {
            const frame = shotFrame(line.map((point) => map.project(point)), {
              width,
              height,
              padding: FRAME_PAD,
            })
            if (!frame) break
            const zoomDelta = Math.log2(frame.scale)
            const atLimit = map.getZoom() >= MAX_ZOOM - 0.02 && zoomDelta > 0
            if (Math.abs(frame.shiftX) < 2 && Math.abs(frame.shiftY) < 2 && (Math.abs(zoomDelta) < 0.02 || atLimit)) break
            const center = map.project(map.getCenter())
            const applied = Math.max(-1.25, Math.min(zoomDelta, MAX_ZOOM - map.getZoom()))
            map.jumpTo({
              center: map.unproject([center.x + frame.shiftX, center.y + frame.shiftY]),
              zoom: map.getZoom() + applied * (Math.abs(applied) > 0.45 ? 0.7 : 1),
              pitch: PITCH,
              bearing: BEARING,
            })
          }
          map.once('idle', () => {
            requestAnimationFrame(() => requestAnimationFrame(shoot))
          })
        } catch (error) {
          done(reject, error)
        }
      })
    })
  } finally {
    try { map?.remove() } catch { /* The map can throw if it never finished starting. */ }
    host.remove()
  }
}
