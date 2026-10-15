import { Link } from 'react-router-dom'

const REPO = 'https://github.com/madeinusmate/sgp-circuit-redesign'
const STUDIO = 'https://linkedin.com/in/scantu90'
const PRODUCT_HUNT = 'https://www.producthunt.com/products/fix-singapore-gp?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-fix-singapore-gp'

export const SiteFooter = () => (
  <footer className="site-footer">
    <a className="ph-badge" href={PRODUCT_HUNT} target="_blank" rel="noopener noreferrer">
      <img
        alt="Fix Singapore GP - Redesign the Singapore GP. Analyse it. Drive it in 3D. | Product Hunt"
        width="250"
        height="54"
        src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1277599&theme=dark&t=1792047511187"
      />
    </a>
    <a href={REPO}>GitHub</a>
    <Link to="/terms">Terms</Link>
    <Link to="/privacy">Privacy</Link>
    <a href={STUDIO}>Made by @madeinusmate</a>
  </footer>
)
