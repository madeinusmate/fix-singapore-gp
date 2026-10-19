import { cloneElement, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
import { atmosphereFor } from './atmosphere.js'
import { ANISOTROPY, CITY_DRAW_M, ENV_PX, REFLECT_EVERY, TRACK_LAYER, budgetFor, groundGrid, readDevice } from './budget.js'
import { bigWheelGeometry } from './bigWheel.js'
import { BRAKING_BOARD_H_M, BRAKING_BOARD_W_M, BRAKING_POST_H_M, DISTANCE_M, brakingSign, markerSide } from './braking.js'
import { paintWindows } from './dress.js'
import { carAt, stepCar, WHEEL_RADIUS_M } from './car.js'
import { disposeCar, dressCar, loadCarModel, poseCar } from './carModel.js'
import { cityShift, cullCity, liftNightCity, loadCity, splitGeometry } from './city.js'
import { corridorMask, corridorTexture, cutCorridor, sceneCorridor } from './corridor.js'
import { locate } from './course.js'
import { ghostAt, simTimeAt } from './ghost.js'
import { startLap, stepLap } from './lap.js'
import { createMirror, mirrorSees, renderMirror } from './mirror.js'
import {
  FENCE_HEIGHT_M,
  fenceGeometry,
  gridGeometry,
  kerbGeometry,
  brakingMarkGeometry,
  lineGeometry,
  parapetGeometry,
  postMatrices,
  roadGeometry,
  runOffGeometry,
  skirtGeometry,
  wallGeometry,
} from './meshes.js'
import { Floodlights, Gantry, Grandstands } from './scenery.jsx'
import { buildWalls, hitWalls } from './walls.js'
import { createWaterUniforms, dressWater, paintWater } from './water.js'
const HUD_EVERY_S = 0.1
const CHASE_BACK_M = 8.5
const CHASE_UP_M = 2.6
const LOOK_AHEAD_M = 6
const BASE_FOV = 60
// Onboard camera mounts as [ahead of the axle midpoint, up], in metres: the
// T-cam sits on the airbox (top at 1.29 m), the nose cam ahead of the front wheels.
const TCAM_M = [0.05, 1.45]
const NOSE_M = [2.6, 0.62]
const SUN_DISTANCE_M = 250
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
  texture.anisotropy = ANISOTROPY
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
      <instancedMesh ref={postsRef} args={[postParts.geometry, postParts.material, posts.length]} />
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

const skies = new Map()
const loadSky = (file) => {
  if (!skies.has(file)) {
    skies.set(file, new TextureLoader().loadAsync(`${ASSETS}${file}`).then((sky) => {
      sky.mapping = EquirectangularReflectionMapping
      sky.colorSpace = SRGBColorSpace
      return sky
    }).catch((err) => {
      skies.delete(file)
      throw err
    }))
  }
  return skies.get(file)
}

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
      texture.anisotropy = ANISOTROPY
      if (!/Normal|Orm/.test(key)) texture.colorSpace = SRGBColorSpace
      return [key, texture]
    })
  ))).then(Object.fromEntries).catch((err) => {
    texturesPending = null
    throw err
  })
  return texturesPending
}

// PMREM of a 4K equirectangular allocates a cubemap chain big enough to stall
// the first frames. The backdrop can stay sharp; the lighting map cannot tell
// 512 from 4096. On a low budget the backdrop is the small map too, so the
// 4K image is never uploaded.
const envSource = (texture, width) => {
  const image = texture.image
  const w = image?.width || 0
  const h = image?.height || 0
  if (!w || !h || w <= width) return texture
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = Math.max(1, Math.round(width * (h / w)))
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
  const small = new CanvasTexture(canvas)
  small.mapping = EquirectangularReflectionMapping
  small.colorSpace = SRGBColorSpace
  return small
}

