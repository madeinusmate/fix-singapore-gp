// Singapore and Las Vegas are raced after dark. The other street circuits
// stay in the daytime sky the drive scene already used.
const NIGHT = new Set(['singapore', 'las-vegas'])

const day = {
  night: false,
  sky: 'sky.jpg',
  haze: '#a9b0bf',
  fogNear: 350,
  fogFar: 5200,
  ground: '#3a433c',
  hemiSky: '#dfe7f5',
  hemiGround: '#5a5246',
  hemi: 0.55,
  sunColor: '#fff4e2',
  sun: 1.6,
  sunDir: [0.534, 0.743, 0.403],
  fillColor: '#fff4e2',
  fill: 0.8,
  shadowHalf: 55,
  wideHalf: 180,
  env: 0.75,
  water: '#6e92a8',
  window: 0,
}

const night = {
  night: true,
  sky: 'sky-night.jpg',
  haze: '#0a1018',
  fogNear: 80,
  fogFar: 1500,
  ground: '#081018',
  hemiSky: '#1a2740',
  hemiGround: '#07090d',
  hemi: 0.18,
  sunColor: '#d5e2ff',
  sun: 0.7,
  sunDir: [0.32, 0.91, 0.22],
  fillColor: '#9eb0cc',
  fill: 0.22,
  shadowHalf: 48,
  wideHalf: 170,
  env: 0.42,
  water: '#071722',
  window: 1.15,
}

export const atmosphereFor = (slug) => (NIGHT.has(slug) ? night : day)
