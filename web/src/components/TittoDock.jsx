import { useEffect, useRef, useState } from 'react'
import Sparrow from './Sparrow.jsx'
import { useChat } from '../lib/queries.js'
import { useWSEvent } from '../lib/ws.js'

const SESSION_ID = 'web-default'
const WELCOME = `Hey, I'm Titto — your Chief of Staff. Ask me to research a topic, write a post, find replies, or check what's working.`

// Persistent floating chat — mounted once in AppShell so it survives page navigation.
export default function TittoDock() {
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [messages, setMessages] = useState([{ role: 'titto', text: WELCOME }])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const chat = useChat()
  const scrollRef = useRef(null)

  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, typing, open])

  useWSEvent('chat_reply', (data) => {
    setTyping(false)
    setMessages((m) => [...m, { role: 'titto', text: data.content }])
    if (!open) setUnread((n) => n + 1)
  })
  useWSEvent('error', (data) => {
    setTyping(false)
    setMessages((m) => [...m, { role: 'titto', text: `⚠️ ${data.message}` }])
    if (!open) setUnread((n) => n + 1)
  })

  function toggle() {
    setOpen((o) => !o)
    setUnread(0)
  }

  function send() {
    const text = input.trim()
    if (!text || chat.isPending) return
    setMessages((m) => [...m, { role: 'user', text }])
    setInput('')
    setTyping(true)
    chat.mutate(
      { message: text, sessionId: SESSION_ID },
      {
        onSuccess: (data) => {
          setTyping(false)
          if (data.reply) setMessages((m) => [...m, { role: 'titto', text: data.reply }])
        },
        onError: (err) => {
          setTyping(false)
          setMessages((m) => [...m, { role: 'titto', text: `⚠️ ${err.message}` }])
        },
      },
    )
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  return (
    <div className="titto-dock">
      {open && (
        <div className="titto-dock-panel card">
          <div className="titto-dock-head">
            <Sparrow style={{ width: 18, height: 18, color: 'var(--accent)' }} />
            <span style={{ fontWeight: 650, fontSize: 13 }}>Titto</span>
            <span className="mono" style={{ fontSize: 10, color: 'var(--faint)' }}>CHIEF OF STAFF</span>
            <button className="icon-btn" style={{ marginLeft: 'auto', width: 26, height: 26 }} onClick={toggle} aria-label="Close chat">✕</button>
          </div>
          <div className="chat-msgs" ref={scrollRef} style={{ padding: '10px 12px' }}>
            {messages.map((m, i) => <div key={i} className={`msg ${m.role}`}>{m.text}</div>)}
            {typing && <div className="msg titto mono" style={{ fontSize: 11, color: 'var(--faint)' }}>Titto is thinking…</div>}
          </div>
          <div className="chat-input-row" style={{ padding: '10px 12px' }}>
            <textarea
              className="field" rows={1} placeholder="Message Titto…"
              value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown}
            />
            <button className="btn primary sm" onClick={send} disabled={chat.isPending || !input.trim()}>Send</button>
          </div>
        </div>
      )}
      <button className="titto-dock-fab" onClick={toggle} aria-label="Toggle Titto chat">
        <Sparrow style={{ width: 22, height: 22 }} />
        {unread > 0 && <span className="titto-dock-badge">{unread}</span>}
      </button>
    </div>
  )
}
