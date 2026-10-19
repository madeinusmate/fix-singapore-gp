import { Link, useParams } from 'react-router-dom'
import { circuitBySlug } from '../circuits.js'
import { SiteFooter } from '../SiteFooter.jsx'
import { NotFound } from './NotFound.jsx'

export const CircuitPage = () => {
  const { slug } = useParams()
  const circuit = circuitBySlug(slug)
  if (!circuit || circuit.open) return <NotFound />

  return (
    <article className="circuit">
      <p className="kicker">{circuit.gp}</p>
      <h1>{circuit.headline} <em>{circuit.accent}</em></h1>
      <p className="lede">{circuit.detail}</p>
      <dl className="circuit-facts">
        <div>
          <dt>Circuit</dt>
          <dd>{circuit.circuit}</dd>
        </div>
        <div>
          <dt>Length</dt>
          <dd>{circuit.lengthKm.toFixed(3)} km</dd>
        </div>
        <div>
          <dt>Laps</dt>
          <dd>{circuit.laps}</dd>
        </div>
        <div>
          <dt>Corners</dt>
          <dd>{circuit.corners}</dd>
        </div>
      </dl>
      <div className="benchmark">
        <div>
          <span>Status</span>
          <b>Next</b>
          <small>streets not mapped</small>
        </div>
        <p>
          The lap editor, the 2026 sim, and the leaderboard run on Marina Bay today.
          This circuit gets the same treatment once its streets are on the map. The start stays where the race starts.
        </p>
      </div>
      <div className="ctas">
        <Link to="/singapore" className="go big">Open Singapore</Link>
        <Link to="/" className="tool big">All circuits</Link>
      </div>
      <p className="fineprint">
        Length, laps, and corners are the published race figures, not a lap-sim result.
        Not affiliated with Formula 1 or the {circuit.gp}.
      </p>
      <SiteFooter />
    </article>
  )
}