// Sky image as the backdrop and, prefiltered, as the light the car's paint
// reflects. Night circuits use a dark sky.
const Sky = ({ file, haze, low }) => {
  const load = useMemo(() => () => loadSky(file), [file])
  const sky = useLoaded(load)
  const gl = useThree((state) => state.gl)
  const prepared = useMemo(() => {
    if (!sky) return null
    const source = envSource(sky, ENV_PX)
    const pmrem = new PMREMGenerator(gl)
    pmrem.compileEquirectangularShader()
    const target = pmrem.fromEquirectangular(source)
    pmrem.dispose()
    const backdrop = low ? source : sky
    if (source !== backdrop) source.dispose()
    return { target, backdrop, disposeBackdrop: backdrop !== sky }
  }, [sky, gl, low])
  useEffect(() => () => {
    prepared?.target.dispose()
    if (prepared?.disposeBackdrop) prepared.backdrop.dispose()
  }, [prepared])
  if (!prepared) return <color attach="background" args={[haze]} />
  return (
    <>
      <primitive attach="background" object={prepared.backdrop} />
      <primitive attach="environment" object={prepared.target.texture} />
    </>
  )
}

const City = ({ course, walls, city, air, pausedRef, reflectRef }) => {
  const position = useMemo(() => cityShift(course.origin, city.originLng, city.originLat, course.projection), [course, city])
  const waterState = useRef(null)
  const waterMeshes = useRef([])
  const corridor = useMemo(() => {
    const mask = corridorMask(course, walls)
    return { mask, texture: corridorTexture(mask) }
  }, [course, walls])
  useEffect(() => () => corridor.texture.dispose(), [corridor])
  useEffect(() => {
    const water = waterState.current ?? createWaterUniforms()
    waterState.current = water
    const uniforms = sceneCorridor(city.scene, corridor.mask, corridor.texture)
    const meshes = []
    const visit = (material, object) => {
      if (/Water/i.test(material.name || '')) {
        paintWater(material, { color: air.water, night: air.night })
        dressWater(material, water)
        object.castShadow = false
        if (!object.userData.waterSurface) {
          object.userData.waterSurface = true
          meshes.push(object)
        }
      } else {
        const windows = paintWindows(material, air.window)
        if (air.night && !windows) liftNightCity(material)
      }
      cutCorridor(material, uniforms)
    }
    city.scene.traverse((object) => {
      if (!object.isMesh) return
      const list = Array.isArray(object.material) ? object.material : [object.material]
      list.forEach((material) => { if (material) visit(material, object) })
    })
    waterMeshes.current = meshes
    return () => { waterMeshes.current = [] }
  }, [city, corridor, air])
  const mirror = useMemo(() => createMirror(), [])
  useEffect(() => () => {
    const texture = waterState.current?.waterReflect.value
    mirror.dispose()
    if (texture && texture !== mirror.renderTarget.texture) texture.dispose()
  }, [mirror])
  const frame = useRef(0)
  useFrame(({ gl, scene, camera }, delta) => {
    cullCity(city.scene, camera.position, CITY_DRAW_M)
    const water = waterState.current
    if (pausedRef?.current || !water) return
    water.waterTime.value += delta
    const meshes = waterMeshes.current
    if (!meshes.length) return
    frame.current += 1
    if (!reflectRef?.current || frame.current % REFLECT_EVERY !== 0 || !mirrorSees(camera, meshes)) {
      if (!reflectRef?.current) water.waterReflectOn.value = 0
      return
    }
    const previous = water.waterReflect.value
    if (!renderMirror(mirror, { gl, scene, camera, meshes })) return
    if (previous !== mirror.renderTarget.texture) previous.dispose()
    water.waterReflect.value = mirror.renderTarget.texture
    water.waterMatrix.value.copy(mirror.textureMatrix)
    water.waterReflectOn.value = 1
  }, 1)
  return (
    <>
      <primitive object={city.scene} position={position} />
      {city.bigWheels.map((wheel) => <BigWheel key={`${wheel.lng},${wheel.lat}`} course={course} wheel={wheel} night={air.night} />)}
    </>
  )
}

