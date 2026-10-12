import { isLayoutShotUrl, SHOT_HEIGHT, SHOT_WIDTH } from './shot.js'

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
  const path = /^[A-Za-z0-9]+$/.test(id || '') ? `/l/${id}` : '/'
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

export const renderLayoutCard = ({ title, description, pageUrl, imageUrl, imageAlt }) => {
  const card = imageUrl ? 'summary_large_image' : 'summary'
  const image = imageUrl ? [
    meta('property', 'og:image', imageUrl),
    meta('property', 'og:image:type', 'image/jpeg'),
    meta('property', 'og:image:width', String(SHOT_WIDTH)),
    meta('property', 'og:image:height', String(SHOT_HEIGHT)),
    meta('property', 'og:image:alt', imageAlt || title),
    meta('name', 'twitter:image', imageUrl),
  ] : []
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${text(title)} · Fix Singapore GP</title>
${meta('name', 'description', description)}
<meta property="og:site_name" content="Fix Singapore GP">
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

export const layoutCardResponse = async ({ id, pageUrl, projectId, apiKey, fetchImpl }) => {
  const loaded = await loadPublishedLayout(id, { projectId, apiKey, fetchImpl }).catch(() => ({ status: 'unavailable' }))
  if (loaded.status === 'current') return renderLayoutCard({ ...CURRENT, pageUrl })
  if (loaded.status === 'missing') return renderLayoutCard({ ...MISSING, pageUrl })
  if (loaded.status !== 'ok') return renderLayoutCard({ ...UNAVAILABLE, pageUrl })
  const title = loaded.layout.title.trim() || 'A Marina Bay layout'
  const imageUrl = isLayoutShotUrl(loaded.layout.imageUrl, loaded.layout.creatorId, id) ? loaded.layout.imageUrl : ''
  return renderLayoutCard({
    title,
    description: layoutBlurb({
      title,
      creatorName: loaded.layout.creatorName,
      overtakingIndex: loaded.layout.overtakingIndex,
    }),
    pageUrl,
    imageUrl,
    imageAlt: `3D view of ${title}`,
  })
}
