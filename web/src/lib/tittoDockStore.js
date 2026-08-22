// Shared Titto conversation state — one conversation, however many surfaces render it.
// The floating dock (mounted once in App.jsx) and Titto's own page both read from here, so
// switching between them continues the same thread instead of starting a second one.
//
// The `chat_reply` / `error` WebSocket subscription lives HERE, at module scope, rather than in a
// component. Titto replies arrive asynchronously (fire-and-forget commands like /tools and
// /brand-audit push their real result over WS long after the HTTP call returned), and subscribing
// per-component would append one copy per mounted surface.
//
// Also holds the open/prefill state other pages use to pop the dock with a question ready
// (Raven's and Quill's "Ask Titto" buttons). Singleton pattern, same shape as ws.js.
import { useEffect, useState } from 'react'
import { onWSEvent } from './ws.js'

export const WELCOME = `Hey, I'm Titto — your Chief of Staff. Ask me to research a topic, write a post, find replies, or check what's working.`

let open = false
let prefill = ''
let messages = [{ role: 'titto', text: WELCOME }]
let typing = false
let unread = 0

const listeners = new Set()

function emit() {
  const snapshot = { open, prefill, messages, typing, unread }
  listeners.forEach((fn) => fn(snapshot))
}

// ── Conversation ────────────────────────────────────────────────────────────
export function appendMessage(role, text) {
  messages = [...messages, { role, text }]
  typing = false
  if (!open) unread += 1
  emit()
}

export function setTyping(v) {
  typing = !!v
  emit()
}

// Called by whichever surface is currently showing the conversation.
export function markRead() {
  if (unread === 0) return
  unread = 0
  emit()
}

// ── Dock open / prefill ─────────────────────────────────────────────────────
export function openWithPrefill(text) {
  open = true
  prefill = text || ''
  unread = 0
  emit()
}

export function setOpen(v) {
  open = v
  if (v) unread = 0
  emit()
}

export function clearPrefill() {
  prefill = ''
}

// ── Live replies (subscribed once, at module load) ──────────────────────────
onWSEvent('chat_reply', (data) => appendMessage('titto', data.content))
onWSEvent('error', (data) => appendMessage('titto', `⚠️ ${data.message}`))

// React hook: subscribe to the whole Titto state for the lifetime of a component.
export function useTittoDockState() {
  const [state, setState] = useState({ open, prefill, messages, typing, unread })
  useEffect(() => {
    const fn = (s) => setState({ ...s })
    listeners.add(fn)
    // Re-sync on mount — the store may have changed while this component was unmounted.
    fn({ open, prefill, messages, typing, unread })
    return () => listeners.delete(fn)
  }, [])
  return state
}
