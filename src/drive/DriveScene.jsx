import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import {
  BoxGeometry,
  CanvasTexture,
  DoubleSide,
  EquirectangularReflectionMapping,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  PMREMGenerator,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
} from 'three'
import { bigWheelGeometry } from './bigWheel.js'
import { BRAKING_BOARD_H_M, BRAKING_BOARD_W_M, BRAKING_POST_H_M, DISTANCE_M, brakingSign, markerSide } from './braking.js'
import { carAt, stepCar, WHEEL_RADIUS_M } from './car.js'
import { disposeCar, dressCar, loadCarModel, poseCar } from './carModel.js'
import { cityShift, loadCity } from './city.js'
import { corridorMask, corridorTexture, cutCorridor, sceneCorridor } from './corridor.js'
import { locate } from './course.js'
import { ghostAt, simTimeAt } from './ghost.js'
import { startLap, stepLap } from './lap.js'
import {
  FENCE_HEIGHT_M,
  fenceGeometry,
  gridGeometry,
  kerbGeometry,
  brakingMarkGeometry,
  lineGeometry,
  postMatrices,
  roadGeometry,
  runOffGeometry,
  wallGeometry,
} from './meshes.js'
import { buildWalls, hitWalls } from './walls.js'
const HUD_EVERY_S = 0.1
const CHASE_BACK_M = 8.5
const CHASE_UP_M = 2.6
const LOOK_AHEAD_M = 6
const BASE_FOV = 60
// Onboard camera mounts as [ahead of the axle midpoint, up], in metres: the
// T-cam sits on the airbox (top at 1.29 m), the nose cam ahead of the front wheels.
const TCAM_M = [0.05, 1.45]
const NOSE_M = [2.6, 0.62]
// Sun direction in the Poly Haven sky (48 degrees up), in scene axes.
const SUN = new Vector3(0.534, 0.743, 0.403).normalize()
const SUN_DISTANCE_M = 250
const SHADOW_HALF_M = 70
const HAZE = '#a9b0bf'
// Two 15 km triangles lose enough depth precision to poke through the road
// near the camera, so the ground is cut into 300 m cells.
const GROUND_M = 30000
const GROUND_CELLS = 100
// Wall hits slower than this, in m/s, are scrapes and make no thump.
const IMPACT_SOUND_SPEED = 2
const ASSETS = `${import.meta.env.BASE_URL}drive/`

