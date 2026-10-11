import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react'
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { firebaseConfigured, signIn, signOutUser, useAuth } from './firebase/client.js'
import { Create } from './routes/Create.jsx'
import { Home } from './routes/Home.jsx'
import { LayoutPage } from './routes/LayoutPage.jsx'
import { NotFound } from './routes/NotFound.jsx'

const DrivePage = lazy(() => import('./routes/DrivePage.jsx').then((module) => ({ default: module.DrivePage })))

const HashRedirect = () => {
  const navigate = useNavigate()
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1))
    const view = params.get('view')
    if (!view) return
    if (view === 'current') navigate(`/l/current${params.get('mode') === '3d' ? '?mode=3d' : ''}`, { replace: true })
    else navigate('/', { replace: true })
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
  if (!user) return <button type="button" onClick={() => signIn().catch(() => {})}>Sign in</button>

  const name = user.displayName || 'Account'
  const closeAndSignOut = () => {
    setOpen(false)
    signOutUser()
  }

  return (
    <>
      <button type="button" className="account-wide" onClick={() => signOutUser()}>{name} · Sign out</button>
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
    </>
  )
}

const App = () => (
  <div className="app">
    <HashRedirect />
    <header>
      <Link to="/" className="brand"><span className="flag" /> <b>FIX SINGAPORE GP</b></Link>
      <nav>
        <Link to="/create" className="cta">Draw a layout</Link>
        <Account />
      </nav>
    </header>
    <div className="stage">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/l/:id" element={<LayoutPage />} />
        <Route path="/l/:id/drive" element={<Suspense fallback={<p className="loading">Warming the tyres…</p>}><DrivePage /></Suspense>} />
        <Route path="/create" element={<Create />} />
        <Route path="/index.html" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  </div>
)

export default App
