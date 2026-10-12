import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'

export const ConfirmDialog = ({ kicker, title, body, confirmLabel, cancelLabel, onConfirm, onCancel }) => {
  const titleId = useId()
  const bodyId = useId()
  const dialogRef = useRef(null)

  useEffect(() => {
    const node = dialogRef.current
    const previous = document.activeElement
    node?.focus()
    document.documentElement.classList.add('dialog-lock')
    return () => {
      document.documentElement.classList.remove('dialog-lock')
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [])

  useEffect(() => {
    const node = dialogRef.current
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
        return
      }
      if (event.key !== 'Tab' || !node) return
      const items = [...node.querySelectorAll('button, a[href]')].filter((item) => !item.disabled)
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  return createPortal(
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        ref={dialogRef}
        tabIndex={-1}
      >
        <button type="button" className="dialog-close" onClick={onCancel} aria-label="Close">×</button>
        <p className="kicker">{kicker}</p>
        <h2 id={titleId}>{title}</h2>
        <p id={bodyId}>{body}</p>
        <div className="dialog-actions">
          <button type="button" className="go big" onClick={onConfirm}>{confirmLabel}</button>
          <button type="button" className="tool" onClick={onCancel}>{cancelLabel}</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
