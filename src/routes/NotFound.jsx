import { Link } from 'react-router-dom'

export const NotFound = () => (
  <div className="missing">
    <h1>That page is not on the circuit.</h1>
    <Link to="/">Back to the gallery</Link>
  </div>
)
