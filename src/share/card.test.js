import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { layoutShotUrl } from './shot.js'
import { applyShareMeta, layoutBlurb, layoutCardResponse, layoutPageUrl, parseLayout } from './card.js'

const image = layoutShotUrl('sgp-2027.firebasestorage.app', 'uid1', 'layout9')

const doc = {
  fields: {
    title: { stringValue: 'The Bayfront <Slingshot>' },
    creatorName: { stringValue: 'Ada Lovelace' },
    creatorId: { stringValue: 'uid1' },
    imageUrl: { stringValue: image },
    summary: { mapValue: { fields: { overtakingIndex: { doubleValue: 1.84 } } } },
  },
}

describe('layout share cards', () => {
  it('reads the public picture and the overtaking index from a layout', () => {
    expect(parseLayout(doc)).toEqual({
      title: 'The Bayfront <Slingshot>',
      creatorName: 'Ada Lovelace',
      creatorId: 'uid1',
      overtakingIndex: 1.84,
      imageUrl: image,
    })
    expect(parseLayout({
      fields: { summary: { mapValue: { fields: { overtakingIndex: { integerValue: '2' } } } } },
    }).overtakingIndex).toBe(2)
  })

  it('describes the layout for a preview', () => {
    expect(layoutBlurb({ title: 'The Bayfront Slingshot', creatorName: 'Ada Lovelace', overtakingIndex: 1.8 })).toBe(
      'The Bayfront Slingshot by Ada Lovelace is a redrawn lap of the Singapore GP. It scores 1.80 on the overtaking index.',
    )
    expect(layoutBlurb({ title: '  ', creatorName: '', overtakingIndex: null })).toBe(
      'A Marina Bay layout is a redrawn lap of the Singapore GP.',
    )
  })

  it('keeps the page url on a safe host', () => {
    expect(layoutPageUrl('fixsingaporegp.com', 'https', 'layout9')).toBe('https://fixsingaporegp.com/singapore/l/layout9')
    expect(layoutPageUrl('evil.com\nset-cookie', 'https', 'layout9')).toBe('https://fixsingaporegp.com/singapore/l/layout9')
    expect(layoutPageUrl('localhost:5173', 'http', 'layout9')).toBe('http://localhost:5173/singapore/l/layout9')
    expect(layoutPageUrl('fixsingaporegp.com, evil.test', 'https', 'layout9')).toBe('https://fixsingaporegp.com/singapore/l/layout9')
    expect(layoutPageUrl('fixsingaporegp.com', 'https', '')).toBe('https://fixsingaporegp.com/singapore')
  })

  it('puts the stored picture on the app page, not only the bot card', async () => {
    const shell = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')
    const html = applyShareMeta(shell, {
      title: 'The Bayfront Slingshot',
      description: 'The Bayfront Slingshot is a redrawn lap of the Singapore GP.',
      pageUrl: 'https://fixsingaporegp.com/l/layout9',
      imageUrl: image,
      imageType: 'image/jpeg',
      imageAlt: 'The Bayfront Slingshot, a fan layout of the Singapore GP',
    })
    expect(html).toContain('id="root"')
    expect(html).toContain(`content="${image}"`)
    expect(html).toContain('content="image/jpeg"')
    expect(html).toContain('property="og:title" content="The Bayfront Slingshot"')
    expect(html).toContain('<title>The Bayfront Slingshot · Fix Singapore GP</title>')
    expect(html).toContain('href="https://fixsingaporegp.com/l/layout9"')
    expect(html).not.toContain('/api/og?v=2"')
  })

  it('shares the stored picture and the layout name', async () => {
    const fetchImpl = async () => ({ status: 200, ok: true, json: async () => doc })
    const html = await layoutCardResponse({
      id: 'layout9',
      pageUrl: 'https://fixsingaporegp.com/l/layout9',
      projectId: 'sgp-2027',
      apiKey: 'key',
      fetchImpl,
    })
    expect(html).toContain('/api/og?v=2&amp;id=layout9')
    expect(html).toContain('content="image/png"')
    expect(html).toContain('content="1200"')
    expect(html).toContain('content="630"')
    expect(html).toContain('summary_large_image')
    expect(html).not.toContain(image)
    expect(html).toContain('property="og:title" content="The Bayfront &lt;Slingshot&gt;"')
    expect(html).toContain('The Bayfront &lt;Slingshot&gt; by Ada Lovelace is a redrawn lap of the Singapore GP.')
    expect(html).not.toContain('<Slingshot>')
    expect(html).toContain('It scores 1.84 on the overtaking index.')
  })

  it('drops a picture url that is not stored for this layout', async () => {
    const tampered = {
      fields: {
        ...doc.fields,
        imageUrl: { stringValue: 'https://evil.example/track.jpg' },
      },
    }
    const html = await layoutCardResponse({
      id: 'layout9',
      pageUrl: 'https://fixsingaporegp.com/l/layout9',
      projectId: 'sgp-2027',
      apiKey: 'key',
      fetchImpl: async () => ({ status: 200, ok: true, json: async () => tampered }),
    })
    expect(html).not.toContain('evil.example')
    expect(html).toContain('/api/og?v=2&amp;id=layout9')
    expect(html).toContain('summary_large_image')
  })

  it('describes today\'s lap with a generated card', async () => {
    const fetchImpl = async () => { throw new Error('should not fetch') }
    const html = await layoutCardResponse({ id: 'current', pageUrl: 'https://fixsingaporegp.com/l/current', fetchImpl })
    expect(html).toContain("Today's lap")
    expect(html).toContain('/api/og?v=2&amp;id=current')
  })

  it('does not call a deleted layout a preview of the site', async () => {
    const html = await layoutCardResponse({
      id: 'missing1',
      pageUrl: 'https://fixsingaporegp.com/l/missing1',
      projectId: 'sgp-2027',
      apiKey: 'key',
      fetchImpl: async () => ({ status: 404, ok: false, json: async () => ({}) }),
    })
    expect(html).toContain('This layout has left the track')
    expect(html).toContain('noindex, follow')
    expect(html).toContain('/api/og?v=2&amp;id=missing1')
  })
})
