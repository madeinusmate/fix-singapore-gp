export const fmtLap = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`

export const ROWS = [
  ['Length (smoothed)', (m) => `${m.length_km.toFixed(3)} km`],
  ['Corners', (m) => m.corners],
  ['Slow 90° corners', (m) => m.slow90],
  ['Longest straight', (m) => `${m.longest_straight_m} m`],
  ['Heavy braking zones', (m) => m.heavy_braking_zones],
  ['X-mode (low-drag) total', (m) => `${m.xmode_total_m} m`],
  ['Lap (sim est.)', (m) => `${m.lap_s.toFixed(2)} s`],
  ['Lap with Overtake (sim)', (m) => `${m.lap_overtake_s.toFixed(2)} s`],
  ['Top speed (sim)', (m) => `${m.top_kmh} km/h`],
  ['Energy deployed / lap', (m) => `${m.energy_deployed_MJ} MJ`],
  ['Clipping above (sim)', (m) => (m.clip_speed_kmh ? `${m.clip_speed_kmh} km/h` : '—')],
  ['2026 overtaking index', (m) => m.overtaking_score_2026.toFixed(2)],
]

export const senseLabel = (sense) => (sense === 'cw' ? 'Clockwise' : 'Anticlockwise')

export const PALETTE = ['#00d2be', '#ffb800', '#60a5fa', '#f97316', '#c084fc', '#4ade80', '#fb7185', '#38bdf8']

export const pickColor = () => PALETTE[Math.floor(Math.random() * PALETTE.length)]