const BigWheel = ({ course, wheel, night }) => {
  const geometry = useMemo(() => bigWheelGeometry(wheel), [wheel])
  useEffect(() => () => { geometry.frame.dispose(); geometry.capsules.dispose() }, [geometry])
  const position = useMemo(() => {
    const [x, , z] = cityShift(course.origin, wheel.lng, wheel.lat, course.projection)
    return [x, wheel.hub, z]
  }, [course, wheel])
  return (
    <group position={position} rotation-y={wheel.heading}>
      <mesh geometry={geometry.frame}>
        <meshLambertMaterial color="#eef1f4" />
      </mesh>
      <mesh geometry={geometry.capsules}>
        <meshLambertMaterial color="#b9d3e2" emissive="#8ec4dc" emissiveIntensity={night ? 0.45 : 0} transparent opacity={0.7} />
      </mesh>
    </group>
  )
}

// One material child, repeated onto each chunk. The chunk geometries are
// copies; the source geometry stays with the caller.
const Chunked = ({ geometry, children, ...props }) => {
  const parts = useMemo(() => (geometry ? splitGeometry(geometry) : []), [geometry])
  useEffect(() => () => {
    parts.forEach((part) => { if (part !== geometry) part.dispose() })
  }, [parts, geometry])
  return parts.map((part, index) => (
    <mesh key={index} geometry={part} {...props}>{cloneElement(children)}</mesh>
  ))
}

const Track = ({ course, walls, points, air }) => {
  const textures = useLoaded(loadTextures)
  const geometries = useMemo(() => ({
    road: roadGeometry(course),
    runOff: runOffGeometry(course, walls, points),
    kerbs: kerbGeometry(course),
    lines: lineGeometry(course),
    grid: gridGeometry(course),
    walls: wallGeometry(course, walls),
    skirt: skirtGeometry(course, walls),
    parapet: parapetGeometry(course, walls),
    fence: fenceGeometry(course, walls),
  }), [course, walls, points])
  useEffect(() => () => Object.values(geometries).forEach((geometry) => geometry?.dispose()), [geometries])
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
      <Chunked geometry={geometries.road} receiveShadow>
        <meshStandardMaterial map={textures.asphalt} normalMap={textures.asphaltNormal} roughnessMap={textures.asphaltOrm} color={air.night ? '#656a72' : '#7d8088'} roughness={air.night ? 0.4 : 0.72} metalness={air.night ? 0.16 : 0.04} side={DoubleSide} {...offset(-2)} />
      </Chunked>
      <Chunked geometry={geometries.runOff} receiveShadow>
        <meshStandardMaterial map={textures.asphalt} normalMap={textures.asphaltNormal} roughnessMap={textures.asphaltOrm} vertexColors color="#ffffff" roughness={air.night ? 0.55 : 0.85} metalness={0} side={DoubleSide} {...offset(-2)} />
      </Chunked>
      <Chunked geometry={geometries.kerbs} receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.55} side={DoubleSide} {...offset(-3)} />
      </Chunked>
      <Chunked geometry={geometries.lines} receiveShadow>
        <meshStandardMaterial color="#f2f2f2" roughness={0.7} side={DoubleSide} {...offset(-4)} />
      </Chunked>
      <Chunked geometry={geometries.grid} receiveShadow>
        <meshStandardMaterial color="#f2f2f2" roughness={0.7} side={DoubleSide} {...offset(-4)} />
      </Chunked>
      <Chunked geometry={geometries.walls} castShadow receiveShadow>
        <meshStandardMaterial map={textures.concrete} normalMap={textures.concreteNormal} color="#e4e2dc" roughness={0.85} side={DoubleSide} />
      </Chunked>
      <Chunked geometry={geometries.skirt} receiveShadow>
        <meshStandardMaterial color="#1b1e22" roughness={0.92} side={DoubleSide} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
      </Chunked>
      <Chunked geometry={geometries.parapet} castShadow>
        <meshStandardMaterial color="#b7c0c8" metalness={0.65} roughness={0.35} side={DoubleSide} />
      </Chunked>
      <Chunked geometry={geometries.fence}>
        <meshStandardMaterial map={textures.fence} transparent depthWrite={false} color="#c9ccd2" metalness={0.5} roughness={0.5} side={DoubleSide} />
      </Chunked>
      {posts.length > 0 && <instancedMesh ref={postsRef} args={[postParts.geometry, postParts.material, posts.length]} />}
      {air.night && <Floodlights course={course} walls={walls} />}
      <Grandstands course={course} walls={walls} />
      <Gantry course={course} walls={walls} night={air.night} />
    </>
  )
}

