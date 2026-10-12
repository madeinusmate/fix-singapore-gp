import { identify, setUserId, track } from '@getrheo/react'
import { rheoPublishableKey } from './config.js'
import { logSignedIn, logSignedOut } from './events.js'

const linked = new Set()

const engageConfig = (uid) => ({
  publishableKey: rheoPublishableKey(),
  customUserId: uid,
  platform: 'web',
})

const profileFor = (user) => {
  const email = typeof user.email === 'string' && user.email.includes('@') ? user.email : undefined
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return {
    marketingConsent: 'granted',
    customUserId: user.uid,
    ...(email ? { email } : {}),
    ...(timezone ? { timezone } : {}),
  }
}

// `trackSignIn` is only for a new Google sign-in. A restored session identifies
// so Engage still has the email, and does not send another automation event.
export const linkSignedInAccount = async (user, { trackSignIn = false } = {}) => {
  if (!rheoPublishableKey() || !user?.uid) return
  setUserId(user.uid)
  if (trackSignIn) logSignedIn()
  const config = engageConfig(user.uid)
  if (trackSignIn || !linked.has(user.uid)) {
    await identify(profileFor(user), config)
    linked.add(user.uid)
  }
  if (trackSignIn) await track({ name: 'signed_in', properties: { method: 'google' } }, config)
}

export const onSignedOut = (uid) => {
  if (uid) linked.delete(uid)
  if (!rheoPublishableKey()) return
  logSignedOut()
  setUserId(null)
}

export const resetLinkedAccounts = () => {
  linked.clear()
}
