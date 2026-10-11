import { useState } from 'react'

const Pad = ({ name, label, glyph, press }) => {
  const release = () => press(name, false)
  return (
    <button
      type="button"
      className={`pad ${name}`}
      aria-label={label}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        press(name, true)
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(e) => e.preventDefault()}
    >
      {glyph}
    </button>
  )
}

export const TouchPad = ({ press }) => {
  const [coarse] = useState(() => window.matchMedia('(pointer: coarse)').matches)
  if (!coarse) return null
  return (
    <div className="touchpad">
      <div>
        <Pad name="left" label="Steer left" glyph="◀" press={press} />
        <Pad name="right" label="Steer right" glyph="▶" press={press} />
      </div>
      <div>
        <Pad name="brake" label="Brake" glyph="BRAKE" press={press} />
        <Pad name="throttle" label="Throttle" glyph="GO" press={press} />
      </div>
    </div>
  )
}
