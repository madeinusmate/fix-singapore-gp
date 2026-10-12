import { useCallback, useEffect, useRef, useState } from 'react'
import { ConfirmDialog } from './ConfirmDialog.jsx'

export const useConfirmDialog = () => {
  const pending = useRef(null)
  const [request, setRequest] = useState(null)

  const settle = useCallback((accepted) => {
    const resolve = pending.current
    pending.current = null
    setRequest(null)
    resolve?.(accepted)
  }, [])

  const confirm = useCallback((options) => {
    pending.current?.(false)
    return new Promise((resolve) => {
      pending.current = resolve
      setRequest(options)
    })
  }, [])

  useEffect(() => () => {
    pending.current?.(false)
    pending.current = null
  }, [])

  const dialog = request
    ? (
      <ConfirmDialog
        {...request}
        onConfirm={() => settle(true)}
        onCancel={() => settle(false)}
      />
    )
    : null

  return { confirm, dialog }
}
