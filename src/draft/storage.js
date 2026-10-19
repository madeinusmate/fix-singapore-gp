const keyFor = (slug = 'singapore') => (slug === 'singapore' ? 'mbay-draft' : `draft:${slug}`)

export const readDraft = (slug = 'singapore') => {
  try {
    const raw = localStorage.getItem(keyFor(slug))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export const writeDraft = (draft, slug = 'singapore') => {
  localStorage.setItem(keyFor(slug), JSON.stringify(draft))
}

export const clearDraft = (slug = 'singapore') => localStorage.removeItem(keyFor(slug))
