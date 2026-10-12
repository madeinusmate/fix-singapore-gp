import { Link } from 'react-router-dom'

const REPO = 'https://github.com/madeinusmate/sgp-circuit-redesign'
const STUDIO = 'https://linkedin.com/in/scantu90'

export const SiteFooter = () => (
  <footer className="site-footer">
    <a href={REPO}>GitHub</a>
    <Link to="/terms">Terms</Link>
    <Link to="/privacy">Privacy</Link>
    <a href={STUDIO}>Made by @madeinusmate</a>
  </footer>
)
