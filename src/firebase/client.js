import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { useEffect, useState } from 'react'

const env = import.meta.env
export const firebaseConfigured = Boolean(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_APP_ID)

const projectId = env.VITE_FIREBASE_PROJECT_ID
const authDomain = env.VITE_FIREBASE_AUTH_DOMAIN
  || (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
    ? window.location.hostname
    : projectId ? `${projectId}.firebaseapp.com` : undefined)

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

export const signIn = () => signInWithPopup(auth, new GoogleAuthProvider())
export const signOutUser = () => signOut(auth)

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
