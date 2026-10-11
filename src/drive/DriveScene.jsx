import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { DoubleSide, Vector3 } from 'three'
import { carAt, stepCar } from './car.js'
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

const Course = ({ course }) => {
  const road = useMemo(() => roadGeometry(course), [course])
  const kerbs = useMemo(() => kerbGeometry(course), [course])
  const decks = useMemo(() => deckGeometry(course), [course])
  const line = useMemo(() => startLineGeometry(course), [course])
  useEffect(() => () => [road, kerbs, decks, line].forEach((geometry) => geometry.dispose()), [road, kerbs, decks, line])
  return (
    <>
      <mesh geometry={road}>
        <meshStandardMaterial color="#30323d" side={DoubleSide} />
      </mesh>
      <mesh geometry={kerbs}>
        <meshStandardMaterial vertexColors side={DoubleSide} />
      </mesh>
      <mesh geometry={decks}>
        <meshStandardMaterial color="#1d1f27" side={DoubleSide} />
      </mesh>
      <mesh geometry={line}>
        <meshBasicMaterial color="#ffffff" side={DoubleSide} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <planeGeometry args={[8000, 8000]} />
        <meshStandardMaterial color="#13151c" />
      </mesh>
      <gridHelper args={[8000, 400, '#20232d', '#1a1c25']} position={[0, -0.03, 0]} />
    </>
  )
}

export const DriveScene = ({ course, trace, spec, color, read, resetKey, onLap, onHud }) => (
  <Canvas dpr={[1, 2]} camera={{ fov: 62, near: 0.3, far: 3000 }}>
    <color attach="background" args={['#0b0b10']} />
    <fog attach="fog" args={['#0b0b10', 150, 1200]} />
    <hemisphereLight args={['#c9d4ff', '#1a1a22', 1.4]} />
    <directionalLight position={[300, 500, 200]} intensity={1.6} />
    <Course course={course} />
    <Rig course={course} trace={trace} spec={spec} color={color} read={read} resetKey={resetKey} onLap={onLap} onHud={onHud} />
  </Canvas>
)
