import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// Vite only exposes VITE_ variables to the browser. The name check runs in
// this Node process, so copy the server keys out of .env before it handles a request.
const serverEnvPrefixes = ['VITE_', 'AI_GATEWAY_', 'VERCEL_', 'FIREBASE_']

const applyServerEnv = (mode, envDir) => {
  const env = serverEnvPrefixes.reduce((all, prefix) => Object.assign(all, loadEnv(mode, envDir, prefix)), {})
  for (const [key, value] of Object.entries(env)) {
    if (!process.env[key]) process.env[key] = value
  }
}

// The publish button calls /api/moderate-name. Vite does not serve the Vercel
// function, so local dev forwards that path to the same handler.
const moderateNameDev = () => ({
  name: 'moderate-name',
  configureServer: (server) => {
    if (server.config.envDir !== false) applyServerEnv(server.config.mode, server.config.envDir)
    server.middlewares.use('/api/moderate-name', async (req, res) => {
      if (req.method !== 'POST') {
        res.statusCode = 405
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Method not allowed.' }))
        return
      }
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      try {
        const { POST } = await import('./api/moderate-name.js')
        const response = await POST(new Request('http://localhost/api/moderate-name', {
          method: 'POST',
          headers: {
            'content-type': req.headers['content-type'] || 'application/json',
            ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}),
          },
          body: Buffer.concat(chunks),
        }))
        res.statusCode = response.status
        const type = response.headers.get('content-type')
        if (type) res.setHeader('content-type', type)
        res.end(Buffer.from(await response.arrayBuffer()))
      } catch {
        console.error('Name check failed')
        res.statusCode = 503
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Could not check that name. Try again.' }))
      }
    })
  },
})

// https://vite.dev/config/
export default defineConfig({
  base: '/', plugins: [react(), moderateNameDev()],
})
