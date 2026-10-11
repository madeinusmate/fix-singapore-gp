const KEY = 'mbay-draft'

export const readDraft = () => {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export const writeDraft = (draft) => {
  localStorage.setItem(KEY, JSON.stringify(draft))
}

export const clearDraft = () => localStorage.removeItem(KEY)
