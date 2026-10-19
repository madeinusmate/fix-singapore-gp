import { readFileSync } from 'node:fs'
import { CIRCUITS } from '../src/circuits.js'
import { boardId } from '../src/firebase/boardId.js'
import { revisionFromPoints } from '../src/lab/revision.js'
import { analyze } from '../src/sim/analyze.js'
import { loadGraph } from '../src/sim/route.js'

// Pins each circuit's raced lap so Firestore can reject an absurd time.
// Client writes to those documents are disabled. Re-run this when a
// current.json or the lap sim changes, then write the documents with a
// privileged token:
//   FIREBASE_TOKEN=... node scripts/pin-current-board.mjs --write

const read = (file) => JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'))

const filesFor = (slug) => (slug === 'singapore'
  ? ['../public/data/current.json', '../public/data/graph.json', '../public/data/dem.json']
  : [`../public/data/${slug}/current.json`, `../public/data/${slug}/graph.json`, `../public/data/${slug}/dem.json`])

const pinFor = (slug) => {
  const [currentFile, graphFile, demFile] = filesFor(slug)
  const current = read(currentFile)
  const graph = loadGraph(read(graphFile))
  const dem = read(demFile)
  return {
    id: boardId(slug, 'current'),
    revision: revisionFromPoints(current.path, current.racingSense),
    simLapS: analyze(current.path, dem, graph).metrics.lap_s,
  }
}

const pins = CIRCUITS.filter((circuit) => circuit.open).map((circuit) => pinFor(circuit.slug))

console.log(JSON.stringify(pins, null, 2))

if (!process.argv.includes('--write')) process.exit(0)

const token = process.env.FIREBASE_TOKEN
if (!token) {
  console.error('Set FIREBASE_TOKEN to a privileged access token. Client writes to lap boards are disabled.')
  process.exit(1)
}

const project = process.env.FIREBASE_PROJECT || 'sgp-2027'

for (const pin of pins) {
  const url = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/lapBoards/${pin.id}`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        revision: { stringValue: pin.revision },
        simLapS: { doubleValue: pin.simLapS },
      },
    }),
  })
  if (!res.ok) {
    console.error(pin.id, await res.text())
    process.exit(1)
  }
  console.log(`Pinned lapBoards/${pin.id}`)
}
