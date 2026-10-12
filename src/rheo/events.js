import { logEvent } from '@getrheo/react'
import { rheoPublishableKey } from './config.js'

const record = (name, properties) => {
  if (!rheoPublishableKey()) return
  if (properties) logEvent(name, properties)
  else logEvent(name)
}

export const logSignedIn = () => record('signed_in', { method: 'google' })

export const logSignedOut = () => record('signed_out')

export const logLayoutPublished = (layoutId) => record('layout_published', { layout_id: layoutId })

export const logLayoutUpdated = (layoutId) => record('layout_updated', { layout_id: layoutId })

export const logLayoutDeleted = (layoutId) => record('layout_deleted', { layout_id: layoutId })

export const logLayoutVote = (layoutId, on) => record(on ? 'layout_upvoted' : 'layout_vote_removed', { layout_id: layoutId })

export const logLayoutShared = (layoutId, method) => record('layout_shared', { layout_id: layoutId, method })

export const logDriveStarted = (layoutId) => record('drive_started', { layout_id: layoutId })

export const logLapCompleted = ({ layoutId, clean, timeS, personalBest }) => record('lap_completed', {
  layout_id: layoutId,
  clean,
  time_s: Math.round(timeS * 1000) / 1000,
  personal_best: personalBest,
})
