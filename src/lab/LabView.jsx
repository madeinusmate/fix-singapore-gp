import { useMemo, useState } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CircuitMap } from './CircuitMap.jsx'
import { fmtLap, ROWS } from './numbers.js'
import { ribbonFor, tagIndex } from '../sim/ribbon.js'

const NONE = []

const chartOf = (runs) => {
  const rows = {}
  runs.forEach((run) => {
    if (!run.result) return
    run.result.trace.s.forEach((metres, i) => {
      const key = Math.round(metres / 20) * 20
      const row = rows[key] || { s: key / 1000 }
      row[run.id] = run.result.trace.v[i]
      row[`${run.id}_o`] = run.result.trace.vo[i]
      row[`${run.id}_e`] = run.result.trace.elev[i]
      rows[key] = row
    })
  })
  return Object.values(rows).sort((a, b) => a.s - b.s)
}

export const LabView = ({
  style,
  graph,
  runs,
  is3d,
  on3d,
  fitKey,
  playing,
  onPlaying,
  overtakeOn,
  onOvertake,
  waypoints,
  skipped,
  onMapClick,
  onWaypointDrag,
  onWaypointRemove,
  issues = NONE,
  focus,
  ghost,
  tools,
  overlay,
  notice,
  actions,
}) => {
  const [sample, setSample] = useState(null)
  const primary = runs[0]
  const buckets = useMemo(() => (graph ? tagIndex(graph) : null), [graph])
  const ribbon = useMemo(() => (buckets ? ribbonFor(graph, primary?.result, buckets) : NONE), [primary?.result, graph, buckets])
  const chart = useMemo(() => chartOf(runs), [runs])
  const shown = runs.filter((run) => run.result)
  const carS = sample?.s
  const features = primary?.result?.features
  return (
    <div className="lab">
      <section className="mapwrap">
        <CircuitMap
          style={style}
          color={primary?.color}
          centerline={features?.centerline}
          paths={primary?.paths}
          grid={features?.grid || primary?.grid}
          xmode={features?.xmode}
          braking={features?.braking}
          turns={features?.turns}
          overtake={features?.overtake}
          ribbon={ribbon}
          issues={issues}
          trace={primary?.result?.trace}
          playing={playing}
          overtakeOn={overtakeOn}
          is3d={is3d}
          fitKey={fitKey}
          onClick={onMapClick}
          waypoints={waypoints}
          skipped={skipped}
          onWaypointDrag={onWaypointDrag}
          onWaypointRemove={onWaypointRemove}
          focus={focus}
          ghost={ghost}
          onSample={(next) => setSample((prev) => (prev && Math.abs(prev.t - next.t) < 0.12 && prev.xm === next.xm ? prev : next))}
        />
        <div className="maptools">
          <span className="seg">
            <button type="button" className={!is3d ? 'on' : ''} onClick={() => on3d(false)}>2D</button>
            <button type="button" className={is3d ? 'on' : ''} onClick={() => on3d(true)}>3D</button>
          </span>
          {tools}
        </div>
        {overlay}
        {primary?.result && (
          <div className="hud">
            <div style={{ '--c': primary.color }}>
              <b>{primary.short}{sample?.xm ? <em className="x"> X-MODE</em> : <em className="z"> Z-MODE</em>}</b>
              <span>{sample ? Math.round(sample.v) : '—'} <small>km/h</small></span>
              <em>{sample ? `${fmtLap(sample.t)} / ${fmtLap(sample.lap)}` : ''}</em>
            </div>
            <button type="button" onClick={() => onPlaying((p) => !p)}>{playing ? '❚❚' : '▶'}</button>
            <button type="button" className={`ot${overtakeOn ? ' on' : ''}`} onClick={() => onOvertake((v) => !v)}>⚡ Overtake {overtakeOn ? 'ON' : 'OFF'}</button>
          </div>
        )}
        <div className="legend">
          <div><i style={{ background: primary?.color || '#e10600' }} />Racing line</div>
          {primary?.paths?.some((part) => part.auto) && <div><i className="auto" style={{ '--c': primary.color }} />Auto route home</div>}
          {waypoints?.length > 0 && <div><i className="wpk" />Your points</div>}
          <div><i className="xm" />X-mode zone</div>
          <div><i className="brk" />Braking zone</div>
          <div><i className="otp" />Overtake activation</div>
          <div><i className="trn">1</i>Turn</div>
          <div><i className="grd" />Starting grid</div>
        </div>
      </section>
      <aside>
        <h2>{primary?.name}</h2>
        {actions}
        {notice}
        {shown.length > 0 && (
          <table>
            <thead>
              <tr>
                <th />
                {shown.map((run) => <th key={run.id} style={{ color: run.color }}>{run.short}</th>)}
              </tr>
            </thead>
            <tbody>
              {ROWS.map(([label, format]) => (
                <tr key={label}>
                  <td>{label}</td>
                  {shown.map((run) => <td key={run.id}>{format(run.result.metrics)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {shown.length > 0 && (
          <>
            <h3>Speed trace (2026 sim){overtakeOn ? ' · dashed = Overtake active' : ''}</h3>
            <div className="chart">
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={chart} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="#2a2a35" />
                  <XAxis dataKey="s" type="number" domain={[0, 'dataMax']} tick={{ fill: '#888', fontSize: 11 }} unit=" km" />
                  <YAxis domain={[0, 340]} tick={{ fill: '#888', fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: '#15151e', border: '1px solid #333' }} labelFormatter={(v) => `${v} km`} formatter={(v) => `${v} km/h`} />
                  {shown.map((run) => <Line key={run.id} dataKey={run.id} name={run.short} stroke={run.color} dot={false} strokeWidth={2} isAnimationActive={false} connectNulls />)}
                  {overtakeOn && shown.map((run) => <Line key={`${run.id}o`} dataKey={`${run.id}_o`} name={`${run.short} Overtake`} stroke={run.color} strokeDasharray="4 3" dot={false} strokeWidth={1.5} isAnimationActive={false} connectNulls />)}
                  {carS != null && <ReferenceLine x={carS / 1000} stroke={primary.color} strokeDasharray="3 3" />}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <h3>Elevation</h3>
            <div className="chart">
              <ResponsiveContainer width="100%" height={140}>
                <ComposedChart data={chart} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="#2a2a35" />
                  <XAxis dataKey="s" type="number" domain={[0, 'dataMax']} tick={{ fill: '#888', fontSize: 11 }} unit=" km" />
                  <YAxis domain={[0, 40]} tick={{ fill: '#888', fontSize: 11 }} unit=" m" />
                  <Tooltip contentStyle={{ background: '#15151e', border: '1px solid #333' }} labelFormatter={(v) => `${v} km`} />
                  {shown.map((run) => <Area key={run.id} dataKey={`${run.id}_e`} name={run.short} stroke={run.color} fill={run.color} fillOpacity={0.15} isAnimationActive={false} connectNulls />)}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
        <div className="note">
          <p><b>About the numbers:</b> lap times and the overtaking index come from a point-mass sim of the 2026 rules. They are good for comparing layouts, not for predicting a race. The index ignores slipstream.</p>
        </div>
      </aside>
    </div>
  )
}