const boardTexture = (metres, family) => {
  const canvas = document.createElement('canvas')
  canvas.width = 320
  canvas.height = 256
  const g = canvas.getContext('2d')
  g.fillStyle = '#14141a'
  g.fillRect(0, 0, 320, 256)
  g.fillStyle = '#f4f1ea'
  g.fillRect(14, 14, 292, 228)
  g.fillStyle = '#e10600'
  g.fillRect(14, 14, 292, 46)
  g.fillStyle = '#14141a'
  g.font = `900 112px ${family}`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(String(metres), 160, 148)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

const BrakingBoards = ({ course, walls, points = [] }) => {
  const [fontTick, setFontTick] = useState(0)
  useEffect(() => {
    let live = true
    document.fonts?.load("900 112px 'Titillium Web'").then(() => { if (live) setFontTick(1) }).catch(() => {})
    return () => { live = false }
  }, [])
  const textures = useMemo(() => {
    const family = fontTick ? "'Titillium Web', sans-serif" : 'sans-serif'
    return new Map(DISTANCE_M.map((metres) => [metres, boardTexture(metres, family)]))
  }, [fontTick])
  useEffect(() => () => textures.forEach((texture) => texture.dispose()), [textures])
  const placed = useMemo(() => points.map((point) => ({
    ...point,
    side: markerSide(walls?.openLeft[point.index], walls?.openRight[point.index]),
  })), [points, walls])
  const marks = useMemo(() => (placed.length ? brakingMarkGeometry(course, placed) : null), [course, placed])
  useEffect(() => () => marks?.dispose(), [marks])
  const signs = useMemo(() => placed.map((point) => brakingSign(course, point.index, point.side)), [course, placed])
  const posts = useMemo(() => signs.map((sign) => new Matrix4().compose(
    new Vector3(sign.post.x, sign.post.h, -sign.post.y),
    new Quaternion(),
    new Vector3(1, 1, 1),
  )), [signs])
  const postParts = useMemo(() => ({
    geometry: new BoxGeometry(0.08, BRAKING_POST_H_M, 0.08),
    material: new MeshStandardMaterial({ color: '#2c2e33', metalness: 0.55, roughness: 0.45 }),
  }), [])
  useEffect(() => () => { postParts.geometry.dispose(); postParts.material.dispose() }, [postParts])
  const postsRef = useRef(null)
  useLayoutEffect(() => {
    const mesh = postsRef.current
    if (!mesh) return
    posts.forEach((matrix, i) => mesh.setMatrixAt(i, matrix))
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [posts])
  if (!points.length || !marks) return null
  return (
    <>
      <mesh geometry={marks} receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.7} polygonOffset polygonOffsetFactor={-6} polygonOffsetUnits={-6} />
      </mesh>
      <instancedMesh ref={postsRef} args={[postParts.geometry, postParts.material, posts.length]} castShadow />
      {signs.map((sign, i) => (
        <mesh key={`${placed[i].turn}-${placed[i].metres}`} position={[sign.board.x, sign.board.h, -sign.board.y]} rotation-y={sign.yaw} castShadow>
          <planeGeometry args={[BRAKING_BOARD_W_M, BRAKING_BOARD_H_M]} />
          <meshStandardMaterial
            map={textures.get(placed[i].metres)}
            roughness={0.55}
            metalness={0.04}
            emissive="#ffffff"
            emissiveMap={textures.get(placed[i].metres)}
            emissiveIntensity={0.28}
            side={DoubleSide}
          />
        </mesh>
      ))}
    </>
  )
}

const freshGame = (course) => ({
  car: carAt(course.spawn),
  where: locate(course, course.spawn.x, course.spawn.y, course.spawn.index),
  lap: startLap(),
  hudClock: HUD_EVERY_S,
  ghostWheel: 0,
  ghostLast: null,
})

// Loads once per mount; the loaders cache their own promises.
const useLoaded = (load) => {
  const [value, setValue] = useState(null)
  useEffect(() => {
    let live = true
    load().then((next) => { if (live) setValue(next) }).catch(() => {})
    return () => { live = false }
  }, [load])
  return value
}

const loadSky = () => new TextureLoader().loadAsync(`${ASSETS}sky.jpg`).then((sky) => {
  sky.mapping = EquirectangularReflectionMapping
  sky.colorSpace = SRGBColorSpace
  return sky
})

const TEXTURE_FILES = {
  asphalt: 'asphalt_color.webp',
  asphaltNormal: 'asphalt_normal.webp',
  asphaltOrm: 'asphalt_orm.webp',
  concrete: 'concrete_color.webp',
  concreteNormal: 'concrete_normal.webp',
  fence: 'fence_color.webp',
}
let texturesPending
const loadTextures = () => {
  texturesPending ||= Promise.all(Object.entries(TEXTURE_FILES).map(([key, file]) => (
    new TextureLoader().loadAsync(`${ASSETS}textures/${file}`).then((texture) => {
      texture.wrapS = RepeatWrapping
      texture.wrapT = RepeatWrapping
      texture.anisotropy = 8
      if (!/Normal|Orm/.test(key)) texture.colorSpace = SRGBColorSpace
      return [key, texture]
    })
  ))).then(Object.fromEntries).catch((err) => {
    texturesPending = null
    throw err
  })
  return texturesPending
}

// Poly Haven sky as the backdrop and, prefiltered, as the light the
// car's paint and the glass towers reflect.
const Sky = () => {
  const sky = useLoaded(loadSky)
  const gl = useThree((state) => state.gl)
  const env = useMemo(() => {
    if (!sky) return null
    const pmrem = new PMREMGenerator(gl)
    const target = pmrem.fromEquirectangular(sky)
    pmrem.dispose()
    return target
  }, [sky, gl])
  useEffect(() => () => env?.dispose(), [env])
  if (!env) return <color attach="background" args={[HAZE]} />
  return (
    <>
      <primitive attach="background" object={sky} />
      <primitive attach="environment" object={env.texture} />
    </>
  )
}

const City = ({ course, walls, city }) => {
  const position = useMemo(() => cityShift(course.origin, city.originLng, city.originLat), [course, city])
  const corridor = useMemo(() => {
    const mask = corridorMask(course, walls)
    return { mask, texture: corridorTexture(mask) }
  }, [course, walls])
  useEffect(() => () => corridor.texture.dispose(), [corridor])
  useEffect(() => {
    const uniforms = sceneCorridor(city.scene, corridor.mask, corridor.texture)
    city.scene.traverse((object) => {
      if (!object.isMesh) return
      object.receiveShadow = true
      object.castShadow = true
      const material = object.material
      if (/Water/i.test(material.name)) {
        material.color.set('#7f9bb0')
        material.roughness = 0.06
        material.metalness = 0.2
      }
      cutCorridor(material, uniforms)
    })
  }, [city, corridor])
  return (
    <>
      <primitive object={city.scene} position={position} />
      {city.bigWheels.map((wheel) => <BigWheel key={`${wheel.lng},${wheel.lat}`} course={course} wheel={wheel} />)}
    </>
  )
}

const BigWheel = ({ course, wheel }) => {
  const geometry = useMemo(() => bigWheelGeometry(wheel), [wheel])
  useEffect(() => () => { geometry.frame.dispose(); geometry.capsules.dispose() }, [geometry])
  const position = useMemo(() => {
    const [x, , z] = cityShift(course.origin, wheel.lng, wheel.lat)
    return [x, wheel.hub, z]
  }, [course, wheel])
  return (
    <group position={position} rotation-y={wheel.heading}>
      <mesh geometry={geometry.frame} castShadow receiveShadow>
        <meshStandardMaterial color="#eef1f4" metalness={0.55} roughness={0.35} />
      </mesh>
      <mesh geometry={geometry.capsules} castShadow>
        <meshStandardMaterial color="#b9d3e2" metalness={0.2} roughness={0.08} transparent opacity={0.7} />
      </mesh>
    </group>
  )
}

const Track = ({ course, walls }) => {
  const textures = useLoaded(loadTextures)
  const geometries = useMemo(() => ({
    road: roadGeometry(course),
    runOff: runOffGeometry(course, walls),
    kerbs: kerbGeometry(course),
    lines: lineGeometry(course),
    grid: gridGeometry(course),
    walls: wallGeometry(course, walls),
    fence: fenceGeometry(course, walls),
  }), [course, walls])
  useEffect(() => () => Object.values(geometries).forEach((geometry) => geometry.dispose()), [geometries])
  const posts = useMemo(() => postMatrices(course, walls), [course, walls])
  const postParts = useMemo(() => ({
    geometry: new BoxGeometry(0.09, FENCE_HEIGHT_M + 0.2, 0.09),
    material: new MeshStandardMaterial({ color: '#5b5f66', metalness: 0.6, roughness: 0.45 }),
  }), [])
  useEffect(() => () => { postParts.geometry.dispose(); postParts.material.dispose() }, [postParts])
  const postsRef = useRef(null)
  useEffect(() => {
    const mesh = postsRef.current
    if (!mesh) return
    posts.forEach((matrix, i) => mesh.setMatrixAt(i, matrix))
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [posts, textures])
  const offset = (units) => ({ polygonOffset: true, polygonOffsetFactor: units, polygonOffsetUnits: units })
  if (!textures) return null
  return (
    <>
      <mesh geometry={geometries.road} receiveShadow>
        <meshStandardMaterial map={textures.asphalt} normalMap={textures.asphaltNormal} roughnessMap={textures.asphaltOrm} color="#7d8088" roughness={1} metalness={0} side={DoubleSide} {...offset(-2)} />
      </mesh>
      <mesh geometry={geometries.runOff} receiveShadow>
        <meshStandardMaterial map={textures.asphalt} normalMap={textures.asphaltNormal} roughnessMap={textures.asphaltOrm} color="#b9b6ad" roughness={1} metalness={0} side={DoubleSide} {...offset(-2)} />
      </mesh>
      <mesh geometry={geometries.kerbs} receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.55} side={DoubleSide} {...offset(-3)} />
      </mesh>
      <mesh geometry={geometries.lines} receiveShadow>
        <meshStandardMaterial color="#f2f2f2" roughness={0.7} side={DoubleSide} {...offset(-4)} />
      </mesh>
      <mesh geometry={geometries.grid} receiveShadow>
        <meshStandardMaterial color="#f2f2f2" roughness={0.7} side={DoubleSide} {...offset(-4)} />
      </mesh>
      <mesh geometry={geometries.walls} castShadow receiveShadow>
        <meshStandardMaterial map={textures.concrete} normalMap={textures.concreteNormal} color="#e4e2dc" roughness={0.85} side={DoubleSide} />
      </mesh>
      <mesh geometry={geometries.fence}>
        <meshStandardMaterial map={textures.fence} transparent depthWrite={false} color="#c9ccd2" metalness={0.5} roughness={0.5} side={DoubleSide} />
      </mesh>
      {posts.length > 0 && <instancedMesh ref={postsRef} args={[postParts.geometry, postParts.material, posts.length]} castShadow />}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.35, 0]} receiveShadow>
        <planeGeometry args={[GROUND_M, GROUND_M, GROUND_CELLS, GROUND_CELLS]} />
        <meshStandardMaterial color="#59625e" roughness={0.95} />
      </mesh>
    </>
  )
}

