import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { linkSignedInAccount, onSignedOut } from '../rheo/account.js'

const env = import.meta.env
export const firebaseConfigured = Boolean(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_APP_ID)

const projectId = env.VITE_FIREBASE_PROJECT_ID

// Google's OAuth client for this project only allows
// https://<projectId>.firebaseapp.com/__/auth/handler. Using the page
// hostname sends https://<site>/__/auth/handler and Google answers
// redirect_uri_mismatch. Set VITE_FIREBASE_AUTH_DOMAIN to the site domain
// only after that exact URI is added on the OAuth client.
export const resolveAuthDomain = (configured, id) => {
  const domain = typeof configured === 'string' ? configured.trim() : ''
  if (domain) return domain
  return id ? `${id}.firebaseapp.com` : undefined
}

const authDomain = resolveAuthDomain(env.VITE_FIREBASE_AUTH_DOMAIN, projectId)

const app = firebaseConfigured ? initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain,
  projectId,
  appId: env.VITE_FIREBASE_APP_ID,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
}) : null

export const auth = app ? getAuth(app) : null
export const db = app ? getFirestore(app) : null

export const signIn = async () => {
  const credential = await signInWithPopup(auth, new GoogleAuthProvider())
  await linkSignedInAccount(credential.user, { trackSignIn: true }).catch(() => {})
  return credential
}

export const signOutUser = () => {
  onSignedOut(auth?.currentUser?.uid)
  return signOut(auth)
}

export const useAuth = () => {
  const [user, setUser] = useState(null)
  useEffect(() => {
    if (!auth) return undefined
    return onAuthStateChanged(auth, setUser)
  }, [])
  return user
}

export const accountName = async (user) => {
  const token = await user.getIdTokenResult()
  return typeof token.claims.name === 'string' ? token.claims.name : null
}
