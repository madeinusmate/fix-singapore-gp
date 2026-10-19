import { Link } from 'react-router-dom'
import { CIRCUITS } from '../circuits.js'
import { SiteFooter } from '../SiteFooter.jsx'

const facts = (circuit) => (
  circuit.open ? `${circuit.laps} laps` : `${circuit.lengthKm.toFixed(3)} km · ${circuit.laps} laps`
)

export const Circuits = () => (
  <div className="hub">
    <p className="kicker">Formula 1 street circuits</p>
    <h1>Every street circuit has a passing problem. <em>Fix it.</em></h1>
    <p className="lede">
      Six grands prix close the streets. Keep the start, redraw the lap, and see if cars can race.
    </p>
    <ul className="circuit-grid">
      {CIRCUITS.map((circuit) => (
        <li key={circuit.slug}>
          <Link to={`/${circuit.slug}`} className={circuit.open ? 'circuit-card open' : 'circuit-card'}>
            <span className="status">{circuit.open ? 'Open' : 'Next'}</span>
            <b>{circuit.circuit}</b>
            <span className="where">{circuit.gp} · {circuit.city}</span>
            <span className="meta">{facts(circuit)}</span>
            <p>{circuit.problem}</p>
            <span className="go-line">{circuit.open ? 'Draw a lap' : 'Read the brief'}</span>
          </Link>
        </li>
      ))}
    </ul>
    <p className="fineprint">
      Not affiliated with Formula 1, the FIA, or any Grand Prix promoter.
    </p>
    <SiteFooter />
  </div>
)
