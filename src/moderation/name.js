export const NAME_MIN = 3
export const NAME_MAX = 60

// Score rungs run from "do not publish" (0) through an ordinary name (1)
// to a circuit nickname (2). 1 is the ordinary rung. A name below that is
// closer to a rule break than to something we can put on the leaderboard.
// Requiring the top rung blocked ordinary names in production.
export const PUBLISHABLE_SCORE = 1
export const UNSUITABLE_MAX = 0.5

export const UNSUITABLE_NAME = 'Please choose a different name.'
export const NAME_TAKEN = 'A layout already uses that name.'
export const NAME_CHECK_FAILED = 'Could not check that name. Try again.'
export const NAME_LENGTH = 'Use a name between 3 and 60 characters.'
export const NAME_SIGN_IN = 'Sign in before naming a layout.'

export const NAME_QUESTION = {
  type: 'score',
  instructions: 'How suitable is this text as the public name of a motorsport circuit layout?',
  criteria: [
    'Do not publish. Slurs, hate, sexual content, threats, harassment, personal contact details, or spam.',
    'Publish. An ordinary phrase, a place, a joke, or a nickname.',
    'Publish. A motorsport circuit name, including a dramatic nickname.',
  ],
}

export const layoutName = (value) => {
  const name = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
  if (name.length < NAME_MIN || name.length > NAME_MAX) return null
  return name
}

export const nameKey = (value) => {
  const name = layoutName(value)
  if (!name) return null
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return slug || null
}

export const nameIsTaken = (claimLayoutId, sameTitleIds, exceptId) => (
  (Boolean(claimLayoutId) && claimLayoutId !== exceptId)
  || sameTitleIds.some((id) => id !== exceptId)
)

export const nameVerdict = (answer) => {
  const unsuitable = Number(answer?.probabilities?.['0'])
  if (answer?.type !== 'score' || !Number.isFinite(answer.score) || !Number.isFinite(unsuitable)) {
    return { ok: false, code: 'unchecked' }
  }
  if (unsuitable >= UNSUITABLE_MAX || answer.score < PUBLISHABLE_SCORE) {
    return { ok: false, code: 'unsuitable', score: answer.score }
  }
  return { ok: true, score: answer.score }
}

export const moderateLayoutName = async (user, name) => {
  const token = await user.getIdToken()
  let response
  try {
    response = await fetch('/api/moderate-name', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name }),
    })
  } catch {
    throw new Error(NAME_CHECK_FAILED)
  }
  const data = await response.json().catch(() => null)
  if (data?.ok && response.ok) return
  throw new Error(data?.error || NAME_CHECK_FAILED)
}
