import { describe, expect, it } from 'vitest'
import { HOME_MODEL } from './og.js'
import { ogCard } from './ogCard.js'

const textIn = (node) => {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textIn).join(' ')
  return textIn(node.props?.children)
}

describe('og card', () => {
  it('puts the headline and the wordmark on the home card', () => {
    const text = textIn(ogCard(HOME_MODEL, true))
    expect(text).toContain(HOME_MODEL.wordmark)
    expect(text).toContain(HOME_MODEL.title)
    expect(text).toContain(HOME_MODEL.accent)
    expect(text).toContain(HOME_MODEL.detail)
  })

  it('lays the wordmark and the layout name over the stored picture', () => {
    const card = ogCard({
      kind: 'layout',
      title: 'The Bayfront Slingshot',
      imageUrl: 'https://example.com/lap.jpg',
    }, true)
    const text = textIn(card)
    expect(text).toContain('FIX SINGAPORE GP')
    expect(text).toContain('The Bayfront Slingshot')
    expect(text).not.toContain('OVERTAKING INDEX')
    const image = JSON.stringify(card)
    expect(image).toContain('https://example.com/lap.jpg')
  })
})
