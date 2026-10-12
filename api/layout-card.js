import { layoutCardResponse, layoutPageUrl } from '../src/share/card.js'

const page = (body) => new Response(body, {
  status: 200,
  headers: {
    'content-type': 'text/html; charset=utf-8',
    // Private so a crawler's preview HTML is not cached onto /l/:id for everyone else.
    'cache-control': 'private, no-store',
  },
})

const respond = async (request) => {
  const id = new URL(request.url).searchParams.get('id') || ''
  const pageUrl = layoutPageUrl(
    request.headers.get('x-forwarded-host') || request.headers.get('host'),
    request.headers.get('x-forwarded-proto'),
    id,
  )
  const body = await layoutCardResponse({
    id,
    pageUrl,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    apiKey: process.env.VITE_FIREBASE_API_KEY,
  })
  return page(body)
}

export const GET = respond

export const HEAD = async (request) => {
  const res = await respond(request)
  return new Response(null, { status: res.status, headers: res.headers })
}
