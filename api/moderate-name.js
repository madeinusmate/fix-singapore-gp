import { gateway } from '@ai-sdk/gateway'
import { experimental_decide as decide } from 'ai'
import { NAME_CHECK_FAILED, NAME_LENGTH, NAME_QUESTION, NAME_SIGN_IN, UNSUITABLE_NAME, layoutName, nameVerdict } from '../src/moderation/name.js'

const json = (body, status) => Response.json(body, { status })

const firebaseKey = () => process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || ''

export const verifyFirebaseUser = async (authorization, { fetchImpl = fetch, apiKey = firebaseKey() } = {}) => {
  const idToken = /^Bearer\s+(\S+)$/i.exec(authorization || '')?.[1]
  if (!idToken || !apiKey) return null
  const response = await fetchImpl(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken }),
    redirect: 'error',
  })
  if (!response.ok) return null
  const data = await response.json()
  const user = data.users?.[0]
  return user?.localId ? user : null
}

const scoreName = (name, decideFn) => decideFn({
  model: gateway.evaluationModel('typesafe-ai/jev'),
  state: name,
  questions: { suitable: NAME_QUESTION },
  providerOptions: { gateway: { zeroDataRetention: true } },
})

export const POST = async (request, { verifyUser = verifyFirebaseUser, decide: decideFn = decide } = {}) => {
  const user = await verifyUser(request.headers.get('authorization'))
  if (!user) return json({ ok: false, error: NAME_SIGN_IN }, 401)

  let body
  try {
    body = await request.json()
  } catch {
    return json({ ok: false, error: NAME_LENGTH }, 400)
  }
  const name = layoutName(body?.name)
  if (!name) return json({ ok: false, error: NAME_LENGTH }, 400)

  try {
    const result = await scoreName(name, decideFn)
    const verdict = nameVerdict(result.answers?.suitable)
    if (!verdict.ok) {
      console.error('Name check declined', verdict.code)
      const failed = verdict.code === 'unchecked'
      return json({ ok: false, error: failed ? NAME_CHECK_FAILED : UNSUITABLE_NAME }, failed ? 503 : 422)
    }
    return json({ ok: true })
  } catch (error) {
    console.error('Name check failed', error instanceof Error ? error.name : 'unknown')
    return json({ ok: false, error: NAME_CHECK_FAILED }, 503)
  }
}
