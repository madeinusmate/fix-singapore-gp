import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { SignInProvider } from './auth/SignInPrompt.jsx'
import { RheoRoot } from './rheo/RheoRoot.jsx'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RheoRoot>
      <BrowserRouter>
        <SignInProvider>
          <App />
        </SignInProvider>
      </BrowserRouter>
    </RheoRoot>
  </StrictMode>,
)
