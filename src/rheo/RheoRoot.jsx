import { useEffect, useMemo } from 'react'
import { RheoProvider } from '@getrheo/react'
import { useAuth } from '../firebase/client.js'
import { linkSignedInAccount } from './account.js'
import { rheoConfig } from './config.js'

const RheoAccount = () => {
  const user = useAuth()

  useEffect(() => {
    if (!user) return undefined
    let live = true
    // The provider registers analytics in its own effect, which runs after this one.
    queueMicrotask(() => {
      if (!live) return
      linkSignedInAccount(user).catch((error) => {
        console.error('Rheo identify failed', error)
      })
    })
    return () => { live = false }
  }, [user])

  return null
}

export const RheoRoot = ({ children }) => {
  const config = useMemo(() => rheoConfig(), [])
  if (!config.publishableKey) return children
  return (
    <RheoProvider config={config}>
      <RheoAccount />
      {children}
    </RheoProvider>
  )
}
