const UA = 'Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1'
const cache = new Map()

const sampleOf = (text) => [...new Set(text)].join('').slice(0, 180)

const faceUrl = (css, style, weight) => {
  const block = css.split('@font-face').slice(1).find((part) => (
    part.includes(`font-style: ${style}`) && part.includes(`font-weight: ${weight}`)
  ))
  if (!block) return ''
  const hit = [...block.matchAll(/url\(([^)]+)\)\s*format\('([^']+)'\)/g)]
    .find((match) => match[2] === 'truetype' || match[2] === 'opentype')
  return hit?.[1]?.replaceAll('"', '').replaceAll("'", '') || ''
}

const readFace = async (css, style, weight) => {
  const url = faceUrl(css, style, weight)
  if (!url.startsWith('https://fonts.gstatic.com/')) return null
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
  if (!res.ok) return null
  return res.arrayBuffer()
}

export const loadBrandFonts = async (text) => {
  const sample = sampleOf(text)
  if (cache.has(sample)) return cache.get(sample)
  const endpoint = `https://fonts.googleapis.com/css2?family=Titillium+Web:ital,wght@0,400;0,700;0,900;1,700&text=${encodeURIComponent(sample)}`
  const cssRes = await fetch(endpoint, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(4000),
  })
  if (!cssRes.ok) return null
  const css = await cssRes.text()
  const [regular, bold, black, italic] = await Promise.all([
    readFace(css, 'normal', '400'),
    readFace(css, 'normal', '700'),
    readFace(css, 'normal', '900'),
    readFace(css, 'italic', '700'),
  ])
  if (!regular || !bold || !black || !italic) return null
  // Titillium has no italic 900. The italic 700 file is the headline face.
  const fonts = [
    { name: 'Titillium Web', data: regular, weight: 400, style: 'normal' },
    { name: 'Titillium Web', data: bold, weight: 700, style: 'normal' },
    { name: 'Titillium Web', data: black, weight: 900, style: 'normal' },
    { name: 'Titillium Web', data: italic, weight: 900, style: 'italic' },
  ]
  cache.set(sample, fonts)
  return fonts
}
