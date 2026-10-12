import { isLayoutShotUrl } from './shot.js'

export const OG_VERSION = '1'
export const OG_WIDTH = 1200
export const OG_HEIGHT = 630

const line = (value, max) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)

export const ogImageUrl = (origin, query = {}) => {
  const url = new URL('/api/og', origin)
  url.searchParams.set('v', OG_VERSION)
  if (query.id) url.searchParams.set('id', query.id)
  else if (query.page) url.searchParams.set('page', query.page)
  return url.toString()
}

export const HOME_MODEL = {
  kind: 'home',
  kicker: 'Singapore Grand Prix',
  title: 'Marina Bay has an overtaking problem.',
  accent: 'Fix it.',
  detail: 'Draw a lap on real streets. Score it under the 2026 rules.',
  score: null,
  imageUrl: '',
}

export const CREATE_MODEL = {
  kind: 'create',
  kicker: 'Draw a layout',
  title: 'Keep the start. Redraw the rest.',
  accent: '',
  detail: 'Any street after Turn 1, scored under the 2026 rules.',
  score: null,
  imageUrl: '',
}

const TERMS_MODEL = {
  kind: 'terms',
  kicker: 'Fix Singapore GP',
  title: 'Terms and conditions',
  accent: '',
  detail: 'Drawing, publishing, and voting on fan layouts.',
  score: null,
  imageUrl: '',
}

const PRIVACY_MODEL = {
  kind: 'privacy',
  kicker: 'Fix Singapore GP',
  title: 'Privacy',
  accent: '',
  detail: 'What the site stores when you browse, publish, or sign in.',
  score: null,
  imageUrl: '',
}

const MISSING_MODEL = {
  kind: 'missing',
  kicker: 'Fix Singapore GP',
  title: 'This layout has left the track.',
  accent: '',
  detail: 'It may have been deleted, or the link is wrong.',
  score: null,
  imageUrl: '',
}

const CURRENT_MODEL = {
  kind: 'current',
  kicker: "Today's lap",
  title: 'Marina Bay, as raced.',
  accent: '',
  detail: 'Draw a lap that overtakes better.',
  score: null,
  imageUrl: '',
}

const PAGES = {
  create: CREATE_MODEL,
  terms: TERMS_MODEL,
  privacy: PRIVACY_MODEL,
}

export const pageModel = (page) => PAGES[page] || HOME_MODEL

export const cardModel = (loaded, id) => {
  if (loaded?.status === 'current') return CURRENT_MODEL
  if (loaded?.status === 'missing') return MISSING_MODEL
  if (loaded?.status !== 'ok') return { ...HOME_MODEL, kind: 'unavailable' }
  const title = line(loaded.layout.title, 70) || 'A Marina Bay layout'
  const by = line(loaded.layout.creatorName, 40)
  const score = loaded.layout.overtakingIndex
  return {
    kind: 'layout',
    kicker: 'Fan layout',
    title,
    accent: '',
    detail: by ? `by ${by}` : 'A redrawn lap of Marina Bay',
    score: typeof score === 'number' && Number.isFinite(score) ? score : null,
    imageUrl: isLayoutShotUrl(loaded.layout.imageUrl, loaded.layout.creatorId, id) ? loaded.layout.imageUrl : '',
  }
}

export const cardText = (model) => [
  model.kicker,
  model.title,
  model.accent,
  model.detail,
  typeof model.score === 'number' ? model.score.toFixed(2) : '',
  'FIX SINGAPORE GP',
  'OVERTAKING INDEX',
].filter(Boolean).join(' ')
