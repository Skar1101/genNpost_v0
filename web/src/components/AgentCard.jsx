export default function AgentCard({ agent }) {
  return (
    <div className="card agent">
      <div className="agent-top">
        <div className={'mono-av' + (agent.svc ? ' svc' : '')}>{agent.mono}</div>
        <div className="id">
          <div className="n">{agent.name}</div>
          <div className="r">{agent.role}</div>
        </div>
        <span className={`pill ${agent.status === 'setup' || agent.status === 'not-built' ? 'warn' : 'good'}`}>
          <span className="d" />
          {agent.status}
        </span>
      </div>
      <div className="out">{agent.out}</div>
      <div className="runs">
        {agent.runs.map((run) => (
          <div key={run.k}>
            <div className="k">{run.k}</div>
            <div className={'v' + (run.next ? ' next' : '')}>{run.v}</div>
          </div>
        ))}
        <div style={{ flex: 1 }} />
      </div>
      <div className="acts">
        {agent.acts.map((a) => (
          <button
            key={a.label}
            className={'btn sm' + (a.primary ? ' primary' : '') + (a.ghost ? ' ghost' : '')}
            onClick={a.onClick}
            disabled={a.disabled || a.loading}
            title={a.title}
          >
            {a.loading ? '…' : a.label}
          </button>
        ))}
      </div>
    </div>
  )
}
