import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { GET } from '../api/page-card.js'
import { CREATE, HOME, layoutPageMeta, metaForPath } from './seo.js'

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const robots = readFileSync(new URL('../public/robots.txt', import.meta.url), 'utf8')

describe('site meta', () => {
  it('publishes the homepage card, canonical, and crawler files', () => {
    expect(html).toContain(`<title>${HOME.title}</title>`)
    expect(html).toContain(`content="${HOME.description}"`)
    expect(html).toContain(`content="${HOME.socialTitle}"`)
    expect(html).toContain(`content="${HOME.image}"`)
    expect(html).toContain('summary_large_image')
    expect(html).toContain('rel="canonical" href="https://fixsingaporegp.com/"')
    expect(html).toContain('max-image-preview:large')
    expect(html).toContain('"@type": "WebSite"')
    expect(robots).toContain('Allow: /api/og')
    expect(robots).toContain('Sitemap: https://fixsingaporegp.com/sitemap.xml')
  })

  it('names the static pages and keeps unknown urls out of the index', () => {
    expect(metaForPath('/create')).toMatchObject({ path: '/create', image: CREATE.image })
    expect(metaForPath('/l/layout9')).toBeNull()
    expect(metaForPath('/nope')).toMatchObject({ robots: 'noindex, follow', path: '/nope' })
  })

  it('describes a published layout from the lap it loaded', () => {
    expect(layoutPageMeta({
      id: 'layout9',
      view: {
        title: 'The Bayfront Slingshot',
        creatorName: 'Ada Lovelace',
        result: { metrics: { overtaking_score_2026: 1.8 } },
      },
    })).toMatchObject({
      socialTitle: 'The Bayfront Slingshot',
      path: '/l/layout9',
      image: 'https://fixsingaporegp.com/api/og?v=1&id=layout9',
      description: 'The Bayfront Slingshot by Ada Lovelace is a redrawn lap of the Singapore GP. It scores 1.80 on the overtaking index.',
    })
  })

  it('serves a share card for the editor and refuses an unknown page', async () => {
    const res = await GET(new Request('https://fixsingaporegp.com/api/page-card?page=create'))
    const body = await res.text()
    expect(res.status).toBe(200)
    expect(body).toContain('Draw a lap that can actually overtake')
    expect(body).toContain('/api/og?v=1&amp;page=create')
    expect(body).toContain('https://fixsingaporegp.com/create')
    const missing = await GET(new Request('https://fixsingaporegp.com/api/page-card?page=nope'))
    expect(missing.status).toBe(404)
  })
})
