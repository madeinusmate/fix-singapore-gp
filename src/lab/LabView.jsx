import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CircuitMap } from './CircuitMap.jsx'
import { fmtLap, ROWS } from './numbers.js'
import { ribbonFor, tagIndex } from '../sim/ribbon.js'
import { sampleAtTime, timeAtDistance } from './traceCursor.js'

const NONE = []
const tipStyle = { backgroundColor: '#15151e', border: '1px solid #333', color: '#eee' }
const tipLabel = { color: '#eee' }
const Y_AXIS_WIDTH = 60
const CHART_MARGIN = { top: 5, right: 8, left: -18, bottom: 0 }
const PLOT_LEFT = Y_AXIS_WIDTH + CHART_MARGIN.left
const PLOT_RIGHT = CHART_MARGIN.right

const LapTimeline = ({ max, value, color, now, total, onScrub, onScrubStart, onScrubEnd }) => {
  const track = useRef(null)
  if (!(max > 0)) return null
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  const metresAt = (clientX) => {
    const rect = track.current.getBoundingClientRect()
    if (rect.width <= 0) return 0
    const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return fraction * max
  }
  const nudge = (event) => {
    const key = event.key
    const forward = key === 'ArrowRight' || key === 'ArrowUp'
    const back = key === 'ArrowLeft' || key === 'ArrowDown'
    if (!forward && !back && key !== 'Home' && key !== 'End') return
    event.preventDefault()
    onScrubStart()
    if (key === 'Home') onScrub(0)
    else if (key === 'End') onScrub(max)
    else {
      const step = Math.max(5, max / (event.shiftKey ? 20 : 200))
      onScrub(Math.min(max, Math.max(0, value + (forward ? step : -step))))
    }
  }
  return (
    <div className="lapline" style={{ marginLeft: PLOT_LEFT, marginRight: PLOT_RIGHT, '--c': color, '--p': `${pct}%` }}>
      <div
        ref={track}
        className="lapline-track"
        role="slider"
        tabIndex={0}
        aria-label="Lap timeline. Drag to move the car."
        aria-valuemin={0}
        aria-valuemax={Math.round(max)}
        aria-valuenow={Math.round(value)}
        aria-valuetext={`${now} of ${total}`}
        title="Drag to move the car"
        onPointerDown={(event) => {
          event.preventDefault()
          event.currentTarget.focus()
          event.currentTarget.setPointerCapture(event.pointerId)
          onScrubStart()
          onScrub(metresAt(event.clientX))
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
          onScrub(metresAt(event.clientX))
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) onScrub(metresAt(event.clientX))
          onScrubEnd()
        }}
        onPointerCancel={onScrubEnd}
        onKeyDown={nudge}
        onKeyUp={onScrubEnd}
        onBlur={onScrubEnd}
      >
        <i />
      </div>
      <div className="lapline-times">
        <b>{now}</b>
        <span>{total}</span>
      </div>
    </div>
  )
}

