import { useEffect, useRef, useState, useMemo } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
maplibregl.setWorkerUrl(new URL('./maplibre-gl-worker.mjs', location.href).href)
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, ReferenceLine, ComposedChart, Area } from 'recharts'

const LAYOUTS = {
  current: { key: 'CURRENT', name: 'Current 2023+ (reconstructed)', short: 'Current', color: '#e10600' },
  redesign_A2: { key: 'DESIGN_A2', name: 'Redesign A2 · Esplanade–Collyer Paperclip', short: 'Redesign A2', color: '#00d2be' },
  redesign_B2: { key: 'DESIGN_B2', name: 'Redesign B2 · Padang + Collyer Hairpin', short: 'Redesign B2', color: '#ffb800' },
}
const V1 = { v1_redesign_A: 'v1 A (Bayfront Paperclip)', v1_redesign_B: 'v1 B (Nicoll + Bayfront Loop)' }
const CLS = {
  river_bridge_ok_current: ['#38bdf8', 'Low river bridge, already used by the circuit (OK)'],
  covered_passage_ok_current: ['#9ca3af', 'Covered passage, already used by the circuit (OK)'],
  low_bridge_verify: ['#fb923c', 'Low bridge, needs checking'],
  raised_expressway_infeasible: ['#ff2bd6', 'Raised / expressway structure (NOT FEASIBLE)'],
  tunnel_infeasible: ['#ff2bd6', 'Tunnel (NOT FEASIBLE)'],
  link: ['#a78bfa', 'Temporary or missing-in-OSM link'],
}
const RATIONALE = {
  current: 'Rebuilt along real OSM streets: Republic Blvd → Raffles Blvd → Nicoll Hwy → Stamford Rd → St Andrew\'s Rd → Connaught Dr → Anderson Bridge → Fullerton hairpin → Esplanade Bridge → Raffles Ave → 2023 straight. 4.818 km routed vs 4.940 km official (−2.5%). Anderson Bridge and the T14 slip are straight-line links (missing or only partly tagged in OSM).',
  redesign_A2: 'At-grade only. After Raffles Blvd and Nicoll Hwy the track drops the Padang loop and runs south on the west carriageway of Esplanade Bridge, Fullerton Rd and Collyer Quay. It turns back through a hairpin at the Marina Blvd junction and returns north on the east carriageway, then takes Raffles Ave to the unchanged final corner. That gives the longest X-mode straights of the feasible layouts and 3 heavy braking zones. The two directions run on adjacent carriageways about 15–30 m apart and need a central barrier. The 54 m hairpin link crosses the junction box.',
  redesign_B2: 'At-grade only. Keeps today\'s Padang loop. At Fullerton the track does not hairpin onto Esplanade Bridge; it continues south on the west carriageway of Fullerton Rd / Collyer Quay, turns across the Collyer Quay median on a temporary hairpin (32 m link), and comes back north on the east carriageway. Closer to today\'s character, but longer (5.53 km), slower and only a small gain over the current overtaking index.',
}
const ROWS = [
  ['Length (smoothed)', m => m.length_km.toFixed(3) + ' km'],
  ['Corners', m => m.corners],
  ['Slow 90° corners', m => m.slow90],
  ['Longest straight', m => m.longest_straight_m + ' m'],
  ['Heavy braking zones', m => m.heavy_braking_zones],
  ['X-mode (low-drag) total', m => m.xmode_total_m + ' m'],
  ['Lap (sim est.)†', m => m.lap_s.toFixed(2) + ' s'],
  ['Lap with Overtake (sim)', m => m.lap_overtake_s.toFixed(2) + ' s'],
  ['Top speed (sim)', m => m.top_kmh + ' km/h'],
  ['Energy deployed / lap', m => m.energy_deployed_MJ + ' MJ'],
  ['Clipping above (sim)', m => m.clip_speed_kmh ? m.clip_speed_kmh + ' km/h' : '—'],
  ['2026 overtaking index*', m => m.overtaking_score_2026.toFixed(2)],
  ['Grade feasibility', m => m.feasible ? '✓ at-grade' : '✗ raised'],
  ['Temporary links', m => m.links_m.join(', ') + ' m'],
]
const getP = () => new URLSearchParams(location.hash.slice(1))
const fmtLap = s => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`
const FC = f => ({ type: 'FeatureCollection', features: f })

export default function App() {
  const [data, setData] = useState(null)
  const [view, setView] = useState(getP().get('view') || 'current')
  const [is3d, setIs3d] = useState(getP().get('mode') === '3d')
  const [ot, setOt] = useState(false)
  const [playing, setPlaying] = useState(true)
  const [carS, setCarS] = useState({})
  const [ready, setReady] = useState(false)
  const mapEl = useRef(null), map = useRef(null), clock = useRef(0)

  useEffect(() => {
    const files = ['current', 'redesign_A2', 'redesign_B2', 'v1_redesign_A', 'v1_redesign_B']
    Promise.all([
      ...files.map(f => fetch(`data/${f}.geojson`).then(r => r.json())),
      ...files.map(f => fetch(`data/${f}_ribbon.geojson`).then(r => r.json())),
      fetch('data/metrics2026.json').then(r => r.json()), fetch('data/traces2026.json').then(r => r.json()), fetch('data/style-min-dark.json').then(r => r.json())])
      .then(a => {
        const geo = {}, rib = {}; files.forEach((f, i) => { geo[f] = a[i]; rib[f] = a[i + 5] })
        setData({ geo, rib, metrics: a[10], traces: a[11], style: a[12] })
      })
    const h = () => { setView(getP().get('view') || 'current'); setIs3d(getP().get('mode') === '3d') }
    window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h)
  }, [])

  useEffect(() => {
    if (!data || map.current || !mapEl.current) return
    const m = new maplibregl.Map({ container: mapEl.current, style: data.style, center: [103.857, 1.2885], zoom: 14.6, attributionControl: false, maxPitch: 70, canvasContextAttributes: { preserveDrawingBuffer: true } })
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
    m.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
    m.on('load', () => {
      m.addLayer({ id: 'bld3d', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 13,
        paint: { 'fill-extrusion-color': '#262935', 'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 10], 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0], 'fill-extrusion-opacity': 0.35 },
        layout: { visibility: 'none' } })
      ;['ribbon', 'center', 'center-casing', 'ghost', 'xmode', 'brake', 'struct', 'grid', 'turns', 'cars', 'gridlabel', 'otpt'].forEach(id => m.addSource(id, { type: 'geojson', data: FC([]) }))
      m.addLayer({ id: 'ghost', type: 'line', source: 'ghost', paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-dasharray': [2, 2], 'line-opacity': 0.7 } })
      m.addLayer({ id: 'xmode', type: 'line', source: 'xmode', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#39ff14', 'line-width': 16, 'line-opacity': 0.28 } })
      m.addLayer({ id: 'center-casing', type: 'line', source: 'center', layout: { 'line-join': 'round' }, paint: { 'line-color': '#000', 'line-width': ['get', 'cw'], 'line-opacity': 0.7 } })
      m.addLayer({ id: 'center', type: 'line', source: 'center', layout: { 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'w'] } })
      m.addLayer({ id: 'ribbon', type: 'fill-extrusion', source: 'ribbon', layout: { visibility: 'none' }, paint: { 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.92 } })
      m.addLayer({ id: 'struct', type: 'line', source: 'struct', paint: { 'line-color': ['get', 'color'], 'line-width': 4, 'line-offset': 7 } })
      m.addLayer({ id: 'brake', type: 'line', source: 'brake', paint: { 'line-color': '#ff1e1e', 'line-width': ['case', ['get', 'heavy'], 9, 6], 'line-opacity': 0.95 } })
      m.addLayer({ id: 'grid', type: 'line', source: 'grid', paint: { 'line-color': '#fff', 'line-width': 4, 'line-dasharray': [2.5, 1.5] } })
      m.addLayer({ id: 'turns-c', type: 'circle', source: 'turns', paint: { 'circle-radius': 10, 'circle-color': '#fff', 'circle-stroke-color': '#000', 'circle-stroke-width': 2 } })
      m.addLayer({ id: 'turns-t', type: 'symbol', source: 'turns', layout: { 'text-field': ['to-string', ['get', 'turn']], 'text-font': ['Noto Sans Bold'], 'text-size': 11, 'text-allow-overlap': true }, paint: { 'text-color': '#000' } })
      m.addLayer({ id: 'otpt', type: 'symbol', source: 'otpt', layout: { 'text-field': 'OVERTAKE ACTIVATION', 'text-font': ['Noto Sans Bold'], 'text-size': 10, 'text-offset': [0, -1.4], 'text-allow-overlap': true }, paint: { 'text-color': '#c084fc', 'text-halo-color': '#000', 'text-halo-width': 1.5 } })
      m.addLayer({ id: 'otpt-c', type: 'circle', source: 'otpt', paint: { 'circle-radius': 6, 'circle-color': '#c084fc', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } })
      m.addLayer({ id: 'gridlabel', type: 'symbol', source: 'gridlabel', layout: { 'text-field': 'GRID · UNCHANGED', 'text-font': ['Noto Sans Bold'], 'text-size': 11, 'text-anchor': 'left', 'text-offset': [0.9, 0], 'text-allow-overlap': true, 'text-ignore-placement': true }, paint: { 'text-color': '#fff', 'text-halo-color': '#000', 'text-halo-width': 2 } })
      m.addLayer({ id: 'cars', type: 'circle', source: 'cars', paint: { 'circle-radius': 8, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2.5, 'circle-pitch-alignment': 'map' } })
      const pop = new maplibregl.Popup({ closeButton: false, closeOnClick: false })
      m.on('mousemove', 'turns-c', e => { const p = e.features[0].properties; pop.setLngLat(e.lngLat).setHTML(`<b>T${p.turn}</b> ${Math.abs(p.angle_deg)}° ${p.angle_deg > 0 ? 'left' : 'right'} · r≈${p.min_radius_m} m · ${p.sim_min_speed_kmh} km/h (sim)`).addTo(m) })
      m.on('mouseleave', 'turns-c', () => pop.remove())
      m.on('mousemove', 'struct', e => { const p = e.features[0].properties; pop.setLngLat(e.lngLat).setHTML(`<b>${p.name}</b><br>${CLS[p.class]?.[1] || p.class} · OSM layer ${p.layer} · ${p.len_m} m`).addTo(m) })
      m.on('mouseleave', 'struct', () => pop.remove())
      setReady(true)
    })
    map.current = m
  }, [data])

  const shown = view === 'overlay' ? Object.keys(LAYOUTS) : [view]

  useEffect(() => {
    if (!ready) return
    const m = map.current, ov = view === 'overlay', g = data.geo
    const pick = (k, kind) => g[k].features.filter(f => f.properties.kind === kind)
    const center = shown.map(k => ({ ...pick(k, 'centerline')[0], properties: { color: LAYOUTS[k].color, w: ov ? 4 : 5, cw: ov ? 7 : 10 } }))
    m.getSource('center').setData(FC(center))
    m.getSource('ribbon').setData(FC(shown.flatMap(k => data.rib[k].features.map(f => ({ ...f, properties: { ...f.properties, color: f.properties.cls === 'at_grade' || f.properties.cls === 'covered_passage_ok_current' ? LAYOUTS[k].color : CLS[f.properties.cls]?.[0] || LAYOUTS[k].color } })))))
    m.getSource('xmode').setData(FC(ov ? [] : pick(view, 'xmode_zone')))
    m.getSource('brake').setData(FC(ov ? [] : pick(view, 'braking_zone')))
    m.getSource('turns').setData(FC(ov ? [] : pick(view, 'turn')))
    m.getSource('otpt').setData(FC(ov ? [] : pick(view, 'overtake_activation')))
    m.getSource('struct').setData(FC((ov ? [...shown, ...Object.keys(V1)] : shown).flatMap(k => pick(k, 'structure').map(f => ({ ...f, properties: { ...f.properties, color: CLS[f.properties.class]?.[0] || '#fff' } })))))
    m.getSource('ghost').setData(FC(ov ? Object.keys(V1).map(k => ({ ...pick(k, 'centerline')[0], properties: { color: '#ff2bd6' } })) : []))
    const grid = pick('current', 'grid_unchanged'); m.getSource('grid').setData(FC(grid)); const gc = grid[0].geometry.coordinates; m.getSource('gridlabel').setData(FC([{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: gc[Math.floor(gc.length * 0.55)] } }]))
    let b = new maplibregl.LngLatBounds()
    center.forEach(f => f.geometry.coordinates.forEach(c => b.extend(c)))
    const mobile = window.innerWidth < 900
    const fit = () => { m.resize(); m.fitBounds(b, { padding: mobile ? { top: 80, bottom: 50, left: 20, right: 110 } : { top: 90, bottom: 230, left: 80, right: 70 }, pitch: is3d ? 58 : 0, bearing: is3d ? -28 : 0, duration: 0 }); if (is3d) m.setZoom(m.getZoom() + 0.8) }
    fit(); setTimeout(fit, 300)
    m.setLayoutProperty('bld3d', 'visibility', is3d ? 'visible' : 'none')
    m.setLayoutProperty('building', 'visibility', is3d ? 'none' : 'visible')
    m.setLayoutProperty('ribbon', 'visibility', is3d ? 'visible' : 'none')
    m.setPaintProperty('center', 'line-opacity', is3d ? 0.0 : 1)
    m.setPaintProperty('center-casing', 'line-opacity', is3d ? 0.0 : 0.7)
  }, [ready, view, is3d])

  useEffect(() => {
    if (!ready) return
    let raf, last = performance.now()
    const tick = now => {
      if (playing) clock.current += (now - last) / 1000
      last = now
      const ss = {}, feats = []
      shown.forEach(k => {
        const tr = data.traces[k], T = ot ? tr.to : tr.t, lap = ot ? tr.lapo : tr.lap, V = ot ? tr.vo : tr.v, t = clock.current % lap
        let lo = 0, hi = T.length - 1
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; T[mid] <= t ? lo = mid : hi = mid }
        const f = (t - T[lo]) / Math.max(1e-6, T[hi] - T[lo]), a = tr.ll[lo], b = tr.ll[hi]
        feats.push({ type: 'Feature', properties: { color: LAYOUTS[k].color }, geometry: { type: 'Point', coordinates: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f] } })
        ss[k] = { s: tr.s[lo], v: V[lo], t, xm: tr.xm[lo], lap }
      })
      map.current.getSource('cars')?.setData(FC(feats))
      setCarS(ss)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [ready, playing, view, ot])

  const chart = useMemo(() => {
    if (!data) return []
    const rows = {}
    shown.forEach(k => { const tr = data.traces[k]; tr.s.forEach((s, i) => { if (i % 2) return; const key = Math.round(s / 20) * 20; const r = (rows[key] ||= { s: key / 1000 }); r[k] = tr.v[i]; r[k + '_o'] = tr.vo[i]; r[k + '_e'] = tr.elev[i]; r[k + '_l'] = tr.layer[i] }) })
    return Object.values(rows).sort((a, b) => a.s - b.s)
  }, [data, view])

  const go = (v, mode) => { location.hash = `view=${v ?? view}&mode=${(mode ?? (is3d ? '3d' : '2d'))}` }
  if (!data) return <div className="loading">Loading Marina Bay…</div>
  const M = data.metrics.layouts
  const cols = view === 'overlay' ? Object.keys(LAYOUTS) : ['current', ...(view !== 'current' ? [view] : [])]
  const A = data.metrics.assumptions
  return (
    <div className="app">
      <header>
        <div className="brand"><span className="flag" /> <b>MARINA BAY</b> <span className="sub">2026-regs overtaking lab</span></div>
        <nav>
          {[['current', 'Current'], ['redesign_A2', 'Redesign A2'], ['redesign_B2', 'Redesign B2'], ['overlay', 'Overlay']].map(([k, l]) =>
            <button key={k} className={view === k ? 'on' : ''} onClick={() => go(k)} style={{ '--c': LAYOUTS[k]?.color || '#fff' }}>{l}</button>)}
          <span className="seg">
            <button className={!is3d ? 'on' : ''} onClick={() => go(null, '2d')}>2D</button>
            <button className={is3d ? 'on' : ''} onClick={() => go(null, '3d')}>3D</button>
          </span>
        </nav>
      </header>
      <main>
        <section className="mapwrap">
          <div ref={mapEl} className="map" />
          <div className="legend">
            {view === 'overlay' ? <>{Object.entries(LAYOUTS).map(([k, l]) => <div key={k}><i style={{ background: l.color }} />{l.short}</div>)}<div><i className="ghost" />v1 designs (superseded)</div></> : <>
              <div><i style={{ background: LAYOUTS[view].color }} />Racing line</div>
              <div><i className="xm" />X-mode / straight-mode zone</div>
              <div><i className="brk" />Braking zone (thick = heavy)</div>
              <div><i className="otp" />Overtake activation (illustrative)</div>
              <div><i className="trn">1</i>Turn number</div></>}
            <div><i className="grd" />Grid · unchanged</div>
            {Object.entries(CLS).filter(([k]) => k !== 'tunnel_infeasible').map(([k, [c, l]]) => <div key={k}><i style={{ background: c }} />{l}</div>)}
          </div>
          <div className="hud">
            {shown.map(k => carS[k] && <div key={k} style={{ '--c': LAYOUTS[k].color }}>
              <b>{LAYOUTS[k].short}{carS[k].xm ? <em className="x"> X-MODE</em> : <em className="z"> Z-MODE</em>}</b><span>{Math.round(carS[k].v)} <small>km/h</small></span><em>{fmtLap(carS[k].t)} / {fmtLap(carS[k].lap)}</em></div>)}
            <button onClick={() => setPlaying(p => !p)}>{playing ? '❚❚' : '▶'}</button>
            <button className={'ot' + (ot ? ' on' : '')} onClick={() => setOt(o => !o)}>⚡ Overtake {ot ? 'ON' : 'OFF'}</button>
          </div>
        </section>
        <aside>
          <h2>{view === 'overlay' ? 'All layouts compared' : LAYOUTS[view].name}</h2>
          <table>
            <thead><tr><th />{cols.map(k => <th key={k} style={{ color: LAYOUTS[k].color }}>{LAYOUTS[k].short}</th>)}</tr></thead>
            <tbody>{ROWS.map(([l, f]) => <tr key={l}><td>{l}</td>{cols.map(k => <td key={k} className={l === 'Grade feasibility' ? (M[LAYOUTS[k].key].feasible ? 'ok' : 'bad') : ''}>{f(M[LAYOUTS[k].key])}</td>)}</tr>)}</tbody>
          </table>
          <h3>Speed trace (2026 sim){ot ? ' · dashed = Overtake active' : ''}</h3>
          <div className="chart">
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chart} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="#2a2a35" />
                <XAxis dataKey="s" type="number" domain={[0, 'dataMax']} tick={{ fill: '#888', fontSize: 11 }} unit=" km" />
                <YAxis domain={[0, 340]} tick={{ fill: '#888', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#15151e', border: '1px solid #333' }} labelFormatter={v => v + ' km'} formatter={v => v + ' km/h'} />
                {shown.map(k => <Line key={k} dataKey={k} name={LAYOUTS[k].short} stroke={LAYOUTS[k].color} dot={false} strokeWidth={2} isAnimationActive={false} connectNulls />)}
                {ot && shown.map(k => <Line key={k + 'o'} dataKey={k + '_o'} name={LAYOUTS[k].short + ' Overtake'} stroke={LAYOUTS[k].color} strokeDasharray="4 3" dot={false} strokeWidth={1.5} isAnimationActive={false} connectNulls />)}
                {shown.map(k => carS[k] && <ReferenceLine key={'r' + k} x={carS[k].s / 1000} stroke={LAYOUTS[k].color} strokeDasharray="3 3" />)}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <h3>Elevation profile and OSM structure level</h3>
          <div className="chart">
            <ResponsiveContainer width="100%" height={160}>
              <ComposedChart data={chart} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="#2a2a35" />
                <XAxis dataKey="s" type="number" domain={[0, 'dataMax']} tick={{ fill: '#888', fontSize: 11 }} unit=" km" />
                <YAxis yAxisId="e" domain={[0, 35]} tick={{ fill: '#888', fontSize: 11 }} unit=" m" />
                <YAxis yAxisId="l" orientation="right" domain={[0, 3]} ticks={[0, 1, 2]} tick={{ fill: '#888', fontSize: 10 }} width={22} />
                <Tooltip contentStyle={{ background: '#15151e', border: '1px solid #333' }} labelFormatter={v => v + ' km'} />
                {shown.map(k => <Line yAxisId="e" key={k + 'e'} dataKey={k + '_e'} name={LAYOUTS[k].short + ' DEM (m)'} stroke={LAYOUTS[k].color} dot={false} strokeWidth={1.5} isAnimationActive={false} connectNulls />)}
                {shown.map(k => <Area yAxisId="l" key={k + 'l'} type="stepAfter" dataKey={k + '_l'} name={LAYOUTS[k].short + ' OSM layer'} stroke="none" fill={LAYOUTS[k].color} fillOpacity={0.18} isAnimationActive={false} />)}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="small">Lines show DEM elevation (Copernicus GLO-90 via Open-Meteo; a surface model, so buildings, trees and bridges add noise and water reads as 0 m). Shading shows the OSM <code>layer</code> tag (0 = ground, 1 = bridge, 2 = above another bridge). Grade checks rely mainly on the OSM tags.</p>
          <h3>Rationale</h3>
          {(view === 'overlay' ? Object.keys(LAYOUTS) : [view]).map(k => <p key={k}><b style={{ color: LAYOUTS[k].color }}>{LAYOUTS[k].short}: </b>{RATIONALE[k]}</p>)}
          <h3>Grade-separation findings</h3>
          <p>The v1 designs (dashed magenta in Overlay) are <b>infeasible</b>. Bayfront Ave runs on <i>Bayfront Bridge</i> (OSM bridge, <code>layer=2</code>, above the ECP structures, 404 m). The Sheares Ave carriageways are part of the <i>Benjamin Sheares Bridge</i> expressway complex (layer 1, continuing straight into ECP motorway/trunk_link bridges, 319 m). Both are dropped. The current layout, A2 and B2 use only at-grade roads, the low Esplanade Bridge already in the circuit, the covered Raffles Blvd passage already in use, and short links.</p>
          <div className="note">
            <p><b>Grid constraint:</b> every layout keeps the existing start/finish straight, grid boxes and pit lane on Republic Blvd by the Pit Building. Changes start after the grid.</p>
            <p><b>2026 rules (no DRS):</b> active aero gives Z-mode (corners, high downforce) and X-mode (low drag on designated straights; modelled on full-throttle straights lasting ≥{A.xmode_min_s} s). Overtake Mode (formerly "manual override") applies when within 1.0 s at the detection line. The attacker keeps 350 kW of MGU-K power up to 337 km/h (zero at 355 km/h) instead of the standard taper, which starts at 290 km/h and reaches zero at 345 km/h. It also gets +0.5 MJ of harvest energy per lap. Sources: FIA 2026 Technical Regs C5.2.8 and C5.2.10; Formula1.com explainers.</p>
            <p>* 2026 overtaking index = Σ over straights &gt;300 m into corners &gt;70° of (metres the Overtake car gains by the braking point ÷ 5 m) × (speed drop ÷ 100 km/h). It is a simple relative index, not a validated model, and ignores slipstream.</p>
            <p>† <b>Lap times are estimates</b> from a point-mass sim. Assumptions: {A.mass_kg} kg, ICE {A.P_ice_kW} kW, MGU-K ≤{A.P_k_max_kW} kW on the FIA speed taper, lateral {A.a_lat_g} g (≈30% less downforce), braking {A.a_brake_g} g, CdA Z/X = {A.CdA_Z}/{A.CdA_X} m², and an {A.harvest_cap_MJ} MJ/lap deployment budget. When over budget, deployment is cut above a speed found by search ("clipping"). Compare layouts by the differences, not the absolute times.</p>
            <p>Geometry: OpenStreetMap (ODbL), routed along street centrelines. Basemap: OpenFreeMap / OpenMapTiles. No checks for run-off, track width or FIA grading.</p>
          </div>
        </aside>
      </main>
    </div>
  )
}