// The ground follows the camera, snapped to a cell so it does not swim. A
// fixed 30 km grid was ten thousand triangles receiving a shadow.
const Ground = ({ air, low }) => {
  const ref = useRef(null)
  const grid = useMemo(() => groundGrid(air.fogFar, low), [air.fogFar, low])
  const snap = grid.span / grid.cells
  useFrame(({ camera }) => {
    const mesh = ref.current
    if (!mesh) return
    const x = Math.round(camera.position.x / snap) * snap
    const z = Math.round(camera.position.z / snap) * snap
    if (mesh.position.x !== x || mesh.position.z !== z) mesh.position.set(x, -0.35, z)
  })
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.35, 0]} receiveShadow>
      <planeGeometry args={[grid.span, grid.span, grid.cells, grid.cells]} />
      <meshLambertMaterial color={air.ground} />
    </mesh>
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

const Rig = ({ course, walls, trace, model, color, read, resetKey, view, audio, onLap, onHud, pausedRef, air }) => {
  const game = useRef(freshGame(course))
  const player = useMemo(() => (model ? dressCar(model, { color }) : null), [model, color])
  const ghost = useMemo(() => (model ? dressCar(model, { color: '#ffffff', ghost: true }) : null), [model])
  useEffect(() => () => { if (player) disposeCar(player) }, [player])
  useEffect(() => () => { if (ghost) disposeCar(ghost) }, [ghost])
  const sun = useRef(null)
  const wide = useRef(null)
  const keySpot = useRef(null)
  const leftSpot = useRef(null)
  const rightSpot = useRef(null)
  const target = useMemo(() => new Object3D(), [])
  const keyAim = useMemo(() => new Object3D(), [])
  const leftAim = useMemo(() => new Object3D(), [])
  const rightAim = useMemo(() => new Object3D(), [])
  const sunDir = useMemo(() => new Vector3(...air.sunDir).normalize(), [air])
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

  useLayoutEffect(() => {
    ;[keySpot, leftSpot, rightSpot].forEach((spot) => spot.current?.layers.set(TRACK_LAYER))
  })

  useFrame(({ camera }, delta) => {
    if (pausedRef?.current) return
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
      sun.current.position.copy(target.position).addScaledVector(sunDir, SUN_DISTANCE_M)
      if (wide.current) wide.current.position.copy(sun.current.position)
      target.updateMatrixWorld()
    }
    if (keySpot.current) {
      const fx = Math.cos(g.car.heading)
      const fy = Math.sin(g.car.heading)
      keySpot.current.position.set(g.car.x - fx * 6, h + 12, -(g.car.y - fy * 6))
      keyAim.position.set(g.car.x + fx * 10, h + 0.2, -(g.car.y + fy * 10))
      leftSpot.current.position.set(g.car.x - fy * 9 - fx * 2, h + 8, -(g.car.y + fx * 9 - fy * 2))
      rightSpot.current.position.set(g.car.x + fy * 9 - fx * 2, h + 8, -(g.car.y - fx * 9 - fy * 2))
      leftAim.position.set(g.car.x + fx * 8, h + 0.3, -(g.car.y + fy * 8))
      rightAim.position.copy(leftAim.position)
      keyAim.updateMatrixWorld()
      leftAim.updateMatrixWorld()
      rightAim.updateMatrixWorld()
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
        intensity={air.sun}
        color={air.sunColor}
        castShadow
        shadow-mapSize={[air.shadowMap, air.shadowMap]}
        shadow-camera-left={-air.shadowHalf}
        shadow-camera-right={air.shadowHalf}
        shadow-camera-top={air.shadowHalf}
        shadow-camera-bottom={-air.shadowHalf}
        shadow-camera-near={10}
        shadow-camera-far={SUN_DISTANCE_M * 2}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
      <directionalLight
        ref={wide}
        target={target}
        intensity={air.fill}
        color={air.fillColor}
      />
      {air.night && (
        <>
          <primitive object={keyAim} />
          <primitive object={leftAim} />
          <primitive object={rightAim} />
          <spotLight ref={keySpot} target={keyAim} angle={0.72} penumbra={0.45} intensity={6000} distance={110} decay={2} color="#f3f6ff" />
          <spotLight ref={leftSpot} target={leftAim} angle={0.85} penumbra={0.55} intensity={2800} distance={70} decay={2} color="#fff8ee" />
          <spotLight ref={rightSpot} target={rightAim} angle={0.85} penumbra={0.55} intensity={2800} distance={70} decay={2} color="#fff8ee" />
        </>
      )}
    </>
  )
}

// After the shader compile settles, frames slower than about 45 fps drop the
// pixel ratio to 1 and retire the bay mirror for the rest of the visit.
const Tune = ({ reflectRef }) => {
  const setDpr = useThree((state) => state.setDpr)
  const seen = useRef(0)
  const samples = useRef([])
  const dropped = useRef(false)
  useFrame((_, delta) => {
    seen.current += 1
    if (dropped.current || seen.current < 90) return
    const ms = delta * 1000
    if (ms > 80) return
    const bucket = samples.current
    bucket.push(ms)
    if (bucket.length < 30) return
    const avg = bucket.reduce((sum, value) => sum + value, 0) / bucket.length
    bucket.length = 0
    if (avg <= 22) return
    dropped.current = true
    setDpr(1)
    reflectRef.current = false
  })
  return null
}

const OnTrack = ({ children }) => {
  const ref = useRef(null)
  useLayoutEffect(() => {
    ref.current?.traverse((object) => object.layers.enable(TRACK_LAYER))
  })
  return <group ref={ref}>{children}</group>
}

const Warm = ({ revision }) => {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)
  useEffect(() => {
    gl.compileAsync?.(scene, camera).catch(() => {})
  }, [gl, scene, camera, revision])
  return null
}

