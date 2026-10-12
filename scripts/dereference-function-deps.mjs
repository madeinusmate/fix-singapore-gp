import { nodeFileTrace } from '@vercel/nft'
import { cpSync, lstatSync, mkdirSync, readdirSync, realpathSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'

// Vercel rejects a function when a traced file is reached through a pnpm symlink.
// Rewrite those links to real copies after the Vite build, before the function is packaged.
if (!process.env.VERCEL) process.exit(0)

const root = process.cwd()

const entries = readdirSync(join(root, 'api'))
  .filter((name) => name.endsWith('.js') || name.endsWith('.mjs'))
  .map((name) => join('api', name))

const isLink = (rel) => {
  try {
    return lstatSync(join(root, rel)).isSymbolicLink()
  } catch {
    return false
  }
}

const materialize = (rel) => {
  const abs = join(root, rel)
  const real = realpathSync(abs)
  rmSync(abs)
  mkdirSync(dirname(abs), { recursive: true })
  cpSync(real, abs, { recursive: true, dereference: true })
  console.log('dereferenced', rel)
}

const packageLinks = [
  'node_modules/ai',
  'node_modules/@ai-sdk/gateway',
  'node_modules/@ai-sdk/provider',
  'node_modules/@ai-sdk/provider-utils',
  'node_modules/@vercel/oidc',
  'node_modules/json-schema',
]
packageLinks.filter(isLink).forEach(materialize)

const symlinkParents = (rel) => {
  const parts = rel.split('/')
  const found = []
  let current = ''
  for (let i = 0; i < parts.length - 1; i += 1) {
    current = current ? `${current}/${parts[i]}` : parts[i]
    if (isLink(current)) found.push(current)
  }
  return found
}

for (let round = 0; round < 8; round += 1) {
  const { fileList } = await nodeFileTrace(entries, { base: root })
  const traced = [...fileList]
  const links = [...new Set([
    ...traced.filter(isLink),
    ...traced.flatMap(symlinkParents),
  ])].sort((a, b) => a.length - b.length)
  if (!links.length) {
    console.log('function trace has no symlinks')
    break
  }
  if (round === 7) {
    console.error('function trace still contains symlinks', links)
    process.exit(1)
  }
  links.forEach(materialize)
}
