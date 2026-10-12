import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { firebaseConfigured, useAuth } from '../firebase/client.js'
import { removeLayout } from '../firebase/layouts.js'
import { deleteLayoutShot } from '../firebase/shots.js'
import { useVotes } from '../firebase/votes.js'
import { logLayoutDeleted, logLayoutShared } from '../rheo/events.js'
import { LabView } from '../lab/LabView.jsx'
import { senseLabel } from '../lab/numbers.js'
import { useLayoutView } from '../lab/useLayoutView.js'

const shareLayout = async (title, text) => {
  const url = window.location.href.split('?')[0]
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url })
      return 'native'
    } catch (err) {
      if (err?.name === 'AbortError') return null
    }
  }
  await navigator.clipboard.writeText(`${text} ${url}`)
  return 'copy'
}

export const LayoutPage = () => {
  const { id } = useParams()
  const [params] = useSearchParams()
  const { world, error, view, missing, unavailable } = useLayoutView(id)
  const user = useAuth()
  const navigate = useNavigate()
  const [is3d, setIs3d] = useState(params.get('mode') === '3d')
  const [playing, setPlaying] = useState(true)
  const [shared, setShared] = useState('')
  const fresh = params.get('new') === '1'
  const voteIds = useMemo(() => (id === 'current' || !firebaseConfigured ? [] : [id]), [id])
  const votes = useVotes(voteIds, user)

  if (error) return <p className="loading">{error.message}</p>
  if (missing || unavailable) return (
    <div className="missing">
      <h1>This layout has left the track.</h1>
      <p>It may have been deleted, or the link is wrong.</p>
      <Link to="/">Back to the leaderboard</Link>
    </div>
  )
  if (!world || !view) return <p className="loading">Warming the tyres…</p>

  const mine = user && view.creatorId === user.uid
  const runs = id === 'current'
    ? [{ id: 'current', name: 'Today’s lap', short: 'Today', color: view.color, result: view.result }]
    : [
      { id: 'layout', name: view.title, short: view.title, color: view.color, result: view.result },
      { id: 'current', name: world.current.title, short: 'Today', color: world.current.color, result: world.result },
    ]

  const index = view.result.metrics.overtaking_score_2026
  const todayIndex = world.result.metrics.overtaking_score_2026
  const shareText = id === 'current'
    ? `Marina Bay scores ${todayIndex.toFixed(2)} on the overtaking index. Think you can draw a better Singapore GP layout?`
    : `I redesigned the Singapore GP layout. "${view.title}" scores ${index.toFixed(2)} on the overtaking index; today's lap scores ${todayIndex.toFixed(2)}. Can you beat it?`

  const share = async () => {
    try {
      const method = await shareLayout(view.title, shareText)
      if (!method) return
      logLayoutShared(id, method)
      setShared(method === 'copy' ? 'Link copied. Go get some votes.' : '')
    } catch {
      setShared('Could not copy the link. Copy it from the address bar instead.')
    }
  }

  const remove = async () => {
    if (!window.confirm('Delete this layout? It leaves the leaderboard and its votes go with it.')) return
    await deleteLayoutShot(user?.uid, id).catch((error) => console.error('Layout shot delete failed', error))
    await removeLayout(id)
    logLayoutDeleted(id)
    navigate('/')
  }

  return (
    <LabView
      style={world.style}
      graph={world.graph}
      runs={runs}
      is3d={is3d}
      on3d={setIs3d}
      fitKey={id + (is3d ? '-3d' : '')}
      playing={playing}
      onPlaying={setPlaying}
      actions={(
        <div className="actions-wrap">
          {fresh && mine && (
            <div className="banner">
              <b>You&apos;re on the grid.</b>
              <p>Your layout is live on the leaderboard. Share it: votes decide pole.</p>
              {!view.imageUrl && <p>The 3D picture did not save. Edit the layout and save it again.</p>}
            </div>
          )}
          {mine && !fresh && !view.imageUrl && (
            <p className="small">No share picture yet. Edit this layout and save it to photograph the 3D view.</p>
          )}
          <p className="small">{id === 'current' ? 'The layout raced today, reconstructed from street data.' : `by ${view.creatorName} · ${senseLabel(view.racingSense)}`}</p>
          {id !== 'current' && todayIndex > 0 && (
            <p className="verdict">
              {index > todayIndex * 1.05
                ? `${(index / todayIndex).toFixed(1)}× the overtaking index of today’s lap.`
                : index < todayIndex * 0.95 ? 'Less overtaking than today’s lap. Brave.' : 'About as much overtaking as today’s lap.'}
            </p>
          )}
          <div className="actions">
            <div className={id === 'current' ? 'action-grid cols-3' : 'action-grid'}>
              {id !== 'current' && (
                <button
                  type="button"
                  className={`vote wide${votes.voted.has(id) ? ' on' : ''}`}
                  disabled={votes.busy === id}
                  aria-pressed={votes.voted.has(id)}
                  onClick={() => votes.toggle(id)}
                >
                  <span aria-hidden="true">▲</span>
                  {votes.voted.has(id) ? 'Upvoted' : 'Upvote'}
                  <b>{votes.count(id, view.votes)}</b>
                </button>
              )}
              <Link to={`/l/${id}/drive`} className="tool drive">Drive</Link>
              <button type="button" className="tool" onClick={share}>Share</button>
              <Link to={`/create?from=${id}`} className="tool">Remix</Link>
            </div>
            {mine && (
              <div className="action-own">
                <Link to={`/create?edit=${id}`}>Edit</Link>
                <button type="button" onClick={remove}>Delete</button>
              </div>
            )}
          </div>
          {shared && <p className="small" role="status">{shared}</p>}
          {votes.error && <p className="error">{votes.error}</p>}
        </div>
      )}
    />
  )
}
