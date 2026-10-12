import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(fileURLToPath(new URL('../package.json', import.meta.url)))
const hbWasm = require.resolve('harfbuzzjs/hb.wasm')

const patch = (source) => {
  const code = typeof source === 'string' ? source : Buffer.from(source).toString('utf8')
  if (code.includes('var require = __createRequire(import.meta.url)') || !code.includes('Dynamic require of')) return code
  return `import { createRequire as __createRequire } from 'node:module'
import { fileURLToPath as __fileURLToPath } from 'node:url'
import { dirname as __dirnameOf } from 'node:path'
var require = __createRequire(import.meta.url)
var __filename = __fileURLToPath(import.meta.url)
var __dirname = __dirnameOf(__filename)
${code.replace('return locateFile("hb.wasm");', `return ${JSON.stringify(hbWasm)};`)}`
}

const asSource = (source) => {
  if (typeof source === 'string') return source
  if (source == null) return ''
  return Buffer.from(source).toString('utf8')
}

export const load = (url, context, nextLoad) => {
  const loaded = nextLoad(url, context)
  if (!loaded?.source || (!url.includes('vercel/og') && !url.includes('vercel+og'))) return loaded
  return { ...loaded, source: patch(asSource(loaded.source)) }
}
