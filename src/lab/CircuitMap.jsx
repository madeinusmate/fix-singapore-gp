import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import './map.css'
import { sampleAtTime, timeAtDistance } from './traceCursor.js'

maplibregl.setWorkerUrl(new URL('maplibre-gl-worker.mjs', `${window.location.origin}${import.meta.env.BASE_URL}`).href)

const fc = (features) => ({ type: 'FeatureCollection', features })
const line = (coordinates, properties = {}) => (coordinates?.length > 1
  ? { type: 'Feature', properties, geometry: { type: 'LineString', coordinates } }
  : null)

const bearingDeg = (a, b) => {
  const φ1 = (a[1] * Math.PI) / 180
  const φ2 = (b[1] * Math.PI) / 180
  const λ = ((b[0] - a[0]) * Math.PI) / 180
  const y = Math.sin(λ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ)
  return (Math.atan2(y, x) * 180) / Math.PI
}

const NONE = []
const DESKTOP_PAD = { top: 72, bottom: 108, left: 24, right: 56 }
const HERO_PAD = { top: 120, bottom: 50, left: 20, right: 70 }
const MOBILE_PAD = { top: 96, bottom: 72, left: 12, right: 12 }
// Main island plus a thin strip of water. MapLibre refuses to zoom out past
// this box, so the furthest view is Singapore rather than the region around it.
const SINGAPORE_BOUNDS = [[103.55, 1.17], [104.10, 1.48]]
const MIN_ZOOM = 11

// A circuit's own box is only a few kilometres. Widen it so the map can still
// zoom out to the surrounding city without MapLibre fighting the viewport.
const roomy = (box) => {
  const [[west, south], [east, north]] = box
  const cx = (west + east) / 2
  const cy = (south + north) / 2
  const halfX = Math.max((east - west) / 2, 0.12)
  const halfY = Math.max((north - south) / 2, 0.08)
  return [[cx - halfX, cy - halfY], [cx + halfX, cy + halfY]]
}

const fitPadding = (mapEl) => {
  if (mapEl?.parentElement?.querySelector('.maptools, .hud')) return chromePadding(mapEl)
  return window.innerWidth >= 900 ? DESKTOP_PAD : HERO_PAD
}

const chromePadding = (mapEl) => {
  const root = mapEl?.parentElement
  if (!root) return window.innerWidth >= 900 ? DESKTOP_PAD : MOBILE_PAD
  const rootRect = root.getBoundingClientRect()
  const occupied = (selector, edge) => {
    const node = root.querySelector(selector)
    if (!node) return 0
    const rect = node.getBoundingClientRect()
    if (rect.height < 1 || rect.width < 1) return 0
    if (edge === 'top') return Math.max(0, rect.bottom - rootRect.top)
    return Math.max(0, rootRect.bottom - rect.top)
  }
  const desktop = window.innerWidth >= 900
  const top = Math.max(occupied('.maptools', 'top'), occupied('.maplibregl-ctrl-top-right', 'top'))
  const bottom = Math.max(occupied('.hud', 'bottom'), occupied('.legend', 'bottom'), occupied('.coachbar', 'bottom'))
  return {
    top: Math.min(180, Math.max(56, top + 12)),
    bottom: Math.min(220, Math.max(desktop ? 48 : 28, bottom + 12)),
    left: desktop ? 24 : 12,
    right: desktop ? 56 : 12,
  }
}

