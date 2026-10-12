import { readFileSync } from 'node:fs'
import { analyze } from '../src/sim/analyze.js'
import { loadGraph } from '../src/sim/route.js'
import { revisionFromPoints } from '../src/lab/revision.js'

// Pins lapBoards/current so Firestore can reject an absurd time on the
// current layout. Client writes to that document are disabled. Re-run this
// when public/data/current.json or the lap sim changes, then write the
// document with a privileged token:
//   FIREBASE_TOKEN=... node scripts/pin-current-board.mjs --write

const read = (file) => JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'))
const current = read('../public/data/current.json')
const graph = loadGraph(read('../public/data/graph.json'))
const dem = read('../public/data/dem.json')
const pin = {
  revision: revisionFromPoints(current.path, current.racingSense),
  simLapS: analyze(current.path, dem, graph).metrics.lap_s,
}

console.log(JSON.stringify(pin, null, 2))

if (!process.argv.includes('--write')) process.exit(0)

const token = process.env.FIREBASE_TOKEN
if (!token) {
  console.error('Set FIREBASE_TOKEN to a privileged access token. Client writes to lapBoards/current are disabled.')
  process.exit(1)
}

const project = process.env.FIREBASE_PROJECT || 'sgp-2027'
const url = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/lapBoards/current`
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
  console.error(await res.text())
  process.exit(1)
}
console.log('Pinned lapBoards/current')
