import { OG_HEIGHT, OG_WIDTH, ogImageUrl } from './og.js'

const text = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll('\n', ' ')
  .replaceAll('\r', ' ')

const meta = (attr, key, content) => `<meta ${attr}="${key}" content="${text(content)}">`

const field = (node) => {
  if (!node || typeof node !== 'object') return undefined
  if (typeof node.stringValue === 'string') return node.stringValue
  if ('doubleValue' in node) return Number(node.doubleValue)
  if ('integerValue' in node) return Number(node.integerValue)
  if (node.mapValue?.fields) {
    return Object.fromEntries(Object.entries(node.mapValue.fields).map(([key, value]) => [key, field(value)]))
  }
  return undefined
}

export const parseLayout = (doc) => {
  const fields = field({ mapValue: { fields: doc?.fields } }) || {}
  const index = fields.summary?.overtakingIndex
  return {
    title: typeof fields.title === 'string' ? fields.title : '',
    creatorName: typeof fields.creatorName === 'string' ? fields.creatorName : '',
    creatorId: typeof fields.creatorId === 'string' ? fields.creatorId : '',
    overtakingIndex: typeof index === 'number' && Number.isFinite(index) ? index : null,
    imageUrl: typeof fields.imageUrl === 'string' ? fields.imageUrl : '',
  }
}

export const layoutBlurb = ({ title, creatorName, overtakingIndex }) => {
  const name = title.trim() || 'A Marina Bay layout'
  const by = creatorName.trim() ? ` by ${creatorName.trim()}` : ''
  const score = overtakingIndex == null ? '' : ` It scores ${overtakingIndex.toFixed(2)} on the overtaking index.`
  return `${name}${by} is a redrawn lap of the Singapore GP.${score}`
}

export const layoutPageUrl = (hostHeader, protoHeader, id) => {
  const host = String(hostHeader || '').split(',')[0].trim()
  const safeHost = /^[A-Za-z0-9.-]+(?::\d+)?$/.test(host) ? host : 'fixsingaporegp.com'
  const proto = protoHeader === 'http' ? 'http' : 'https'
  const path = /^[A-Za-z0-9]+$/.test(id || '') ? `/singapore/l/${id}` : '/singapore'
  return `${proto}://${safeHost}${path}`
}

export const loadPublishedLayout = async (id, { projectId, apiKey, fetchImpl = fetch } = {}) => {
  if (id === 'current') return { status: 'current' }
  if (!/^[A-Za-z0-9]+$/.test(id || '')) return { status: 'missing' }
  if (!projectId || !apiKey) return { status: 'unavailable' }
  const endpoint = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/%28default%29/documents/layouts/${encodeURIComponent(id)}?key=${encodeURIComponent(apiKey)}`
  const res = await fetchImpl(endpoint)
  if (res.status === 404) return { status: 'missing' }
  if (!res.ok) return { status: 'unavailable' }
  return { status: 'ok', layout: parseLayout(await res.json()) }
}

const setTag = (html, attr, key, content) => {
  const pattern = new RegExp(`<meta\\s+${attr}="${key}"\\s+content="[^"]*"`)
  const next = `${attr}="${key}" content="${text(content)}"`
  if (pattern.test(html)) return html.replace(pattern, `<meta ${next}`)
  return html.replace('</head>', `<meta ${next}>\n</head>`)
}

// The first HTML for a layout has to carry the share tags. Crawlers that are
// not on the bot list never run the app, so they would otherwise keep the homepage card.
export const applyShareMeta = (html, meta) => {
  let next = html.replace(/<title>[^<]*<\/title>/, `<title>${text(meta.title)} · Fix Singapore GP</title>`)
  next = setTag(next, 'name', 'description', meta.description)
  next = setTag(next, 'name', 'robots', meta.robots || 'index, follow, max-image-preview:large')
  next = setTag(next, 'property', 'og:title', meta.title)
  next = setTag(next, 'property', 'og:description', meta.description)
  next = setTag(next, 'property', 'og:url', meta.pageUrl)
  next = setTag(next, 'property', 'og:image', meta.imageUrl)
  next = setTag(next, 'property', 'og:image:secure_url', meta.imageUrl)
  next = setTag(next, 'property', 'og:image:type', meta.imageType || 'image/png')
  next = setTag(next, 'property', 'og:image:alt', meta.imageAlt || meta.title)
  next = setTag(next, 'name', 'twitter:title', meta.title)
  next = setTag(next, 'name', 'twitter:description', meta.description)
  next = setTag(next, 'name', 'twitter:image', meta.imageUrl)
  next = setTag(next, 'name', 'twitter:image:alt', meta.imageAlt || meta.title)
  return next.replace(/<link rel="canonical" href="[^"]*"/, `<link rel="canonical" href="${text(meta.pageUrl)}"`)
}

