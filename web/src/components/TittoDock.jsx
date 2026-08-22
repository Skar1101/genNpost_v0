import TittoChat from './TittoChat.jsx'
import { useTittoDockState, setOpen } from '../lib/tittoDockStore.js'

// Persistent floating chat — mounted once in App.jsx so it survives page navigation.
// The conversation itself (messages, typing, unread) lives in tittoDockStore and is shared with
// Titto's own page; this component is just the floating shell around TittoChat.
export default function TittoDock() {
  const { open, unread } = useTittoDockState()

  return (
    <div className="titto-dock">
      {open && (
        <div className="titto-dock-panel card">
          <div className="titto-dock-head">
            <span style={{ fontWeight: 650, fontSize: 13 }}>Titto</span>
            <span className="mono" style={{ fontSize: 10, color: 'var(--faint)' }}>CHIEF OF STAFF</span>
            <button className="icon-btn" style={{ marginLeft: 'auto', width: 26, height: 26 }} onClick={() => setOpen(false)} aria-label="Close chat">✕</button>
          </div>
          <TittoChat compact autoFocus />
        </div>
      )}
      <button className="titto-dock-fab" onClick={() => setOpen(!open)} aria-label="Toggle Titto chat">
        T
        {unread > 0 && <span className="titto-dock-badge">{unread}</span>}
      </button>
    </div>
  )
}
