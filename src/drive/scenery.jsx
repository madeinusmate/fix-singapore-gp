import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { BoxGeometry, MeshLambertMaterial, Quaternion, Vector3 } from 'three'
import {
  POLE_HEIGHT_M,
  floodlightMatrices,
  gantryFrame,
  grandstandGeometry,
  grandstandMatrices,
} from './scenery.js'

const placed = (matrix) => {
  const position = new Vector3()
  const quaternion = new Quaternion()
  const scale = new Vector3()
  matrix.decompose(position, quaternion, scale)
  return { position, quaternion }
}

const useInstances = (meshRef, matrices) => {
  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix))
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [meshRef, matrices])
}

export const Floodlights = ({ course, walls }) => {
  const placedLights = useMemo(() => floodlightMatrices(course, walls), [course, walls])
  const parts = useMemo(() => ({
    pole: new BoxGeometry(0.2, POLE_HEIGHT_M, 0.2),
    head: new BoxGeometry(2.4, 0.28, 0.55),
    steel: new MeshLambertMaterial({ color: '#2a2e33' }),
    lamp: new MeshLambertMaterial({ color: '#f7f4ea', emissive: '#fff6d8', emissiveIntensity: 2.6 }),
  }), [])
  useEffect(() => () => {
    parts.pole.dispose()
    parts.head.dispose()
    parts.steel.dispose()
    parts.lamp.dispose()
  }, [parts])
  const polesRef = useRef(null)
  const headsRef = useRef(null)
  useInstances(polesRef, placedLights.poles)
  useInstances(headsRef, placedLights.heads)
  if (!placedLights.poles.length) return null
  return (
    <>
      <instancedMesh ref={polesRef} args={[parts.pole, parts.steel, placedLights.poles.length]} />
      <instancedMesh ref={headsRef} args={[parts.head, parts.lamp, placedLights.heads.length]} />
    </>
  )
}

export const Grandstands = ({ course, walls }) => {
  const matrices = useMemo(() => grandstandMatrices(course, walls), [course, walls])
  const parts = useMemo(() => {
    const geometry = grandstandGeometry()
    return {
      geometry,
      seats: new MeshLambertMaterial({ color: '#9a2e2e' }),
      frame: new MeshLambertMaterial({ color: '#23262b' }),
    }
  }, [])
  useEffect(() => () => {
    parts.geometry.seats.dispose()
    parts.geometry.frame.dispose()
    parts.seats.dispose()
    parts.frame.dispose()
  }, [parts])
  const seatsRef = useRef(null)
  const frameRef = useRef(null)
  useInstances(seatsRef, matrices)
  useInstances(frameRef, matrices)
  if (!matrices.length) return null
  return (
    <>
      <instancedMesh ref={frameRef} args={[parts.geometry.frame, parts.frame, matrices.length]} castShadow receiveShadow />
      <instancedMesh ref={seatsRef} args={[parts.geometry.seats, parts.seats, matrices.length]} castShadow receiveShadow />
    </>
  )
}

const steel = { color: '#2c3138' }

export const Gantry = ({ course, walls, night }) => {
  const frame = useMemo(() => gantryFrame(course, walls), [course, walls])
  const beam = useMemo(() => placed(frame.beam), [frame])
  const board = useMemo(() => placed(frame.board), [frame])
  return (
    <group>
      <mesh position={frame.left} castShadow>
        <boxGeometry args={[0.5, frame.height, 0.5]} />
        <meshLambertMaterial {...steel} />
      </mesh>
      <mesh position={frame.right} castShadow>
        <boxGeometry args={[0.5, frame.height, 0.5]} />
        <meshLambertMaterial {...steel} />
      </mesh>
      <mesh position={beam.position} quaternion={beam.quaternion} castShadow>
        <boxGeometry args={[frame.length, 0.4, 0.4]} />
        <meshLambertMaterial {...steel} />
      </mesh>
      <mesh position={board.position} quaternion={board.quaternion} castShadow>
        <boxGeometry args={[7, 1.15, 0.2]} />
        <meshLambertMaterial color="#e10600" emissive="#e10600" emissiveIntensity={night ? 0.55 : 0.08} />
      </mesh>
    </group>
  )
}
