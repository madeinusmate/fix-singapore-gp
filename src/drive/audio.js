// Car sound for the drive page. The engine is Antonio-R1's physically modelled
// engine-sound-generator (MIT) running as an AudioWorklet, tuned toward a
// 1.6 litre V6 at F1 revs. A firing-order buzz, turbo whine, wind noise, the
// audible-edge tyre squeal loop (CC BY 3.0) and a wall thump sit on top.
const BASE = `${import.meta.env.BASE_URL}drive/audio/`
const WORKLET_URL = `${BASE}engine_sound_generator_worklet.js`
const TYRE_URL = `${BASE}tyre-squeal-loop.wav`
export const MUTE_KEY = 'drive-muted'

const ENGINE = {
  cylinders: 6,
  intakeWaveguideLength: 40,
  exhaustWaveguideLength: 60,
  extractorWaveguideLength: 40,
  intakeOpenReflectionFactor: 0.01,
  intakeClosedReflectionFactor: 0.95,
  exhaustOpenReflectionFactor: 0.01,
  exhaustClosedReflectionFactor: 0.95,
  ignitionTime: 0.016,
  straightPipeWaveguideLength: 64,
  straightPipeReflectionFactor: 0.01,
  mufflerElementsLength: [8, 12, 16, 20],
  action: 0.1,
  outletWaveguideLength: 5,
  outletReflectionFactor: 0.01,
}
// The generator's three outputs (intake, block vibration, exhaust outlet) peak
// near 6, 2.4 and 3 with a large DC offset. The block channel is a sub-125 Hz
// road-car rumble, so it sits low under the exhaust.
const OUTPUT_GAINS = [0.05, 0.03, 0.16]
const LOW_CUT_HZ = 90
const MASTER = 0.8
const SMOOTH_S = 0.03

export const readMuted = () => {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

export const saveMuted = (muted) => {
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
  } catch {
    // Private mode: the toggle still works for this visit.
  }
}

const noiseBuffer = (ctx, seconds) => {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1
  return buffer
}

const gainNode = (ctx, value) => {
  const node = ctx.createGain()
  node.gain.value = value
  return node
}

// Builds the audio graph. Must be called from a user gesture so the browser
// lets the context start.
export const createCarAudio = async ({ muted = false } = {}) => {
  const ctx = new AudioContext({ latencyHint: 'interactive' })
  await ctx.audioWorklet.addModule(WORKLET_URL)
  const master = gainNode(ctx, muted ? 0 : MASTER)
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -10
  limiter.ratio.value = 8
  master.connect(limiter).connect(ctx.destination)

  const engine = new AudioWorkletNode(ctx, 'engine-sound-processor', {
    numberOfInputs: 0,
    numberOfOutputs: 3,
    processorOptions: ENGINE,
  })
  const dcBlock = ctx.createBiquadFilter()
  dcBlock.type = 'highpass'
  dcBlock.frequency.value = LOW_CUT_HZ
  const engineBus = gainNode(ctx, 0.5)
  const taps = OUTPUT_GAINS.map((value) => {
    const tap = gainNode(ctx, value)
    tap.connect(dcBlock)
    return tap
  })
  let engineLive = false
  const connectEngine = () => {
    if (engineLive) return
    taps.forEach((tap, k) => engine.connect(tap, k))
    engineLive = true
  }
  const disconnectEngine = () => {
    if (!engineLive) return
    engine.disconnect()
    engineLive = false
  }
  // The waveguide worklet keeps running while it is pulled by the graph.
  // Disconnecting it is what actually stops the cost when the page is muted.
  if (!muted) connectEngine()
  dcBlock.connect(engineBus).connect(master)
  const rpmParam = engine.parameters.get('rpm')

  const buzz = ctx.createOscillator()
  buzz.type = 'sawtooth'
  const buzzFilter = ctx.createBiquadFilter()
  buzzFilter.type = 'lowpass'
  buzzFilter.Q.value = 0.7
  const buzzGain = gainNode(ctx, 0)
  buzz.connect(buzzFilter).connect(buzzGain).connect(master)

  const whine = ctx.createOscillator()
  whine.type = 'sine'
  const whineGain = gainNode(ctx, 0)
  whine.connect(whineGain).connect(master)

  const wind = ctx.createBufferSource()
  wind.buffer = noiseBuffer(ctx, 2)
  wind.loop = true
  const windFilter = ctx.createBiquadFilter()
  windFilter.type = 'bandpass'
  windFilter.frequency.value = 700
  windFilter.Q.value = 0.6
  const windGain = gainNode(ctx, 0)
  wind.connect(windFilter).connect(windGain).connect(master)

  const tyreGain = gainNode(ctx, 0)
  tyreGain.connect(master)
  let tyre = null
  fetch(TYRE_URL)
    .then((res) => res.arrayBuffer())
    .then((bytes) => ctx.decodeAudioData(bytes))
    .then((buffer) => {
      if (ctx.state === 'closed') return
      tyre = ctx.createBufferSource()
      tyre.buffer = buffer
      tyre.loop = true
      tyre.connect(tyreGain)
      tyre.start()
    })
    .catch(() => {})

  const thumpBuffer = noiseBuffer(ctx, 0.4)
  ;[buzz, whine, wind].forEach((node) => node.start())
  if (ctx.state === 'suspended') await ctx.resume()

  let gear = 1
  const set = (param, value) => param.setTargetAtTime(value, ctx.currentTime, SMOOTH_S)

  return {
    // car: the drive car state; once per frame.
    update(car, throttle) {
      const rpm = car.rpm
      const load = 0.45 + 0.55 * throttle
      const firing = (rpm / 60) * (ENGINE.cylinders / 2)
      const speed = Math.abs(car.speed)
      set(rpmParam, rpm)
      set(engineBus.gain, 0.5 * load * (car.cut > 0 ? 0.35 : 1))
      set(buzz.frequency, firing)
      set(buzzFilter.frequency, firing * 3)
      set(buzzGain.gain, 0.035 * throttle)
      set(whine.frequency, 1800 + speed * 28)
      set(whineGain.gain, 0.006 * throttle * Math.min(1, speed / 30))
      set(windGain.gain, 0.22 * Math.min(1, (speed / 90) ** 2))
      set(windFilter.frequency, 500 + speed * 9)
      set(tyreGain.gain, 0.4 * car.slide)
      if (tyre) set(tyre.playbackRate, 0.85 + 0.3 * car.slide)
      if (car.gear > gear && car.gear > 1) this.pop()
      gear = car.gear
    },
    // A short exhaust crack on an upshift.
    pop() {
      const src = ctx.createBufferSource()
      src.buffer = thumpBuffer
      const filter = ctx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.value = 1400
      const env = gainNode(ctx, 0.0001)
      const t = ctx.currentTime
      env.gain.setValueAtTime(0.18, t)
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.07)
      src.connect(filter).connect(env).connect(master)
      src.start(t)
      src.stop(t + 0.1)
    },
    // speed: how hard the car met the wall, m/s.
    impact(speed) {
      const src = ctx.createBufferSource()
      src.buffer = thumpBuffer
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 260
      const env = gainNode(ctx, 0.0001)
      const t = ctx.currentTime
      env.gain.setValueAtTime(Math.min(1.2, speed / 12), t)
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.35)
      src.connect(filter).connect(env).connect(master)
      src.start(t)
      src.stop(t + 0.4)
    },
    setMuted(on) {
      set(master.gain, on ? 0 : MASTER)
      if (on) disconnectEngine()
      else connectEngine()
    },
    close() {
      ctx.close().catch(() => {})
    },
  }
}
