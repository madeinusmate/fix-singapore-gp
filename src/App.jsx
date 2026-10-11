import { useEffect } from 'react'
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { firebaseConfigured, signIn, signOutUser, useAuth } from './firebase/client.js'
import { Create } from './routes/Create.jsx'
import { Home } from './routes/Home.jsx'
import { LayoutPage } from './routes/LayoutPage.jsx'
import { NotFound } from './routes/NotFound.jsx'

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

const Account = () => {
  const user = useAuth()
  if (!firebaseConfigured) return null
  if (!user) return <button type="button" onClick={() => signIn().catch(() => {})}>Sign in</button>
  return <button type="button" onClick={() => signOutUser()}>{user.displayName || 'Account'} · Sign out</button>
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
        <Route path="/create" element={<Create />} />
        <Route path="/index.html" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  </div>
)

export default App
