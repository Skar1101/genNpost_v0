import { useNavigate } from 'react-router-dom'
import { useActivity } from '../lib/queries.js'
import { useWSEvent } from '../lib/ws.js'
import { triggerClass } from '../lib/sourceMeta.js'
import { AGENT_META } from '../lib/agentMeta.js'

// Where "Open →" sends you, keyed by activityStore's ref.kind.
const REF_ROUTE = {
  research: '/agent/raven', replies: '/agent/raven', tools: '/agent/titto',
  quill: '/agent/quill-x', koel: '/agent/koel', insights: '/agent/analyst',
}

function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function ActivityRow({ e, onOpen }) {
  const ag = AGENT_META[e.agent] || { label: e.agent, cls: '' }
  const isErr = e.status === 'error'
  const ref = e.ref

  return (
    <div className="activity-row">
      <span className={`sdot ${isErr ? 'crit' : 'good'}`} />
      <span className={`agent-badge ${ag.cls}`}>{ag.label}</span>
      <div className="body">
        <div className="main">{e.summary || e.action}</div>
        <div className="sub">{e.action}</div>
      </div>
      <span className={`run-trigger ${triggerClass(e.triggerLabel)}`}>{e.triggerLabel || '🖱 Manual'}</span>
      <span className="time">{timeAgo(e.ts)}</span>
      {ref?.kind && REF_ROUTE[ref.kind] && (
        <button className="btn sm" onClick={() => onOpen(ref)}>Open →</button>
      )}
    </div>
  )
}

export default function TittoPage() {
  const navigate = useNavigate()
  const activity = useActivity(100)
  useWSEvent('activity', () => activity.refetch())

  const entries = activity.data?.activity || []

  function onOpen(ref) {
    const route = REF_ROUTE[ref.kind]
    if (!route) return
    navigate(route, ref.id ? { state: { articleId: ref.id } } : undefined)
  }

  return (
    <div className="content">
      <div className="toolbar">
        <span style={{ fontSize: 13, fontWeight: 650 }}>Titto</span>
        <span className="hint">Activity — every run, who triggered it, what came out</span>
        <div className="spacer" />
        {entries[0] && <span className="hint">Last: {timeAgo(entries[0].ts)} · {entries.length} shown</span>}
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
        entries.map((e) => <ActivityRow key={e.id} e={e} onOpen={onOpen} />)
      )}
    </div>
  )
}