export const renderLayoutCard = ({ title, description, pageUrl, imageUrl, imageAlt, imageType = 'image/png', robots = 'index, follow, max-image-preview:large' }) => {
  const card = imageUrl ? 'summary_large_image' : 'summary'
  const image = imageUrl ? [
    meta('property', 'og:image', imageUrl),
    meta('property', 'og:image:secure_url', imageUrl),
    meta('property', 'og:image:type', imageType),
    meta('property', 'og:image:width', String(OG_WIDTH)),
    meta('property', 'og:image:height', String(OG_HEIGHT)),
    meta('property', 'og:image:alt', imageAlt || title),
    meta('name', 'twitter:image', imageUrl),
    meta('name', 'twitter:image:alt', imageAlt || title),
  ] : []
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${text(title)} · Fix Singapore GP</title>
${meta('name', 'description', description)}
${meta('name', 'robots', robots)}
<meta property="og:site_name" content="Fix Singapore GP">
<meta property="og:locale" content="en_SG">
${meta('property', 'og:title', title)}
${meta('property', 'og:description', description)}
<meta property="og:type" content="website">
${meta('property', 'og:url', pageUrl)}
${image.join('\n')}
<meta name="twitter:card" content="${card}">
${meta('name', 'twitter:title', title)}
${meta('name', 'twitter:description', description)}
<link rel="canonical" href="${text(pageUrl)}">
</head>
<body>
<p><a href="${text(pageUrl)}">${text(title)}</a></p>
</body>
</html>`
}

const CURRENT = {
  title: "Today's lap",
  description: 'The Singapore GP layout as raced today, reconstructed from Marina Bay streets. Draw a lap that overtakes better.',
}

const MISSING = {
  title: 'This layout has left the track',
  description: 'It may have been deleted, or the link is wrong.',
}

const UNAVAILABLE = {
  title: 'Fix Singapore GP',
  description: 'Redraw the Singapore GP layout on real streets, test it under the 2026 rules, and climb the fan leaderboard.',
}

export const layoutShareMeta = async ({ id, pageUrl, projectId, apiKey, fetchImpl }) => {
  const origin = new URL(pageUrl).origin
  const loaded = await loadPublishedLayout(id, { projectId, apiKey, fetchImpl }).catch(() => ({ status: 'unavailable' }))
  if (loaded.status === 'current') {
    return {
      ...CURRENT,
      pageUrl,
      imageUrl: ogImageUrl(origin, { id: 'current' }),
      imageAlt: "Today's lap at Marina Bay",
    }
  }
  if (loaded.status === 'missing') {
    return {
      ...MISSING,
      pageUrl,
      imageUrl: ogImageUrl(origin, { id }),
      imageAlt: 'This layout has left the track',
      robots: 'noindex, follow',
    }
  }
  if (loaded.status !== 'ok') {
    return {
      ...UNAVAILABLE,
      pageUrl,
      imageUrl: ogImageUrl(origin),
      imageAlt: 'Fix Singapore GP',
    }
  }
  const title = loaded.layout.title.trim() || 'A Marina Bay layout'
  return {
    title,
    description: layoutBlurb({
      title,
      creatorName: loaded.layout.creatorName,
      overtakingIndex: loaded.layout.overtakingIndex,
    }),
    pageUrl,
    imageUrl: ogImageUrl(origin, { id }),
    imageAlt: `${title}, a fan layout of the Singapore GP`,
  }
}

export const layoutCardResponse = async (input) => renderLayoutCard(await layoutShareMeta(input))
