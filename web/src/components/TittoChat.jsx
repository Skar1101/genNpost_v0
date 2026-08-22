import { useEffect, useRef, useState } from 'react'
import { useChat } from '../lib/queries.js'
import { useTittoDockState, appendMessage, setTyping, markRead, clearPrefill } from '../lib/tittoDockStore.js'

const SESSION_ID = 'web-default'

// The Titto conversation UI, shared by the floating dock and Titto's own page. All state lives in
// tittoDockStore, so both surfaces render the SAME thread — this component only handles input,
// scrolling, and sending. Replies arrive via the store's own WS subscription, not here.
//
// `compact` shrinks paddings for the dock; the page renders it full-size.
export default function TittoChat({ compact = false, autoFocus = false }) {
  const { messages, typing, prefill } = useTittoDockState()
  const [input, setInput] = useState('')
  const chat = useChat()
  const scrollRef = useRef(null)
  const inputRef = useRef(null)

  // Showing the conversation counts as reading it.
  useEffect(() => { markRead() }, [messages])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, typing])

  // Pick up a prefill set by another page (Raven's / Quill's "Ask Titto").
  useEffect(() => {
    if (prefill) {
      setInput(prefill)
      clearPrefill()
      inputRef.current?.focus()
    }
  }, [prefill])

  useEffect(() => { if (autoFocus) inputRef.current?.focus() }, [autoFocus])

  function send() {
    const text = input.trim()
    if (!text || chat.isPending) return
    appendMessage('user', text)
    setInput('')
    setTyping(true)
    chat.mutate(
      { message: text, sessionId: SESSION_ID },
      {
        // Fire-and-forget commands (/tools, /brand-audit) return an ack here and push their real
        // result over WS later — the store handles that, so we only append what came back now.
        onSuccess: (data) => {
          setTyping(false)
          if (data.reply) appendMessage('titto', data.reply)
        },
        onError: (err) => {
          setTyping(false)
          appendMessage('titto', `⚠️ ${err.message}`)
        },
      },
    )
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const pad = compact ? '10px 12px' : 0

  return (
    <>
      <div className="chat-msgs" ref={scrollRef} style={{ padding: pad }}>
        {messages.map((m, i) => <div key={i} className={`msg ${m.role}`}>{m.text}</div>)}
        {typing && <div className="msg titto mono" style={{ fontSize: 11, color: 'var(--faint)' }}>Titto is thinking…</div>}
      </div>
      <div className="chat-input-row" style={{ padding: pad }}>
        <textarea
          ref={inputRef}
          className="field" rows={compact ? 1 : 2} placeholder="Message Titto…"
          value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown}
        />
        <button className={`btn primary ${compact ? 'sm' : ''}`} onClick={send} disabled={chat.isPending || !input.trim()}>Send</button>
      </div>
    </>
  )
}
