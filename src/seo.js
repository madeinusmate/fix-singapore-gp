import { layoutBlurb } from './share/card.js'
import { ogImageUrl } from './share/og.js'

export const SITE_ORIGIN = 'https://fixsingaporegp.com'
export const SITE_NAME = 'Fix Singapore GP'
const ROBOTS = 'index, follow, max-image-preview:large'

const page = ({ page: slug, ...fields }) => ({
  robots: ROBOTS,
  image: ogImageUrl(SITE_ORIGIN, slug ? { page: slug } : {}),
  ...fields,
})

export const HOME = page({
  title: 'Fix Singapore GP: draw a Marina Bay lap that overtakes',
  socialTitle: 'Marina Bay has an overtaking problem. Fix it.',
  description: 'The Singapore GP has an overtaking problem. Redraw the lap on real Marina Bay streets, score it under the 2026 rules, and let fans vote.',
  path: '/',
  imageAlt: 'Marina Bay has an overtaking problem. Fix it.',
})

export const CREATE = page({
  page: 'create',
  title: 'Draw a Singapore GP layout · Fix Singapore GP',
  socialTitle: 'Draw a lap that can actually overtake',
  description: 'Keep the start/finish straight, take any street after Turn 1, and see if your Marina Bay lap races under the 2026 rules.',
  path: '/create',
  imageAlt: 'Draw a Singapore GP layout on the Marina Bay streets',
})

export const TERMS = page({
  page: 'terms',
  title: 'Terms and conditions · Fix Singapore GP',
  socialTitle: 'Terms and conditions',
  description: 'Terms for drawing, publishing, and voting on fan layouts of the Singapore Grand Prix.',
  path: '/terms',
  imageAlt: 'Terms and conditions for Fix Singapore GP',
})

export const PRIVACY = page({
  page: 'privacy',
  title: 'Privacy · Fix Singapore GP',
  socialTitle: 'Privacy',
  description: 'What Fix Singapore GP stores when you browse, publish a layout, or sign in with Google.',
  path: '/privacy',
  imageAlt: 'Privacy policy for Fix Singapore GP',
})

export const NOT_FOUND = page({
  title: 'This page is not on the circuit · Fix Singapore GP',
  socialTitle: 'This page is not on the circuit',
  description: 'That link does not match a page on Fix Singapore GP.',
  path: '/',
  imageAlt: HOME.imageAlt,
  robots: 'noindex, follow',
})

export const SHARE_PAGES = {
  create: CREATE,
  terms: TERMS,
  privacy: PRIVACY,
}

const STATIC = {
  '/': HOME,
  '/create': CREATE,
  '/terms': TERMS,
  '/privacy': PRIVACY,
}

const safeId = (id) => /^[A-Za-z0-9]+$/.test(id || '')

export const metaForPath = (pathname) => {
  if (pathname.startsWith('/l/')) return null
  if (STATIC[pathname]) return STATIC[pathname]
  const path = /^\/[A-Za-z0-9/_-]*$/.test(pathname || '') ? pathname : '/'
  return { ...NOT_FOUND, path }
}

export const layoutPageMeta = ({ id, view, missing, unavailable }) => {
  const known = safeId(id)
  const path = known ? `/l/${id}` : '/'
  const image = known ? ogImageUrl(SITE_ORIGIN, { id }) : ogImageUrl(SITE_ORIGIN)
  if (missing || unavailable) {
    return {
      title: 'This layout has left the track · Fix Singapore GP',
      socialTitle: 'This layout has left the track',
      description: 'It may have been deleted, or the link is wrong.',
      path,
      image: missing && known ? ogImageUrl(SITE_ORIGIN, { id }) : ogImageUrl(SITE_ORIGIN),
      imageAlt: 'This layout has left the track',
      robots: 'noindex, follow',
    }
  }
  if (id === 'current' && view) {
    const index = view.result?.metrics?.overtaking_score_2026
    const score = typeof index === 'number' ? ` It scores ${index.toFixed(2)} on the overtaking index.` : ''
    return {
      title: "Today's lap · Fix Singapore GP",
      socialTitle: "Today's lap",
      description: `The Singapore GP layout as raced today, reconstructed from Marina Bay streets.${score} Draw a lap that overtakes better.`,
      path,
      image,
      imageAlt: "Today's Marina Bay lap",
      robots: ROBOTS,
    }
  }
  if (!view) {
    return {
      title: SITE_NAME,
      socialTitle: SITE_NAME,
      description: HOME.description,
      path,
      image,
      imageAlt: HOME.imageAlt,
      robots: ROBOTS,
    }
  }
  const title = String(view.title || '').trim() || 'A Marina Bay layout'
  const index = view.result?.metrics?.overtaking_score_2026
  return {
    title: `${title} · Fix Singapore GP`,
    socialTitle: title,
    description: layoutBlurb({
      title,
      creatorName: view.creatorName || '',
      overtakingIndex: typeof index === 'number' ? index : null,
    }),
    path,
    image,
    imageAlt: `${title}, a fan layout of the Singapore GP`,
    robots: ROBOTS,
  }
}

export const drivePageMeta = (input) => {
  const base = layoutPageMeta(input)
  const name = input.view?.title?.trim() || 'this lap'
  return {
    ...base,
    title: `Drive ${name} · Fix Singapore GP`,
    socialTitle: `Drive ${name}`,
    robots: 'noindex, follow',
  }
}

