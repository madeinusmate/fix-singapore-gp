import { useCallback, useEffect, useRef } from 'react'

const KEYS = {
  ArrowUp: 'throttle',
  KeyW: 'throttle',
  ArrowDown: 'brake',
  KeyS: 'brake',
  Space: 'brake',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
}

const idle = () => ({ throttle: false, brake: false, left: false, right: false })

// Keyboard and on-screen pedals merged into one input, read once per frame.
export const useControls = () => {
  const keys = useRef(idle())
  const touch = useRef(idle())

  useEffect(() => {
    const set = (on) => (e) => {
      const name = KEYS[e.code]
      if (!name || e.target.closest?.('input, textarea')) return
      e.preventDefault()
      keys.current[name] = on
    }
    const down = set(true)
    const up = set(false)
    const clear = () => { keys.current = idle() }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
    }
  }, [])

  const read = useCallback(() => {
    const on = (name) => keys.current[name] || touch.current[name]
    return {
      throttle: on('throttle') ? 1 : 0,
      brake: on('brake') ? 1 : 0,
      steer: (on('left') ? 1 : 0) - (on('right') ? 1 : 0),
    }
  }, [])

  const press = useCallback((name, on) => { touch.current[name] = on }, [])

  return { read, press }
}
