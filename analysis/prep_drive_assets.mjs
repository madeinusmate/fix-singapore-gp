// Fetches the open-licensed sky, track textures and sounds for the drive scene
// into public/drive. Every source and licence is listed in CREDITS.md.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cache = join(root, 'analysis', '.cache', 'http')
const out = join(root, 'public', 'drive')
const textures = join(out, 'textures')
const audio = join(out, 'audio')
;[cache, textures, audio].forEach((dir) => mkdirSync(dir, { recursive: true }))

const cachedFetch = async (url) => {
  const file = join(cache, createHash('sha1').update(url).digest('hex'))
  if (existsSync(file)) return readFileSync(file)
  process.stdout.write(`downloading ${url}\n`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  writeFileSync(file, buf)
  return buf
}

// Poly Haven, CC0: "Kloofendal 48d Partly Cloudy (Pure Sky)" by Greg Zaal and Jarod Guest.
const SKY_URL = 'https://dl.polyhaven.org/file/ph-assets/HDRIs/extra/Tonemapped%20JPG/kloofendal_48d_partly_cloudy_puresky.jpg'
// Poly Haven, CC0: "Dikhololo Night" by Greg Zaal. Singapore and Las Vegas.
const NIGHT_SKY_URL = 'https://dl.polyhaven.org/file/ph-assets/HDRIs/extra/Tonemapped%20JPG/dikhololo_night.jpg'

// ambientCG, CC0, as served with OSM2World's default style.
const AMBIENT = 'https://tiles.osm2world.org/styles/default/textures/cc0textures'
const TEXTURES = [
  ['asphalt_color.webp', `${AMBIENT}/Asphalt010/Asphalt010_Color.png`],
  ['asphalt_normal.webp', `${AMBIENT}/Asphalt010/Asphalt010_Normal.jpg`],
  ['asphalt_orm.webp', `${AMBIENT}/Asphalt010/Asphalt010_ORM.jpg`],
  ['concrete_color.webp', `${AMBIENT}/Concrete034/Concrete034_Color.jpg`],
  ['concrete_normal.webp', `${AMBIENT}/Concrete034/Concrete034_Normal.jpg`],
  ['fence_color.webp', `${AMBIENT}/Fence006/Fence006_Color.png`],
]
const TEXTURE_PX = 1024

// OpenGameArt, CC BY 3.0: "Car tire squeal skid loop" by audible-edge (Tom Haigh), submitted by qubodup.
const TYRE_URL = 'https://opengameart.org/sites/default/files/tires_squal_loop.wav'
const TYRE_RATE = 22050

// MIT: Antonio-R1/engine-sound-generator, pinned.
const ENGINE_COMMIT = 'c76c5adb9e63f5a54fb0def3b97e8e0ac1a7dea1'
const ENGINE_BASE = `https://raw.githubusercontent.com/Antonio-R1/engine-sound-generator/${ENGINE_COMMIT}`

const sky = await cachedFetch(SKY_URL)
await sharp(sky).resize(4096, 2048).jpeg({ quality: 72, mozjpeg: true }).toFile(join(out, 'sky.jpg'))
const nightSky = await cachedFetch(NIGHT_SKY_URL)
const nightSized = await sharp(nightSky).resize(2048, 1024).toBuffer()
const nightGrade = Buffer.from(`<svg width="2048" height="1024">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#b7bcc4"/>
      <stop offset="36%" stop-color="#6d7380"/>
      <stop offset="46%" stop-color="#24180f"/>
      <stop offset="54%" stop-color="#000"/>
      <stop offset="100%" stop-color="#000"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
</svg>`)
await sharp(nightSized).composite([{ input: nightGrade, blend: 'multiply' }]).jpeg({ quality: 70, mozjpeg: true }).toFile(join(out, 'sky-night.jpg'))

for (const [name, url] of TEXTURES) {
  const source = await cachedFetch(url)
  const image = sharp(source).resize({ width: TEXTURE_PX, height: TEXTURE_PX, fit: 'inside', withoutEnlargement: true })
  if (!name.startsWith('fence')) image.removeAlpha()
  await image.webp({ quality: 80, alphaQuality: 90 }).toFile(join(textures, name))
}

const readWav = (buf) => {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a wav')
  let offset = 12
  let format = null
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4)
    const size = buf.readUInt32LE(offset + 4)
    const body = offset + 8
    if (id === 'fmt ') {
      format = { channels: buf.readUInt16LE(body + 2), rate: buf.readUInt32LE(body + 4), bits: buf.readUInt16LE(body + 14) }
    } else if (id === 'data') {
      if (!format) throw new Error('wav data before format')
      const step = (format.bits / 8) * format.channels
      const frames = Math.floor(size / step)
      const samples = new Float64Array(frames)
      for (let i = 0; i < frames; i += 1) {
        const at = body + i * step
        if (format.bits === 24) samples[i] = buf.readIntLE(at, 3) / 8388608
        else if (format.bits === 16) samples[i] = buf.readInt16LE(at) / 32768
        else throw new Error(`unsupported ${format.bits}-bit wav`)
      }
      return { rate: format.rate, samples }
    }
    offset = body + size + (size % 2)
  }
  throw new Error('wav without data')
}

// Windowed-sinc resampling that wraps at the ends, so the loop stays seamless.
const resampleLoop = (samples, from, to) => {
  const n = samples.length
  const outLength = Math.round((n * to) / from)
  const ratio = n / outLength
  const cutoff = Math.min(1, to / from) * 0.95
  const taps = 32
  const result = new Float64Array(outLength)
  for (let i = 0; i < outLength; i += 1) {
    const centre = i * ratio
    const base = Math.floor(centre)
    let sum = 0
    let weight = 0
    for (let k = -taps; k <= taps; k += 1) {
      const j = base + k
      const d = j - centre
      const x = d * cutoff
      const sinc = Math.abs(x) < 1e-9 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x)
      const window = 0.5 + 0.5 * Math.cos((Math.PI * d) / (taps + 1))
      const w = sinc * window
      sum += samples[((j % n) + n) % n] * w
      weight += w
    }
    result[i] = sum / weight
  }
  return result
}

const writeWav = (samples, rate) => {
  let peak = 0
  for (const v of samples) peak = Math.max(peak, Math.abs(v))
  const scale = peak > 0.98 ? 0.98 / peak : 1
  const buf = Buffer.alloc(44 + samples.length * 2)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + samples.length * 2, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(rate, 24)
  buf.writeUInt32LE(rate * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(samples.length * 2, 40)
  samples.forEach((v, i) => buf.writeInt16LE(Math.round(v * scale * 32767), 44 + i * 2))
  return buf
}

const tyre = readWav(await cachedFetch(TYRE_URL))
writeFileSync(join(audio, 'tyre-squeal-loop.wav'), writeWav(resampleLoop(tyre.samples, tyre.rate, TYRE_RATE), TYRE_RATE))

writeFileSync(join(audio, 'engine_sound_generator_worklet.js'), await cachedFetch(`${ENGINE_BASE}/src/engine_sound_generator/engine_sound_generator_worklet.js`))
writeFileSync(join(audio, 'engine-sound-generator-LICENSE.txt'), await cachedFetch(`${ENGINE_BASE}/LICENSE`))

process.stdout.write('drive assets ready\n')