export const CircuitMap = ({
  bounds = SINGAPORE_BOUNDS,
  center = [103.857, 1.2885],
  style,
  color = '#e10600',
  centerline,
  paths,
  grid,
  xmode = NONE,
  braking = NONE,
  turns = NONE,
  overtake,
  ribbon = NONE,
  issues = NONE,
  trace,
  playing,
  is3d,
  fitKey,
  onClick,
  waypoints = NONE,
  skipped = NONE,
  onWaypointDrag,
  onWaypointRemove,
  onSample,
  seekRef,
  ghost,
  focus,
  network,
  spin = false,
}) => {
  const el = useRef(null)
  const map = useRef(null)
  const markers = useRef([])
  const drag = useRef(onWaypointDrag)
  const remove = useRef(onWaypointRemove)
  const sample = useRef(onSample)
  const clock = useRef(0)
  const appliedSeek = useRef(null)
  const anchor = useRef({ s: 0 })
  const playingRef = useRef(playing)
  const colorRef = useRef(color)
  const seekBox = useRef(seekRef)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    drag.current = onWaypointDrag
    remove.current = onWaypointRemove
    sample.current = onSample
    playingRef.current = playing
    colorRef.current = color
    seekBox.current = seekRef
  })

  useEffect(() => {
    if (!style || !el.current || map.current) return undefined
    const m = new maplibregl.Map({
      container: el.current,
      style,
      center,
      zoom: 14.2,
      minZoom: MIN_ZOOM,
      maxBounds: roomy(bounds),
      attributionControl: false,
      maxPitch: 70,
    })
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
    m.addControl(new maplibregl.AttributionControl({ compact: true }), 'top-right')
    // MapLibre expands the compact credit as soon as the map is wide enough.
    // Keep the info button closed until the user opens it.
    let creditsOpen = false
    const collapseCredits = () => {
      if (creditsOpen) return
      const node = m.getContainer().querySelector('.maplibregl-ctrl-attrib')
      if (!node?.classList.contains('maplibregl-compact-show')) return
      node.classList.remove('maplibregl-compact-show')
      node.setAttribute('open', '')
    }
    collapseCredits()
    m.on('idle', collapseCredits)
    m.on('resize', collapseCredits)
    m.on('sourcedata', collapseCredits)
    m.getContainer().addEventListener('click', (event) => {
      if (event.target.closest?.('.maplibregl-ctrl-attrib')) creditsOpen = true
    }, true)
    m.on('load', () => {
      m.addLayer({
        id: 'bld3d', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 13,
        paint: {
          'fill-extrusion-color': '#262935',
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 10],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': 0.35,
        },
        layout: { visibility: 'none' },
      })
      ;['network', 'ribbon', 'center', 'autoleg', 'xmode', 'brake', 'issues', 'ghost', 'grid', 'turns', 'cars', 'gridlabel', 'arrow', 'otpt'].forEach((id) => {
        m.addSource(id, { type: 'geojson', data: fc([]) })
      })
      m.addLayer({ id: 'network', type: 'line', source: 'network', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#5c6478', 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 1, 17, 3], 'line-opacity': 0.75 } })
      m.addLayer({ id: 'xmode', type: 'line', source: 'xmode', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#39ff14', 'line-width': 16, 'line-opacity': 0.28 } })
      m.addLayer({ id: 'center-casing', type: 'line', source: 'center', layout: { 'line-join': 'round' }, paint: { 'line-color': '#000', 'line-width': ['get', 'cw'], 'line-opacity': 0.7 } })
      m.addLayer({ id: 'center', type: 'line', source: 'center', layout: { 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'w'] } })
      m.addLayer({ id: 'autoleg', type: 'line', source: 'autoleg', layout: { 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 4, 'line-dasharray': [1.5, 1.2], 'line-opacity': 0.85 } })
      m.addLayer({ id: 'ribbon', type: 'fill-extrusion', source: 'ribbon', layout: { visibility: 'none' }, paint: { 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.92 } })
      m.addLayer({ id: 'issues', type: 'line', source: 'issues', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#ff4d4d', 'line-width': 9, 'line-dasharray': [1.2, 1], 'line-opacity': 0.95 } })
      m.addLayer({ id: 'ghost-glow', type: 'line', source: 'ghost', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#fff', 'line-width': 14, 'line-blur': 8, 'line-opacity': 0.35 } })
      m.addLayer({ id: 'ghost', type: 'line', source: 'ghost', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#fff', 'line-width': 3.5, 'line-opacity': 0.95 } })
      m.addLayer({ id: 'ghost-label', type: 'symbol', source: 'ghost', layout: { 'symbol-placement': 'line', 'symbol-spacing': 260, 'text-field': 'REAL TRACK', 'text-font': ['Noto Sans Bold'], 'text-size': 10, 'text-offset': [0, -1] }, paint: { 'text-color': '#fff', 'text-halo-color': '#000', 'text-halo-width': 1.5 } })
      m.addLayer({ id: 'brake', type: 'line', source: 'brake', paint: { 'line-color': '#ff1e1e', 'line-width': ['case', ['get', 'heavy'], 9, 6], 'line-opacity': 0.95 } })
      m.addLayer({ id: 'grid', type: 'line', source: 'grid', paint: { 'line-color': '#fff', 'line-width': 4, 'line-dasharray': [2.5, 1.5] } })
      m.addLayer({
        id: 'turns-c', type: 'circle', source: 'turns',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 12.5, 7, 15, 10, 17, 12],
          'circle-color': '#fff',
          'circle-stroke-color': '#000',
          'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 13, 1, 16, 2],
        },
      })
      m.addLayer({
        id: 'turns-t', type: 'symbol', source: 'turns',
        layout: {
          'text-field': ['to-string', ['get', 'turn']],
          'text-font': ['Noto Sans Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 12.5, 8, 15, 11, 17, 12],
          'text-allow-overlap': true,
        },
        paint: { 'text-color': '#000' },
      })
      // Zoomed-out phones fit the whole lap in a few hundred pixels, where the
      // full "OVERTAKE ACTIVATION" label collides with GRID. Shorten it until
      // the user zooms in.
      m.addLayer({
        id: 'otpt', type: 'symbol', source: 'otpt',
        layout: {
          'text-field': ['step', ['zoom'], 'OT', 14.8, 'OVERTAKE ACTIVATION'],
          'text-font': ['Noto Sans Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 13, 9, 16, 11],
          'text-offset': ['step', ['zoom'], ['literal', [0, -1.7]], 14.8, ['literal', [0, -1.4]]],
          'text-max-width': 8,
          'text-allow-overlap': true,
          'text-padding': 1,
        },
        paint: { 'text-color': '#c084fc', 'text-halo-color': '#000', 'text-halo-width': 1.5 },
      })
      m.addLayer({
        id: 'otpt-c', type: 'circle', source: 'otpt',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 5, 16, 6],
          'circle-color': '#c084fc',
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 2,
        },
      })
      m.addLayer({
        id: 'gridlabel', type: 'symbol', source: 'gridlabel',
        layout: {
          'text-field': 'GRID',
          'text-font': ['Noto Sans Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 13, 10, 16, 11],
          // The start straight sits on the right edge of a fitted phone map,
          // so the label has to sit inside the lap or only the G is visible.
          'text-anchor': ['step', ['zoom'], 'right', 14.8, 'left'],
          'text-offset': ['step', ['zoom'], ['literal', [-0.8, 2.6]], 14.8, ['literal', [0.9, 0]]],
          'text-allow-overlap': true,
          'text-padding': 1,
        },
        paint: { 'text-color': '#fff', 'text-halo-color': '#000', 'text-halo-width': 2 },
      })
      m.addLayer({ id: 'arrow', type: 'symbol', source: 'arrow', layout: { 'text-field': '▶', 'text-font': ['Noto Sans Bold'], 'text-size': 18, 'text-rotate': ['get', 'bearing'], 'text-rotation-alignment': 'map', 'text-allow-overlap': true }, paint: { 'text-color': '#fff', 'text-halo-color': '#000', 'text-halo-width': 1.5 } })
      m.addLayer({ id: 'cars', type: 'circle', source: 'cars', paint: { 'circle-radius': 8, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2.5, 'circle-pitch-alignment': 'map' } })
      const pop = new maplibregl.Popup({ closeButton: false, closeOnClick: false })
      m.on('mousemove', 'turns-c', (e) => {
        const p = e.features[0].properties
        const root = document.createElement('div')
        const title = document.createElement('b')
        title.textContent = `T${p.turn}`
        const rest = document.createTextNode(` ${Math.abs(p.angle_deg)}° ${p.angle_deg > 0 ? 'left' : 'right'} · r≈${p.min_radius_m} m · ${p.sim_min_speed_kmh} km/h`)
        root.append(title, rest)
        pop.setLngLat(e.lngLat).setDOMContent(root).addTo(m)
      })
      m.on('mouseleave', 'turns-c', () => pop.remove())
      setReady(true)
    })
    map.current = m
    return () => {
      markers.current.forEach((marker) => marker.remove())
      m.remove()
      map.current = null
    }
  }, [style])

  useEffect(() => {
    if (!ready || !onClick) return undefined
    const m = map.current
    const click = (e) => {
      if (e.originalEvent.target.closest('.wp')) return
      const box = [[e.point.x - 6, e.point.y - 6], [e.point.x + 6, e.point.y + 6]]
      const hit = m.queryRenderedFeatures(box, { layers: ['center', 'autoleg'] }).find((feature) => feature.properties.leg != null)
      onClick(e.lngLat, hit ? hit.properties.leg : null)
    }
    m.on('click', click)
    return () => m.off('click', click)
  }, [ready, onClick])

  useEffect(() => {
    if (!ready) return
    const m = map.current
    const drawn = paths?.length ? paths : [{ coords: centerline }]
    m.getSource('center').setData(fc(drawn.filter((part) => !part.auto).map((part) => line(part.coords, { color, w: 5, cw: 10, leg: part.leg })).filter(Boolean)))
    m.getSource('autoleg').setData(fc(drawn.filter((part) => part.auto).map((part) => line(part.coords, { color, leg: part.leg })).filter(Boolean)))
    m.getSource('ghost').setData(ghost?.length > 1 ? fc([line(ghost)]) : fc([]))
    m.getSource('xmode').setData(fc(xmode.filter((coords) => coords.length > 1).map((coords) => line(coords))))
    m.getSource('brake').setData(fc(braking.filter((zone) => zone.line.length > 1).map((zone) => line(zone.line, { heavy: zone.heavy ? 1 : 0 }))))
    m.getSource('issues').setData(fc(issues.filter((coords) => coords.length > 1).map((coords) => line(coords))))
    m.getSource('turns').setData(fc(turns.map((turn) => ({ type: 'Feature', properties: turn, geometry: { type: 'Point', coordinates: turn.at } }))))
    m.getSource('otpt').setData(overtake ? fc([{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: overtake } }]) : fc([]))
    m.getSource('grid').setData(grid?.length > 1 ? fc([line(grid)]) : fc([]))
    const labelAt = grid?.length ? grid[Math.floor(grid.length * 0.55)] : null
    m.getSource('gridlabel').setData(labelAt ? fc([{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: labelAt } }]) : fc([]))
    const arrowAt = grid?.length > 1 ? Math.min(grid.length - 2, Math.floor(grid.length * 0.72)) : -1
    m.getSource('arrow').setData(arrowAt >= 0 ? fc([{
      type: 'Feature',
      properties: { bearing: bearingDeg(grid[arrowAt], grid[arrowAt + 1]) - 90 },
      geometry: { type: 'Point', coordinates: grid[arrowAt] },
    }]) : fc([]))
    m.getSource('ribbon').setData(fc(ribbon.map((quad) => ({
      type: 'Feature',
      properties: { h: quad.h, color },
      geometry: { type: 'Polygon', coordinates: [quad.ring] },
    }))))
    m.setLayoutProperty('bld3d', 'visibility', is3d ? 'visible' : 'none')
    if (m.getLayer('building')) m.setLayoutProperty('building', 'visibility', is3d ? 'none' : 'visible')
    m.setLayoutProperty('ribbon', 'visibility', is3d ? 'visible' : 'none')
    m.setPaintProperty('center', 'line-opacity', is3d ? 0 : 1)
    m.setPaintProperty('center-casing', 'line-opacity', is3d ? 0 : 0.7)
  }, [ready, centerline, paths, grid, xmode, braking, turns, overtake, ribbon, issues, ghost, is3d, color])

  useEffect(() => {
    if (!ready) return
    map.current.getSource('network').setData(network?.length
      ? fc([{ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: network } }])
      : fc([]))
    map.current.setLayoutProperty('network', 'visibility', is3d ? 'none' : 'visible')
  }, [ready, network, is3d])

  useEffect(() => {
    if (!ready || !focus?.coords?.length) return
    const bounds = new maplibregl.LngLatBounds()
    focus.coords.forEach((c) => bounds.extend(c))
    const pad = el.current?.parentElement?.querySelector('.maptools, .hud')
      ? chromePadding(el.current)
      : 120
    map.current.fitBounds(bounds, { padding: pad, maxZoom: 17, duration: 700 })
  }, [ready, focus])

  useEffect(() => {
    if (!ready || !spin || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
    const m = map.current
    let frame
    let last = performance.now()
    let stopped = false
    const stop = () => { stopped = true }
    const events = ['mousedown', 'touchstart', 'wheel']
    events.forEach((name) => m.on(name, stop))
    const tick = (now) => {
      if (stopped) return
      m.setBearing(m.getBearing() + ((now - last) / 1000) * 3)
      last = now
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      events.forEach((name) => m.off(name, stop))
    }
  }, [ready, spin, fitKey])

  useEffect(() => {
    if (!ready || !el.current) return undefined
    const observer = new ResizeObserver(() => map.current?.resize())
    observer.observe(el.current)
    return () => observer.disconnect()
  }, [ready])

  const fitted = useRef('')
  useEffect(() => {
    if (!ready) return undefined
    const m = map.current
    // While drawing, the camera is the user's: fit once on open and on 2D/3D
    // changes, never because the lap grew.
    const drawing = Boolean(paths)
    const fitCoords = drawing
      ? paths.flatMap((part) => part.coords)
      : centerline?.length ? centerline : (grid || [])
    const token = drawing ? `${fitKey}:${is3d}` : `${fitKey}:${is3d}:${fitCoords.length > 40 ? 'lap' : 'short'}`
    if (fitted.current === token) return undefined
    if (drawing && fitCoords.length < 2) {
      fitted.current = token
      m.easeTo({ pitch: is3d ? 58 : 0, bearing: is3d ? -28 : 0, duration: 300 })
      return undefined
    }
    if (fitCoords.length < 2) return undefined
    fitted.current = token
    const bounds = new maplibregl.LngLatBounds()
    fitCoords.forEach((c) => bounds.extend(c))
    const fit = () => {
      m.resize()
      m.fitBounds(bounds, {
        padding: fitPadding(el.current),
        pitch: 0,
        bearing: is3d ? -28 : 0,
        maxZoom: 15.5,
        duration: 0,
      })
      if (is3d) m.setPitch(58)
    }
    fit()
    const timer = setTimeout(fit, 300)
    return () => clearTimeout(timer)
  }, [ready, fitKey, is3d, centerline, paths, grid])

  useEffect(() => {
    if (!ready) return undefined
    markers.current.forEach((marker) => marker.remove())
    markers.current = waypoints.map((lnglat, index) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = skipped.includes(index) ? 'wp off' : 'wp'
      button.textContent = String(index + 1)
      button.title = `Point ${index + 1}: drag to move, double-click to remove`
      const removeThis = (e) => {
        e.preventDefault()
        e.stopPropagation()
        remove.current?.(index)
      }
      button.addEventListener('dblclick', removeThis)
      button.addEventListener('contextmenu', removeThis)
      const marker = new maplibregl.Marker({ element: button, draggable: true }).setLngLat(lnglat).addTo(map.current)
      marker.on('dragend', () => drag.current?.(index, marker.getLngLat()))
      return marker
    })
    return undefined
  }, [ready, waypoints, skipped])

  useEffect(() => {
    if (!ready || !trace?.to?.length) return undefined
    clock.current = 0
    appliedSeek.current = null
    anchor.current = { s: 0 }
    let frame
    let last = performance.now()
    const tick = (now) => {
      const dt = (now - last) / 1000
      last = now
      const request = seekBox.current?.current
      if (request && request.n !== appliedSeek.current) {
        clock.current = timeAtDistance(trace, request.s)
        appliedSeek.current = request.n
        anchor.current = { s: request.s }
      } else if (playingRef.current) {
        clock.current += dt
      }
      const placed = sampleAtTime(trace, clock.current)
      anchor.current.s = placed.s
      map.current.getSource('cars')?.setData(fc([{
        type: 'Feature',
        properties: { color: colorRef.current },
        geometry: { type: 'Point', coordinates: [placed.lng, placed.lat] },
      }]))
      sample.current?.({
        v: placed.v,
        t: placed.t,
        lap: placed.lap,
        xm: placed.xm,
        s: placed.s,
        seek: appliedSeek.current || 0,
      })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [ready, trace])

  return <div ref={el} className="map" />
}