export const DriveScene = ({ course, trace, points = [], color, read, resetKey, view, audio, onLap, onHud, pausedRef, citySlug = 'singapore' }) => {
  const budget = useMemo(() => budgetFor(readDevice()), [])
  const air = useMemo(() => ({ ...atmosphereFor(citySlug), shadowMap: budget.shadowMap }), [citySlug, budget])
  const reflectRef = useRef(budget.reflect)
  const loadThisCity = useMemo(() => () => loadCity(citySlug), [citySlug])
  const city = useLoaded(loadThisCity)
  const model = useLoaded(loadCarModel)
  const walls = useMemo(() => buildWalls(course), [course])
  const camera = useMemo(() => ({ fov: BASE_FOV, near: 0.2, far: air.fogFar + 400 }), [air.fogFar])
  const glProps = useMemo(() => ({ antialias: false, stencil: false, powerPreference: 'high-performance' }), [])
  const sceneProps = useMemo(() => ({ environmentIntensity: air.env }), [air.env])
  return (
    <Canvas className="drive-canvas" style={{ position: 'absolute', inset: 0, touchAction: 'none' }} shadows={budget.shadows} dpr={budget.dpr} camera={camera} gl={glProps} scene={sceneProps}>
      <Sky file={air.sky} haze={air.haze} low={budget.low} />
      <fog attach="fog" args={[air.haze, air.fogNear, air.fogFar]} />
      <hemisphereLight args={[air.hemiSky, air.hemiGround, air.hemi]} />
      {city && <City course={course} walls={walls} city={city} air={air} pausedRef={pausedRef} reflectRef={reflectRef} />}
      <OnTrack>
        <Track course={course} walls={walls} points={points} air={air} />
        <Ground air={air} low={budget.low} />
        <BrakingBoards course={course} walls={walls} points={points} />
      </OnTrack>
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
        pausedRef={pausedRef}
        air={air}
      />
      <Tune reflectRef={reflectRef} />
      <Warm revision={city ? citySlug : 'pending'} />
    </Canvas>
  )
}
