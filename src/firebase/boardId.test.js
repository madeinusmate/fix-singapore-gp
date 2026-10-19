import { describe, expect, it } from 'vitest'
import { CIRCUITS } from '../circuits.js'
import { boardId } from './boardId.js'

describe('lap board id', () => {
  it('keeps Singapore on the original board and gives every other circuit its own', () => {
    expect(boardId('singapore', 'current')).toBe('current')
    expect(boardId('monaco', 'current')).toBe('monaco-current')
    expect(boardId('las-vegas', 'current')).toBe('las-vegas-current')
    expect(boardId('singapore', 'layout9')).toBe('layout9')
    expect(CIRCUITS.filter((circuit) => circuit.slug !== 'singapore').every(
      (circuit) => boardId(circuit.slug, 'current') === `${circuit.slug}-current`,
    )).toBe(true)
  })
})
