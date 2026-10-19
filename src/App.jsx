import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useRequestSignIn } from './auth/requestSignIn.js'
import { circuitBySlug } from './circuits.js'
import { firebaseConfigured, signOutUser, useAuth } from './firebase/client.js'
import { CircuitPage } from './routes/CircuitPage.jsx'
import { Circuits } from './routes/Circuits.jsx'
import { Create } from './routes/Create.jsx'
import { Home } from './routes/Home.jsx'
import { LayoutPage } from './routes/LayoutPage.jsx'
import { PrivacyPage, TermsPage } from './routes/Legal.jsx'
import { NotFound } from './routes/NotFound.jsx'
import { SiteMusic } from './SiteMusic.jsx'
import { metaForPath } from './seo.js'
import { usePageMeta } from './usePageMeta.js'

const DrivePage = lazy(() => import('./routes/DrivePage.jsx').then((module) => ({ default: module.DrivePage })))

const HashRedirect = () => {
  const navigate = useNavigate()
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1))
    const view = params.get('view')
    if (!view) return
    if (view === 'current') navigate(`/singapore/l/current${params.get('mode') === '3d' ? '?mode=3d' : ''}`, { replace: true })
    else navigate('/singapore', { replace: true })
  }, [navigate])
  return null
}

const initialsFor = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'ME'
  if (parts.length === 1) return parts[0].slice(0, 2).toLocaleUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toLocaleUpperCase()
}

const Account = () => {
  const user = useAuth()
  const requestSignIn = useRequestSignIn()
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const signOutRef = useRef(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return undefined
    const onPointer = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    signOutRef.current?.focus()
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!firebaseConfigured) return null
  if (!user) return <button type="button" onClick={() => requestSignIn().catch(() => {})}>Sign in</button>

  const name = user.displayName || 'Account'
  const closeAndSignOut = () => {
    setOpen(false)
    signOutUser()
  }

  return (
    <div className="account" ref={rootRef}>
      <button
        type="button"
        className={`avatar${open ? ' on' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`${name}, account menu`}
        onClick={() => setOpen((value) => !value)}
      >
        {initialsFor(name)}
      </button>
      {open && (
        <div className="account-menu" id={menuId} role="menu" aria-label="Account">
          <p>{name}</p>
          <button type="button" role="menuitem" ref={signOutRef} onClick={closeAndSignOut}>Sign out</button>
        </div>
      )}
    </div>
  )
}

const RouteMeta = () => {
  const { pathname } = useLocation()
  usePageMeta(metaForPath(pathname))
  return null
}

const Forward = ({ to }) => {
  const { search, hash } = useLocation()
  return <Navigate to={`${to}${search}${hash}`} replace />
}

const ForwardLayout = ({ drive = false }) => {
  const { id } = useParams()
  const { search, hash } = useLocation()
  const path = drive ? `/singapore/l/${id}/drive` : `/singapore/l/${id}`
  return <Navigate to={`${path}${search}${hash}`} replace />
}

const CircuitRoute = () => {
  const { slug } = useParams()
  if (!circuitBySlug(slug) || slug === 'singapore') return <NotFound />
  return <CircuitPage />
}

const Header = () => {
  const { pathname } = useLocation()
  const onSingapore = pathname === '/singapore' || pathname.startsWith('/singapore/')
  return (
    <header>
      <Link to={onSingapore ? '/singapore' : '/'} className="brand">
        <span className="flag" /> <b>{onSingapore ? 'FIX SINGAPORE GP' : 'STREET CIRCUITS'}</b>
      </Link>
      <nav>
        <SiteMusic />
        {onSingapore ? (
          <Link to="/">
            <span className="cta-long">All circuits</span>
            <span className="cta-short">All</span>
          </Link>
        ) : (
          <Link to="/singapore">Singapore</Link>
        )}
        {onSingapore && (
          <Link to="/singapore/create" className="cta" aria-label="Draw a layout">
            <span className="cta-long">Draw a layout</span>
            <span className="cta-short">Draw</span>
          </Link>
        )}
        <Account />
      </nav>
    </header>
  )
}

const App = () => (
  <div className="app">
    <RouteMeta />
    <HashRedirect />
    <Header />
    <div className="stage">
      <Routes>
        <Route path="/" element={<Circuits />} />
        <Route path="/singapore" element={<Home />} />
        <Route path="/singapore/l/:id" element={<LayoutPage />} />
        <Route path="/singapore/l/:id/drive" element={<Suspense fallback={<p className="loading">Warming the tyres…</p>}><DrivePage /></Suspense>} />
        <Route path="/singapore/create" element={<Create />} />
        <Route path="/create" element={<Forward to="/singapore/create" />} />
        <Route path="/l/:id/drive" element={<ForwardLayout drive />} />
        <Route path="/l/:id" element={<ForwardLayout />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/index.html" element={<Navigate to="/" replace />} />
        <Route path="/:slug" element={<CircuitRoute />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  </div>
)

export default App
