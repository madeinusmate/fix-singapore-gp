// Drivable streets for the whole of Singapore, in the Overpass shape export_web.py reads.
// The editor used to plot only the Marina Bay window baked into osm.json.
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, 'osm.json')

// Same box the map refuses to zoom out of: the main island and the near islands.
const SOUTH = 1.17
const WEST = 103.55
const NORTH = 1.48
const EAST = 104.1
const STEP = 0.08
// OSM relation 536780 is Singapore. The area id is that plus 3,600,000,000.
const SINGAPORE = 3600536780
const HIGHWAYS = '^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|raceway)(_link)?$'
const ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
]

const tiles = () => {
  const boxes = []
  for (let lat = SOUTH; lat < NORTH - 1e-9; lat += STEP) {
    for (let lon = WEST; lon < EAST - 1e-9; lon += STEP) {
      boxes.push([lat, lon, Math.min(NORTH, lat + STEP), Math.min(EAST, lon + STEP)])
    }
  }
  return boxes
}

const queryFor = ([south, west, north, east]) => `[out:json][timeout:90];
area(${SINGAPORE})->.sg;
way["highway"~"${HIGHWAYS}"](${south},${west},${north},${east})(area.sg);
out geom;`

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const fetchTile = async (box) => {
  const body = `data=${encodeURIComponent(queryFor(box))}`
  let last
  for (const endpoint of ENDPOINTS) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            'user-agent': 'fix-singapore-gp road extract',
          },
          body,
        })
        if (res.status === 429 || res.status === 504) {
          await sleep(4000 * (attempt + 1))
          continue
        }
        if (!res.ok) throw new Error(`${endpoint} ${res.status}`)
        const json = await res.json()
        if (!Array.isArray(json.elements)) throw new Error(`${endpoint} returned no elements`)
        return json.elements
      } catch (error) {
        last = error
        await sleep(2000 * (attempt + 1))
      }
    }
  }
  throw last
}

const ways = new Map()
const boxes = tiles()
for (let i = 0; i < boxes.length; i += 1) {
  const elements = await fetchTile(boxes[i])
  let added = 0
  elements.forEach((element) => {
    if (element.type !== 'way' || !element.geometry?.length || ways.has(element.id)) return
    ways.set(element.id, element)
    added += 1
  })
  process.stdout.write(`tile ${i + 1}/${boxes.length} +${added} ways ${ways.size}\n`)
  await sleep(1200)
}

const doc = {
  version: 0.6,
  generator: 'analysis/fetch_roads.mjs',
  osm3s: {
    copyright: 'The data included in this document is from www.openstreetmap.org. The data is made available under ODbL.',
  },
  elements: [...ways.values()],
}
writeFileSync(out, JSON.stringify(doc))
process.stdout.write(`wrote ${ways.size} ways to ${out}\n`)
