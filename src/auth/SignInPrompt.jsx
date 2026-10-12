import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { auth, signIn } from '../firebase/client.js'
import { SignInContext } from './requestSignIn.js'

const dismissed = () => Object.assign(new Error('Sign-in dismissed'), { code: 'auth/popup-closed-by-user' })

const popupMessage = (err) => {
  if (err?.code === 'auth/popup-blocked') return 'Allow pop-ups for this site, then try again.'
  return err?.message || 'Could not sign in.'
}

const SignInDialog = ({ busy, error, onConfirm, onDismiss }) => {
  const titleId = useId()
  const bodyId = useId()
  const dialogRef = useRef(null)

  useEffect(() => {
    const node = dialogRef.current
    const previous = document.activeElement
    node?.focus()
    document.documentElement.classList.add('signin-lock')
    return () => {
      document.documentElement.classList.remove('signin-lock')
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [])

  useEffect(() => {
    const node = dialogRef.current
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (!busy) onDismiss()
        return
      }
      if (event.key !== 'Tab' || !node) return
      const items = [...node.querySelectorAll('button, a[href]')].filter((item) => !item.disabled)
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy, onDismiss])

  return createPortal(
    <div
      className="signin-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onDismiss()
      }}
    >
      <div
        className="signin-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        aria-busy={busy}
        ref={dialogRef}
        tabIndex={-1}
      >
        <button type="button" className="signin-close" onClick={onDismiss} disabled={busy} aria-label="Close">×</button>
        <p className="kicker">Account required</p>
        <h2 id={titleId}>Sign in to publish and vote</h2>
        <p id={bodyId}>An account is required to publish a new layout and to upvote other layouts.</p>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="signin-actions">
          <button type="button" className="go big" onClick={onConfirm} disabled={busy}>
            {busy ? 'Waiting for Google…' : 'Continue with Google'}
          </button>
          <button type="button" className="tool" onClick={onDismiss} disabled={busy}>Not now</button>
        </div>
        <p className="signin-note">
          By creating an account, you agree to receive marketing communications.{' '}
          <Link to="/terms" onClick={(event) => (busy ? event.preventDefault() : onDismiss())}>Terms</Link>
          {' and '}
          <Link to="/privacy" onClick={(event) => (busy ? event.preventDefault() : onDismiss())}>Privacy</Link>.
        </p>
      </div>
    </div>,
    document.body,
  )
}

export const SignInProvider = ({ children }) => {
  const requestRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const finish = useCallback((fn) => {
    const current = requestRef.current
    requestRef.current = null
    setOpen(false)
    setBusy(false)
    setError('')
    if (current) fn(current)
  }, [])

  const requestSignIn = useCallback(() => {
    if (auth?.currentUser) return Promise.resolve({ user: auth.currentUser })
    if (requestRef.current) return requestRef.current.promise
    let resolve
    let reject
    const promise = new Promise((res, rej) => {
      resolve = res
      reject = rej
    })
    requestRef.current = { promise, resolve, reject }
    setError('')
    setBusy(false)
    setOpen(true)
    return promise
  }, [])

  const confirm = async () => {
    setBusy(true)
    setError('')
    try {
      const credential = await signIn()
      finish((current) => current.resolve(credential))
    } catch (err) {
      setBusy(false)
      if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') return
      setError(popupMessage(err))
    }
  }

  const dismiss = useCallback(() => {
    if (requestRef.current && busy) return
    finish((current) => current.reject(dismissed()))
  }, [busy, finish])

  useEffect(() => () => {
    requestRef.current?.reject(dismissed())
    requestRef.current = null
  }, [])

  return (
    <SignInContext.Provider value={requestSignIn}>
      {children}
      {open && (
        <SignInDialog
          busy={busy}
          error={error}
          onConfirm={confirm}
          onDismiss={dismiss}
        />
      )}
    </SignInContext.Provider>
  )
}
