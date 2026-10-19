import { identify, setUserId, track } from '@getrheo/react'
import { isLayoutShotUrl } from '../share/shot.js'
import { rheoPublishableKey } from './config.js'
import { logSignedIn, logSignedOut } from './events.js'

const linked = new Set()

const engageConfig = (uid) => ({
  publishableKey: rheoPublishableKey(),
  customUserId: uid,
  platform: 'web',
})

const emailValue = (value) => (typeof value === 'string' && value.includes('@') ? value : undefined)

const clip = (value, max) => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.slice(0, max)
}

const claimsFor = async (user) => {
  if (typeof user?.getIdTokenResult !== 'function') return {}
  try {
    const token = await user.getIdTokenResult()
    return token?.claims || {}
  } catch {
    return {}
  }
}

const emailFor = (user, profile, claims) => emailValue(profile?.email)
  || emailValue(user?.email)
  || user?.providerData?.map((item) => emailValue(item?.email)).find(Boolean)
  || emailValue(claims?.email)

const namesFrom = (profile, user, claims) => {
  const given = clip(profile?.given_name, 80) || clip(claims?.given_name, 80)
  const family = clip(profile?.family_name, 80) || clip(claims?.family_name, 80)
  if (given || family) {
    return {
      ...(given ? { firstName: given } : {}),
      ...(family ? { lastName: family } : {}),
    }
  }
  const display = clip(profile?.name, 160) || clip(user?.displayName, 160) || clip(claims?.name, 160)
  if (!display) return {}
  const splitAt = display.indexOf(' ')
  if (splitAt === -1) return { firstName: display.slice(0, 80) }
  const rest = display.slice(splitAt + 1).trim()
  return {
    firstName: display.slice(0, splitAt).slice(0, 80),
    ...(rest ? { lastName: rest.slice(0, 80) } : {}),
  }
}

const localeFrom = (profile, claims) => {
  const raw = clip(profile?.locale, 35) || clip(claims?.locale, 35)
  return raw?.replaceAll('_', '-')
}

const countryFrom = (locale) => {
  if (!locale) return undefined
  const region = locale.split('-').find((part, index) => index > 0 && /^[A-Za-z]{2}$/.test(part))
  return region?.toUpperCase()
}

const traitsFor = (user, profile, claims) => {
  const locale = localeFrom(profile, claims)
  const country = countryFrom(locale)
  const phone = clip(user?.phoneNumber, 32)
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return {
    ...namesFrom(profile, user, claims),
    ...(phone ? { phone } : {}),
    ...(locale ? { locale } : {}),
    ...(country ? { country } : {}),
    ...(timezone ? { timezone } : {}),
  }
}

const profileFor = (user, email, traits) => ({
  appUserId: user.uid,
  email,
  marketingConsent: 'granted',
  customUserId: user.uid,
  ...traits,
})

// `trackSignIn` is only for a new Google sign-in. A restored session identifies
// so Engage still has the email, and does not send another automation event.
export const linkSignedInAccount = async (user, { trackSignIn = false, profile } = {}) => {
  if (!rheoPublishableKey() || !user?.uid) return
  setUserId(user.uid)
  if (trackSignIn) logSignedIn()
  const claims = await claimsFor(user)
  const email = emailFor(user, profile, claims)
  // Granted consent without an email is rejected, and Rheo stores no customer.
  if (!email) throw new Error('Rheo identify needs the Google account email.')
  const config = engageConfig(user.uid)
  if (trackSignIn || !linked.has(user.uid)) {
    await identify(profileFor(user, email, traitsFor(user, profile, claims)), config)
    linked.add(user.uid)
  }
  if (trackSignIn) {
    await track({ name: 'signed_in', appUserId: user.uid, properties: { method: 'google' } }, config)
  }
}

const layoutUrlFor = (layoutId) => `https://fixsingaporegp.com/singapore/l/${layoutId}`

// Customer attributes are what the publish email can merge. The analytics event
// alone does not enroll the automation or fill the share link.
export const noteLayoutPublished = async (uid, layoutId, layoutName, layoutImage) => {
  if (!rheoPublishableKey() || !uid || !layoutId) return
  const config = engageConfig(uid)
  const layoutUrl = layoutUrlFor(layoutId)
  const name = clip(layoutName, 60)
  const image = isLayoutShotUrl(layoutImage, uid, layoutId) ? layoutImage : undefined
  const attributes = {
    layout_id: layoutId,
    layout_url: layoutUrl,
    ...(name ? { layout_name: name } : {}),
    ...(image ? { layout_image: image } : {}),
  }
  await identify({ appUserId: uid, attributes }, config)
  await track({
    name: 'layout_published',
    appUserId: uid,
    properties: attributes,
  }, config)
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
