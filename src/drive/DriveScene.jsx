import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, DoubleSide, Vector3 } from 'three'
import { carAt, stepCar } from './car.js'
import { cityShift, loadCity } from './city.js'
import { locate } from './course.js'
import { ghostAt, simTimeAt } from './ghost.js'
import { startLap, stepLap } from './lap.js'
import { deckGeometry, kerbGeometry, roadGeometry, startLineGeometry } from './meshes.js'

const HUD_EVERY_S = 0.1
const CHASE_BACK_M = 11
const CHASE_UP_M = 4.2
const LOOK_AHEAD_M = 8

const freshGame = (course) => ({
  car: carAt(course.spawn),
  where: locate(course, course.spawn.x, course.spawn.y, course.spawn.index),
  lap: startLap(),
  hudClock: HUD_EVERY_S,
})

const Car = ({ color, ghost = false, refTo }) => (
  <group ref={refTo}>
    <mesh position={[0, 0.45, 0]}>
      <boxGeometry args={[4.8, 0.55, 1.8]} />
      <meshStandardMaterial color={color} transparent={ghost} opacity={ghost ? 0.35 : 1} depthWrite={!ghost} />
    </mesh>
    <mesh position={[-0.4, 0.85, 0]}>
      <boxGeometry args={[1.4, 0.4, 0.8]} />
      <meshStandardMaterial color={ghost ? color : '#111'} transparent={ghost} opacity={ghost ? 0.35 : 1} depthWrite={!ghost} />
    </mesh>
    <mesh position={[-2.25, 0.95, 0]}>
      <boxGeometry args={[0.4, 0.08, 1.9]} />
      <meshStandardMaterial color={color} transparent={ghost} opacity={ghost ? 0.35 : 1} depthWrite={!ghost} />
    </mesh>
  </group>
)

const place = (object, x, y, h, heading) => {
  object.position.set(x, h, -y)
  object.rotation.y = heading
}

const Rig = ({ course, trace, spec, color, read, resetKey, onLap, onHud }) => {
  const game = useRef(freshGame(course))
  const car = useRef(null)
  const ghost = useRef(null)
  const look = useMemo(() => new Vector3(), [])
  const chase = useMemo(() => new Vector3(), [])
  const callbacks = useRef({ onLap, onHud })
  const snapped = useRef(false)

  useEffect(() => {
    callbacks.current = { onLap, onHud }
  })

  useEffect(() => {
    game.current = freshGame(course)
    snapped.current = false
  }, [course, resetKey])

  useFrame(({ camera }, delta) => {
    const dt = Math.min(0.05, delta)
    const g = game.current
    g.car = stepCar(g.car, read(), dt, spec, g.where.onRoad)
    g.where = locate(course, g.car.x, g.car.y, g.where.index)
    g.lap = stepLap(g.lap, g.where, dt, course)
    if (g.lap.completed) callbacks.current.onLap(g.lap.completed)
    const h = course.h[g.where.index]
    place(car.current, g.car.x, g.car.y, h, g.car.heading)
    const sim = ghostAt(course, trace, g.lap.phase === 'timed' ? g.lap.time : 0)
    place(ghost.current, sim.x, sim.y, sim.h, sim.heading)

    const fx = Math.cos(g.car.heading)
    const fy = Math.sin(g.car.heading)
    chase.set(g.car.x - fx * CHASE_BACK_M, h + CHASE_UP_M, -(g.car.y - fy * CHASE_BACK_M))
    look.set(g.car.x + fx * LOOK_AHEAD_M, h + 1, -(g.car.y + fy * LOOK_AHEAD_M))
    if (snapped.current) camera.position.lerp(chase, 1 - Math.exp(-dt * 6))
    else camera.position.copy(chase)
    snapped.current = true
    camera.lookAt(look)

    g.hudClock += dt
    if (g.hudClock < HUD_EVERY_S) return
    g.hudClock = 0
    const timed = g.lap.phase === 'timed'
    callbacks.current.onHud({
      kmh: Math.abs(g.car.speed) * 3.6,
      timed,
      time: g.lap.time,
      gap: timed ? g.lap.time - simTimeAt(trace, course.n, g.where.index) : null,
      offRoad: g.where.fullyOff,
      spoiled: timed && (g.lap.offTooLong || g.lap.hits.some((hit, k) => !hit && course.checkpoints[k] < g.where.index - 20)),
    })
  })

  return (
    <>
      <Car refTo={car} color={color} />
      <Car refTo={ghost} color="#ffffff" ghost />
    </>
  )
}

