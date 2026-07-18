// WebSocket singleton — connects once, dispatches typed events to subscribers.
// Mirrors the event contract in public/index.html's connectWS()/onWSEvent().
import { useEffect, useState } from 'react'

let socket = null
let status = 'offline' // offline | connecting | live
const statusListeners = new Set()
const typeListeners = new Map() // type -> Set<fn>

function setStatus(s) {
  status = s
  statusListeners.forEach((fn) => fn(s))
}

function dispatch(ev) {
  const set = typeListeners.get(ev.type)
  if (set) set.forEach((fn) => fn(ev.data))
}

function connect() {
  if (socket) return
  setStatus('connecting')
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  socket = new WebSocket(`${proto}//${location.host}`)
  socket.onopen = () => setStatus('live')
  socket.onclose = () => {
    setStatus('offline')
    socket = null
    setTimeout(connect, 3000)
  }
  socket.onerror = () => {}
  socket.onmessage = (e) => {
    try { dispatch(JSON.parse(e.data)) } catch (_) { /* ignore malformed frame */ }
  }
}

// Subscribe a callback to one WS event type. Returns an unsubscribe function.
export function onWSEvent(type, fn) {
  connect()
  if (!typeListeners.has(type)) typeListeners.set(type, new Set())
  typeListeners.get(type).add(fn)
  return () => typeListeners.get(type)?.delete(fn)
}

// React hook: subscribe for the lifetime of a component.
export function useWSEvent(type, handler) {
  useEffect(() => onWSEvent(type, handler), [type, handler])
}

// React hook: live connection status ('offline' | 'connecting' | 'live').
export function useWSStatus() {
  const [s, setS] = useState(status)
  useEffect(() => {
    connect()
    statusListeners.add(setS)
    return () => statusListeners.delete(setS)
  }, [])
  return s
}
