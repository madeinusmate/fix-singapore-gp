import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@getrheo/react', () => ({
  logEvent: vi.fn(),
}))

vi.mock('./config.js', () => ({
  rheoPublishableKey: () => 'ob_pk_test_events',
}))

import { logEvent } from '@getrheo/react'
import { logLayoutPublished } from './events.js'

const image = 'https://firebasestorage.googleapis.com/v0/b/sgp-2027.firebasestorage.app/o/layouts%2Fuid-1%2Flayout9.jpg?alt=media'

describe('logLayoutPublished', () => {
  beforeEach(() => {
    logEvent.mockClear()
  })

  it('records the screenshot link as an event property', () => {
    logLayoutPublished('layout9', image)

    expect(logEvent).toHaveBeenCalledWith('layout_published', {
      layout_id: 'layout9',
      layout_image: image,
    })
  })

  it('omits the screenshot property when the upload did not return a url', () => {
    logLayoutPublished('layout9', null)

    expect(logEvent).toHaveBeenCalledWith('layout_published', { layout_id: 'layout9' })
  })
})