const cleanChunk = (chunk) => {
  const src = chunk.positions
  for (let i = 0; i < src.length; i += 3) {
    if (!Number.isFinite(src[i]) || !Number.isFinite(src[i + 1]) || !Number.isFinite(src[i + 2])) return null
  }
  return chunk
}

const withoutGaps = (chunk) => {
  const src = chunk.positions
  const colors = chunk.colors
  const map = new Map()
  const positions = []
  const cols = []
  const indices = []
  const take = (index) => {
    const x = src[index * 3]
    const y = src[index * 3 + 1]
    const z = src[index * 3 + 2]
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return -1
    let id = map.get(index)
    if (id == null) {
      id = positions.length / 3
      map.set(index, id)
      positions.push(x, y, z)
      cols.push(colors[index * 3], colors[index * 3 + 1], colors[index * 3 + 2])
    }
    return id
  }
  for (let t = 0; t + 2 < chunk.indices.length; t += 3) {
    const a = take(chunk.indices[t])
    const b = take(chunk.indices[t + 1])
    const c = take(chunk.indices[t + 2])
    if (a < 0 || b < 0 || c < 0) continue
    indices.push(a, b, c)
  }
  return {
    positions: new Float32Array(positions),
    colors: new Uint8Array(cols),
    indices: new Uint32Array(indices),
  }
}

const geometryOf = (chunk) => {
  const safe = cleanChunk(chunk) || withoutGaps(chunk)
  const geometry = new BufferGeometry()
  if (!safe.indices.length) return geometry
  geometry.setAttribute('position', new BufferAttribute(safe.positions, 3))
  geometry.setAttribute('color', new BufferAttribute(safe.colors, 3, true))
  geometry.setIndex(new BufferAttribute(safe.indices, 1))
  geometry.computeVertexNormals()
  return geometry
}

// The city is the same OpenStreetMap streets as the lap, baked flat. The road
// is drawn a touch in front so the racing surface wins where the two meet.
const City = ({ course, city }) => {
  const geometries = useMemo(() => city.chunks.map(geometryOf), [city])
  const position = useMemo(() => cityShift(course.origin, city.originLng, city.originLat), [course, city])
  useEffect(() => () => geometries.forEach((geometry) => geometry.dispose()), [geometries])
  return (
    <group position={position}>
      {geometries.map((geometry, index) => (
        <mesh key={index} geometry={geometry}>
          <meshStandardMaterial vertexColors side={DoubleSide} />
        </mesh>
      ))}
    </group>
  )
}

const Course = ({ course, city }) => {
  const road = useMemo(() => roadGeometry(course), [course])
  const kerbs = useMemo(() => kerbGeometry(course), [course])
  const decks = useMemo(() => deckGeometry(course), [course])
  const line = useMemo(() => startLineGeometry(course), [course])
  useEffect(() => () => [road, kerbs, decks, line].forEach((geometry) => geometry.dispose()), [road, kerbs, decks, line])
  return (
    <>
      <mesh geometry={road}>
        <meshStandardMaterial color="#30323d" side={DoubleSide} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </mesh>
      <mesh geometry={kerbs}>
        <meshStandardMaterial vertexColors side={DoubleSide} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </mesh>
      <mesh geometry={decks}>
        <meshStandardMaterial color="#1d1f27" side={DoubleSide} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </mesh>
      <mesh geometry={line}>
        <meshBasicMaterial color="#ffffff" side={DoubleSide} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-4} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.4, 0]}>
        <planeGeometry args={[8000, 8000]} />
        <meshStandardMaterial color="#14181f" />
      </mesh>
      {!city && <gridHelper args={[8000, 400, '#20232d', '#1a1c25']} position={[0, -0.03, 0]} />}
    </>
  )
}

export const DriveScene = ({ course, trace, spec, color, read, resetKey, onLap, onHud }) => {
  const [city, setCity] = useState(null)
  useEffect(() => {
    let live = true
    loadCity().then((next) => { if (live) setCity(next) }).catch(() => {})
    return () => { live = false }
  }, [])
  return (
    <Canvas dpr={[1, 1.5]} camera={{ fov: 62, near: 0.3, far: 5000 }}>
      <color attach="background" args={['#0b0b10']} />
      <fog attach="fog" args={['#0b0b10', 500, 3800]} />
      <hemisphereLight args={['#d5def8', '#2a241c', 1.6]} />
      <directionalLight position={[400, 700, -200]} intensity={1.8} />
      {city && <City course={course} city={city} />}
      <Course course={course} city={city} />
      <Rig course={course} trace={trace} spec={spec} color={color} read={read} resetKey={resetKey} onLap={onLap} onHud={onHud} />
    </Canvas>
  )
}
