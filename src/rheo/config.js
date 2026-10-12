export const rheoPublishableKey = () => {
  const key = import.meta.env.VITE_RHEO_PUBLISHABLE_KEY
  return typeof key === 'string' ? key.trim() : ''
}

// apiBaseUrl stays unset so the SDK uses https://api.getrheo.io.
export const rheoConfig = () => ({
  publishableKey: rheoPublishableKey(),
  analytics: { consent: 'granted' },
})
