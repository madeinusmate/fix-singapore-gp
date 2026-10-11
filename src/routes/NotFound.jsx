import { Link } from 'react-router-dom'

export const NotFound = () => (
  <div className="missing">
    <h1>Wrong turn. This page is not on the circuit.</h1>
    <Link to="/">Back to the leaderboard</Link>
  </div>
)
