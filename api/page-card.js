import { layoutPageUrl, renderLayoutCard } from '../src/share/card.js'
import { ogImageUrl } from '../src/share/og.js'
import { SHARE_PAGES } from '../src/seo.js'

const html = (body, status = 200) => new Response(body, {
  status,
  headers: {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'private, no-store',
  },
})

const respond = (request) => {
  const page = new URL(request.url).searchParams.get('page') || ''
  const meta = SHARE_PAGES[page]
  if (!meta) return new Response('Not found', { status: 404 })
  const origin = new URL(layoutPageUrl(
    request.headers.get('x-forwarded-host') || request.headers.get('host'),
    request.headers.get('x-forwarded-proto'),
    '',
  )).origin
  return html(renderLayoutCard({
    title: meta.socialTitle,
    description: meta.description,
    pageUrl: `${origin}${meta.path}`,
    imageUrl: ogImageUrl(origin, { page }),
    imageAlt: meta.imageAlt,
    robots: meta.robots,
  }))
}

export const GET = respond

export const HEAD = async (request) => {
  const res = await respond(request)
  return new Response(null, { status: res.status, headers: res.headers })
}
