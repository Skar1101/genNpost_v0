import { useScheduler, useSetScheduler } from '../lib/queries.js'

const AGENT_LABEL = { raven: 'Raven', 'quill-x': 'Quill' }

export default function SchedulesPage() {
  const scheduler = useScheduler()
  const setScheduler = useSetScheduler()

  if (scheduler.isLoading) return <div className="content"><div className="card placeholder"><p>Loading schedule…</p></div></div>

  const enabled = !!scheduler.data?.enabled
  const slots = scheduler.data?.slots || []

  return (
    <div className="content">
      <div className="toolbar">
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>
          All scheduled research + drop runs, IST. Manual commands (/research, /drop, /batch) always work regardless of this toggle.
        </span>
        <div className="spacer" />
        <button
          className="btn sm"
          onClick={() => setScheduler.mutate(!enabled)}
          disabled={setScheduler.isPending}
        >
          <span className={`sdot ${enabled ? 'good' : 'crit'}`} /> Auto-runs: {enabled ? 'ON' : 'OFF'}
        </button>
      </div>

      <div className="drafts">
        {slots.map((s) => (
          <div key={s.id} className="card result-card">
            <div className="result-head">
              <span className="result-title mono">{s.time}</span>
              <span className="pill good"><span className="d" />{AGENT_LABEL[s.agent] || s.agent}</span>
            </div>
            <div className="result-why">{s.what}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
