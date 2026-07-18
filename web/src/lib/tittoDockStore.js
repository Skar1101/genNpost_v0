// Shared state so any page can open the Titto dock with a pre-filled message
// (e.g. Raven's "Ask Titto" button), without prop-drilling through App.jsx.
// Singleton pattern, same shape as ws.js.
import { useEffect, useState } from 'react'

let open = false
let prefill = ''
const listeners = new Set()

function emit() {
  listeners.forEach((fn) => fn({ open, prefill }))
}

export function openWithPrefill(text) {
  open = true
  prefill = text || ''
  emit()
}

export function setOpen(v) {
  open = v
  emit()
}

export function clearPrefill() {
  prefill = ''
}

// React hook: subscribe to the dock's open/prefill state for the lifetime of a component.
export function useTittoDockState() {
  const [state, setState] = useState({ open, prefill })
  useEffect(() => {
    const fn = (s) => setState({ ...s })
    listeners.add(fn)
    return () => listeners.delete(fn)
  }, [])
  return state
}
