import { useEffect, useRef, useState } from 'react'

const coarseQuery = '(pointer: coarse), (any-pointer: coarse)'

const useCoarsePointer = () => {
  const [coarse, setCoarse] = useState(() => window.matchMedia(coarseQuery).matches)
  useEffect(() => {
    const query = window.matchMedia(coarseQuery)
    const onChange = () => setCoarse(query.matches)
    onChange()
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return coarse
}

// Hold the input until the finger lifts. Releasing on lostpointercapture drops the
// press immediately on iOS, which makes the pedals feel dead.
const Pad = ({ name, label, glyph, press }) => {
  const ref = useRef(null)
  const [held, setHeld] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const pointers = new Set()
    const sync = (on) => {
      setHeld(on)
      press(name, on)
    }
    const down = (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      event.preventDefault()
      pointers.add(event.pointerId)
      try { el.setPointerCapture(event.pointerId) } catch { /* capture can fail once the pointer is up */ }
      sync(true)
    }
    const up = (event) => {
      if (!pointers.has(event.pointerId)) return
      pointers.delete(event.pointerId)
      sync(pointers.size > 0)
    }
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      pointers.clear()
      press(name, false)
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [name, press])

  return (
    <button
      ref={ref}
      type="button"
      className={`pad ${name}${held ? ' held' : ''}`}
      aria-label={label}
      aria-pressed={held}
      onContextMenu={(event) => event.preventDefault()}
    >
      {glyph}
    </button>
  )
}

export const TouchPad = ({ press }) => {
  const coarse = useCoarsePointer()
  if (!coarse) return null
  return (
    <div className="touchpad">
      <div className="cluster">
        <Pad name="left" label="Steer left" glyph="◀" press={press} />
        <Pad name="right" label="Steer right" glyph="▶" press={press} />
      </div>
      <div className="cluster">
        <Pad name="brake" label="Brake" glyph="BRAKE" press={press} />
        <Pad name="throttle" label="Throttle" glyph="GO" press={press} />
      </div>
    </div>
  )
}