const cameraPose = (mode, car, h, out, look) => {
  const fx = Math.cos(car.heading)
  const fy = Math.sin(car.heading)
  if (mode === 'tcam') {
    out.set(car.x + fx * TCAM_M[0], h + TCAM_M[1], -(car.y + fy * TCAM_M[0]))
    look.set(car.x + fx * 30, h + 0.8, -(car.y + fy * 30))
    return
  }
  if (mode === 'nose') {
    out.set(car.x + fx * NOSE_M[0], h + NOSE_M[1], -(car.y + fy * NOSE_M[0]))
    look.set(car.x + fx * 30, h + 0.45, -(car.y + fy * 30))
    return
  }
  out.set(car.x - fx * CHASE_BACK_M, h + CHASE_UP_M, -(car.y - fy * CHASE_BACK_M))
  look.set(car.x + fx * LOOK_AHEAD_M, h + 1, -(car.y + fy * LOOK_AHEAD_M))
}

const Rig = ({ course, walls, trace, model, color, read, resetKey, view, audio, onLap, onHud }) => {
  const game = useRef(freshGame(course))
  const player = useMemo(() => (model ? dressCar(model, { color }) : null), [model, color])
  const ghost = useMemo(() => (model ? dressCar(model, { color: '#ffffff', ghost: true }) : null), [model])
  useEffect(() => () => { if (player) disposeCar(player) }, [player])
  useEffect(() => () => { if (ghost) disposeCar(ghost) }, [ghost])
  const sun = useRef(null)
  const target = useMemo(() => new Object3D(), [])
  const look = useMemo(() => new Vector3(), [])
  const eye = useMemo(() => new Vector3(), [])
  const callbacks = useRef({ onLap, onHud })
  const snapped = useRef(false)

  useEffect(() => {
    callbacks.current = { onLap, onHud }
  })

  useEffect(() => {
    game.current = freshGame(course)
    snapped.current = false
  }, [course, resetKey])

  useEffect(() => {
    snapped.current = false
  }, [view])

  useFrame(({ camera }, delta) => {
    const dt = Math.min(0.05, delta)
    const g = game.current
    const input = read()
    g.car = stepCar(g.car, input, dt, g.where.onRoad)
    g.where = locate(course, g.car.x, g.car.y, g.where.index)
    const hit = hitWalls(g.car, course, walls, g.where)
    if (hit.car !== g.car) {
      g.car = hit.car
      g.where = locate(course, g.car.x, g.car.y, g.where.index)
    }
    if (hit.impact > IMPACT_SOUND_SPEED) audio.current?.impact(hit.impact)
    g.lap = stepLap(g.lap, g.where, dt, course)
    if (g.lap.completed) callbacks.current.onLap(g.lap.completed)
    const h = course.h[g.where.index]
    if (player) poseCar(player, { x: g.car.x, y: g.car.y, h, heading: g.car.heading, wheelAngle: g.car.wheelAngle, delta: g.car.delta, ax: g.car.ax, ay: g.car.ay })

    const sim = ghostAt(course, trace, g.lap.phase === 'timed' ? g.lap.time : 0)
    if (g.ghostLast) g.ghostWheel += Math.hypot(sim.x - g.ghostLast.x, sim.y - g.ghostLast.y) / WHEEL_RADIUS_M
    g.ghostLast = sim
    if (ghost) poseCar(ghost, { ...sim, wheelAngle: g.ghostWheel })

    cameraPose(view, g.car, h, eye, look)
    if (view === 'chase' && snapped.current) camera.position.lerp(eye, 1 - Math.exp(-dt * 7))
    else camera.position.copy(eye)
    snapped.current = true
    camera.lookAt(look)
    const fov = BASE_FOV + Math.min(12, Math.abs(g.car.speed) * 0.12)
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }

    if (sun.current) {
      target.position.set(g.car.x, h, -g.car.y)
      sun.current.position.copy(target.position).addScaledVector(SUN, SUN_DISTANCE_M)
      target.updateMatrixWorld()
    }
    audio.current?.update(g.car, input.throttle)

    g.hudClock += dt
    if (g.hudClock < HUD_EVERY_S) return
    g.hudClock = 0
    const timed = g.lap.phase === 'timed'
    callbacks.current.onHud({
      kmh: Math.abs(g.car.speed) * 3.6,
      gear: g.car.gear,
      rpm: g.car.rpm,
      xmode: g.car.xmode,
      manual: g.car.manual,
      timed,
      time: g.lap.time,
      gap: timed ? g.lap.time - simTimeAt(trace, course.n, g.where.index) : null,
      offRoad: g.where.fullyOff,
      spoiled: timed && (g.lap.offTooLong || g.lap.hits.some((hit, k) => !hit && course.checkpoints[k] < g.where.index - 20)),
    })
  })

  return (
    <>
      {player && <primitive object={player.root} />}
      {ghost && <primitive object={ghost.root} />}
      <primitive object={target} />
      <directionalLight
        ref={sun}
        target={target}
        intensity={2.4}
        color="#fff4e2"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-SHADOW_HALF_M}
        shadow-camera-right={SHADOW_HALF_M}
        shadow-camera-top={SHADOW_HALF_M}
        shadow-camera-bottom={-SHADOW_HALF_M}
        shadow-camera-near={10}
        shadow-camera-far={SUN_DISTANCE_M * 2}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
    </>
  )
}

export const DriveScene = ({ course, trace, points = [], color, read, resetKey, view, audio, onLap, onHud }) => {
  const city = useLoaded(loadCity)
  const model = useLoaded(loadCarModel)
  const walls = useMemo(() => buildWalls(course), [course])
  return (
    <Canvas shadows="percentage" dpr={[1, 1.5]} camera={{ fov: BASE_FOV, near: 0.2, far: 9000 }} scene={{ environmentIntensity: 0.75 }}>
      <Sky />
      <fog attach="fog" args={[HAZE, 350, 5200]} />
      <hemisphereLight args={['#dfe7f5', '#5a5246', 0.55]} />
      {city && <City course={course} walls={walls} city={city} />}
      <Track course={course} walls={walls} />
      <BrakingBoards course={course} walls={walls} points={points} />
      <Rig
        course={course}
        walls={walls}
        trace={trace}
        model={model}
        color={color}
        read={read}
        resetKey={resetKey}
        view={view}
        audio={audio}
        onLap={onLap}
        onHud={onHud}
      />
    </Canvas>
  )
}
