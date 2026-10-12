import { describe, expect, it } from 'vitest'
import { layoutShotUrl } from './shot.js'
import { HOME_MODEL, cardModel, ogImageUrl, pageModel } from './og.js'

const image = layoutShotUrl('sgp-2027.firebasestorage.app', 'uid1', 'layout9')

describe('og image urls', () => {
  it('builds a versioned card url and ignores free text', () => {
    expect(ogImageUrl('https://fixsingaporegp.com')).toBe('https://fixsingaporegp.com/api/og?v=1')
    expect(ogImageUrl('https://fixsingaporegp.com', { id: 'layout9' })).toBe('https://fixsingaporegp.com/api/og?v=1&id=layout9')
    expect(ogImageUrl('https://fixsingaporegp.com', { page: 'create' })).toBe('https://fixsingaporegp.com/api/og?v=1&page=create')
    expect(pageModel('nope')).toEqual(HOME_MODEL)
    expect(pageModel('create').title).toBe('Keep the start. Redraw the rest.')
  })

  it('keeps a stored picture and drops any other url', () => {
    const layout = {
      title: 'The Bayfront Slingshot',
      creatorName: 'Ada Lovelace',
      creatorId: 'uid1',
      overtakingIndex: 1.84,
      imageUrl: image,
    }
    expect(cardModel({ status: 'ok', layout }, 'layout9')).toMatchObject({
      kind: 'layout',
      title: 'The Bayfront Slingshot',
      detail: 'by Ada Lovelace',
      score: 1.84,
      imageUrl: image,
    })
    expect(cardModel({
      status: 'ok',
      layout: { ...layout, imageUrl: 'https://evil.example/track.jpg' },
    }, 'layout9').imageUrl).toBe('')
    expect(cardModel({ status: 'current' }, 'current').kind).toBe('current')
    expect(cardModel({ status: 'missing' }, 'missing1').kind).toBe('missing')
    expect(cardModel({ status: 'unavailable' }, 'layout9').kind).toBe('unavailable')
  })
})
