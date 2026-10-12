import * as nodeModule from 'node:module'
import { loadBrandFonts } from './fonts.js'
import { load as patchOgBundle } from './og-require-hook.mjs'

// @vercel/og's Node bundle still expects CommonJS require() and a hb.wasm
// path that the package does not ship. Patch it before the import.
nodeModule.registerHooks({ load: patchOgBundle })
const { ImageResponse } = await import('@vercel/og')
import { loadPublishedLayout } from '../src/share/card.js'
import { ogCard } from '../src/share/ogCard.js'
import { OG_HEIGHT, OG_WIDTH, cardModel, cardText, pageModel } from '../src/share/og.js'

const SAFE_SHOT = /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[A-Za-z0-9.-]+\/o\/layouts%2F[A-Za-z0-9_-]+%2F[A-Za-z0-9]+\.jpg\?alt=media$/

const cacheControl = (kind) => {
  if (kind === 'layout' || kind === 'current') return 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400'
  if (kind === 'missing' || kind === 'unavailable') return 'public, max-age=60, s-maxage=60'
  return 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800'
}

const inlineShot = async (url) => {
  if (!SAFE_SHOT.test(url || '')) return ''
  try {
    const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(4000) })
    if (!res.ok) return ''
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.length < 32 || bytes.length > 4_500_000) return ''
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return ''
    return `data:image/jpeg;base64,${Buffer.from(bytes).toString('base64')}`
  } catch {
    return ''
  }
}

const render = (model, fonts) => new ImageResponse(ogCard(model, Boolean(fonts)), {
  width: OG_WIDTH,
  height: OG_HEIGHT,
  status: 200,
  fonts: fonts || undefined,
  headers: { 'cache-control': cacheControl(model.kind) },
})

const modelFor = async (request) => {
  const params = new URL(request.url).searchParams
  const id = params.get('id') || ''
  if (!id) return pageModel(params.get('page') || '')
  if (!/^[A-Za-z0-9]+$/.test(id)) return pageModel('')
  const loaded = await loadPublishedLayout(id, {
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    apiKey: process.env.VITE_FIREBASE_API_KEY,
  }).catch(() => ({ status: 'unavailable' }))
  return cardModel(loaded, id)
}

export const GET = async (request) => {
  const model = await modelFor(request)
  const ready = { ...model, imageUrl: await inlineShot(model.imageUrl) }
  const fonts = await loadBrandFonts(cardText(ready)).catch(() => null)
  try {
    return render(ready, fonts)
  } catch (error) {
    console.error(error)
    try {
      return render({ ...ready, imageUrl: '' }, null)
    } catch (again) {
      console.error(again)
      return new Response('Could not render the card', { status: 500 })
    }
  }
}
