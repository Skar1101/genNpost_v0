import { useActivity } from '../lib/queries.js'
import { useWSEvent } from '../lib/ws.js'

const AGENT_LABEL = {
  raven: 'Raven', chitrag: 'Raven', 'raven-replies': 'Replies', 'chitrag-replies': 'Replies',
  koel: 'Koel', quill: 'Quill', article: 'Article', analyst: 'Analyst',
  reply: 'Reply', repost: 'Repost', tools: 'Tools',
}
const AGENT_MONO = {
  raven: 'Rv', chitrag: 'Rv', 'raven-replies': 'Rv', 'chitrag-replies': 'Rv',
  koel: 'Ko', quill: 'Qu', article: 'Aw', analyst: 'An', reply: 'Re', repost: 'Rp', tools: 'To',
}

function fmtTime(iso) {
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit',
  })
}

export default function TittoPage() {
  const activity = useActivity(150)
  useWSEvent('activity', () => activity.refetch())

  const entries = activity.data?.activity || []

  return (
    <div className="content">
      <div className="toolbar">
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>Every run — what happened, who triggered it, what came out</span>
        <div className="spacer" />
        <button className="btn sm" onClick={() => activity.refetch()}>↻ Refresh</button>
      </div>

      {activity.isLoading ? (
        <div className="card placeholder"><p>Loading activity…</p></div>
      ) : entries.length === 0 ? (
        <div className="card placeholder">
          <h2>No activity yet</h2>
          <p>Trigger a run — research, a write, a batch, replies — and it'll show up here.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 6 }}>
          {entries.map((e) => (
            <div key={e.id} className="feed-item" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 10px', borderRadius: 8 }}>
              <div className="mono-av svc" style={{ width: 26, height: 26, fontSize: 10.5 }}>{AGENT_MONO[e.agent] || e.agent.slice(0, 2).toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
                <b>{AGENT_LABEL[e.agent] || e.agent}</b> {e.summary}
                <div className="hint" style={{ marginTop: 1 }}>{e.triggerLabel}</div>
              </div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--faint)', flex: 'none' }}>{fmtTime(e.ts)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
