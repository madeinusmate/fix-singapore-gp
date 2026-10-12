import { nodeFileTrace } from '@vercel/nft'
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

// Load every function from only the files Vercel would package with it, so a
// dependency that is missing from the bundle fails the build instead of production.
const root = process.cwd()
const entries = readdirSync(join(root, 'api'))
  .filter((name) => (name.endsWith('.js') || name.endsWith('.mjs')) && !name.includes('.test.'))
  .map((name) => join('api', name))

const out = mkdtempSync(join(tmpdir(), 'functions-'))
const failures = []

for (const entry of entries) {
  const { fileList } = await nodeFileTrace([entry], { base: root })
  const bundle = join(out, entry.replace(/[/.]/g, '-'))
  ;[...fileList].forEach((rel) => {
    const target = join(bundle, rel)
    mkdirSync(dirname(target), { recursive: true })
    cpSync(join(root, rel), target, { recursive: true, dereference: true })
  })
  try {
    await import(pathToFileURL(join(bundle, entry)).href)
    console.log('function loads', entry)
  } catch (error) {
    failures.push(entry)
    console.error('function does not load', entry, error.message)
  }
}

rmSync(out, { recursive: true, force: true })
if (failures.length) process.exit(1)
