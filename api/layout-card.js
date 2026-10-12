import { readFileSync } from 'node:fs'
import { applyShareMeta, layoutShareMeta, renderLayoutCard, layoutPageUrl } from '../src/share/card.js'

const page = (body) => new Response(body, {
  status: 200,
  headers: {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'private, no-store',
  },
})

let shell

const readShell = async (origin) => {
  try {
    return readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8')
  } catch {
    const res = await fetch(`${origin}/index.html`, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) throw new Error('Could not read the app shell')
    return res.text()
  }
}

const appShell = async (origin) => {
  if (shell) return shell
  const html = await readShell(origin)
  if (!html.includes('id="root"')) throw new Error('Could not read the app shell')
  shell = html
  return html
}

const respond = async (request) => {
  const id = new URL(request.url).searchParams.get('id') || ''
  const pageUrl = layoutPageUrl(
    request.headers.get('x-forwarded-host') || request.headers.get('host'),
    request.headers.get('x-forwarded-proto'),
    id,
  )
  const meta = await layoutShareMeta({
    id,
    pageUrl,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    apiKey: process.env.VITE_FIREBASE_API_KEY,
  })
  try {
    return page(applyShareMeta(await appShell(new URL(pageUrl).origin), meta))
  } catch (error) {
    console.error(error)
    return page(renderLayoutCard(meta))
  }
}

export const GET = respond

export const HEAD = async (request) => {
  const res = await respond(request)
  return new Response(null, { status: res.status, headers: res.headers })
}