const chartOf = (runs) => {
  const rows = {}
  runs.forEach((run) => {
    if (!run.result) return
    run.result.trace.s.forEach((metres, i) => {
      const key = Math.round(metres / 20) * 20
      const row = rows[key] || { s: key / 1000 }
      row[run.id] = run.result.trace.vo[i]
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
  waypoints,
  skipped,
  onMapClick,
  onWaypointDrag,
  onWaypointRemove,
  issues = NONE,
  focus,
  ghost,
  network,
  tools,
  overlay,
  notice,
  actions,
}) => {
  const [sample, setSample] = useState(null)
  const seekRef = useRef(null)
  const seekSeen = useRef(0)
  const scrubbing = useRef(false)
  const resumePlay = useRef(false)
  const primary = runs[0]
  const trace = primary?.result?.trace
  useLayoutEffect(() => {
    seekRef.current = null
    seekSeen.current = 0
  }, [trace])
  const buckets = useMemo(() => (graph ? tagIndex(graph) : null), [graph])
  const ribbon = useMemo(() => (buckets ? ribbonFor(graph, primary?.result, buckets) : NONE), [primary?.result, graph, buckets])
  const chart = useMemo(() => chartOf(runs), [runs])
  const shown = runs.filter((run) => run.result)
  const carS = sample?.s
  const axisM = Math.max((chart.at(-1)?.s || 0) * 1000, trace?.s?.at(-1) || 0)
  const atS = Math.min(axisM, Math.max(0, carS || 0))
  const beginScrub = () => {
    if (scrubbing.current) return
    scrubbing.current = true
    resumePlay.current = playing
    if (playing) onPlaying(false)
  }
  const endScrub = () => {
    if (!scrubbing.current) return
    scrubbing.current = false
    const resume = resumePlay.current
    resumePlay.current = false
    if (resume) onPlaying(true)
  }
  const moveCar = (metres) => {
    if (!trace?.s?.length) return
    const s = Math.min(Math.max(0, metres), trace.s[trace.s.length - 1])
    const n = (seekRef.current?.n || 0) + 1
    seekRef.current = { n, s }
    seekSeen.current = n
    setSample({ ...sampleAtTime(trace, timeAtDistance(trace, s)), seek: n })
  }
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
          is3d={is3d}
          fitKey={fitKey}
          onClick={onMapClick}
          waypoints={waypoints}
          skipped={skipped}
          onWaypointDrag={onWaypointDrag}
          onWaypointRemove={onWaypointRemove}
          focus={focus}
          ghost={ghost}
          network={network}
          seekRef={seekRef}
          onSample={(next) => {
            if ((next.seek || 0) < seekSeen.current) return
            seekSeen.current = next.seek || 0
            setSample((prev) => (prev && prev.seek === next.seek && Math.abs(prev.t - next.t) < 0.05 && prev.xm === next.xm ? prev : next))
          }}
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
            <div className="hud-read" style={{ '--c': primary.color }}>
              <b>
                <span className="hud-name">{primary.short}</span>
                {sample?.xm
                  ? <em className="x"><span className="mode-long"> X-MODE</span><span className="mode-short"> X</span></em>
                  : <em className="z"><span className="mode-long"> Z-MODE</span><span className="mode-short"> Z</span></em>}
              </b>
              <span>{sample ? Math.round(sample.v) : '—'} <small>km/h</small></span>
              <em className="laptime">{sample ? `${fmtLap(sample.t)} / ${fmtLap(sample.lap)}` : ''}</em>
            </div>
            <button type="button" onClick={() => onPlaying((p) => !p)} aria-label={playing ? 'Pause the lap' : 'Play the lap'}>{playing ? '❚❚' : '▶'}</button>
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
            <h3>Speed trace</h3>
            <div className="chart">
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={chart} margin={CHART_MARGIN}>
                  <CartesianGrid stroke="#2a2a35" />
                  <XAxis dataKey="s" type="number" domain={[0, 'dataMax']} tick={{ fill: '#888', fontSize: 11 }} unit=" km" />
                  <YAxis width={Y_AXIS_WIDTH} domain={[0, 340]} tick={{ fill: '#888', fontSize: 11 }} />
                  <Tooltip contentStyle={tipStyle} labelStyle={tipLabel} labelFormatter={(v) => `${v} km`} formatter={(v) => `${v} km/h`} />
                  {shown.map((run) => <Line key={run.id} dataKey={run.id} name={run.short} stroke={run.color} dot={false} strokeWidth={2} isAnimationActive={false} connectNulls />)}
                  {carS != null && <ReferenceLine x={carS / 1000} stroke={primary.color} strokeDasharray="3 3" />}
                </LineChart>
              </ResponsiveContainer>
              <LapTimeline
                max={axisM}
                value={atS}
                color={primary?.color || '#e10600'}
                now={fmtLap(sample?.t || 0)}
                total={fmtLap(sample?.lap || trace?.lapo || 0)}
                onScrub={moveCar}
                onScrubStart={beginScrub}
                onScrubEnd={endScrub}
              />
            </div>
            <h3>Elevation</h3>
            <div className="chart">
              <ResponsiveContainer width="100%" height={140}>
                <ComposedChart data={chart} margin={CHART_MARGIN}>
                  <CartesianGrid stroke="#2a2a35" />
                  <XAxis dataKey="s" type="number" domain={[0, 'dataMax']} tick={{ fill: '#888', fontSize: 11 }} unit=" km" />
                  <YAxis width={Y_AXIS_WIDTH} domain={[0, 40]} tick={{ fill: '#888', fontSize: 11 }} unit=" m" />
                  <Tooltip contentStyle={tipStyle} labelStyle={tipLabel} labelFormatter={(v) => `${v} km`} />
                  {shown.map((run) => <Area key={run.id} dataKey={`${run.id}_e`} name={run.short} stroke={run.color} fill={run.color} fillOpacity={0.15} isAnimationActive={false} connectNulls />)}
                  {carS != null && <ReferenceLine x={carS / 1000} stroke={primary.color} strokeDasharray="3 3" />}
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
