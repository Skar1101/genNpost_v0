import { useNavigate } from 'react-router-dom'
import Sparrow from '../components/Sparrow.jsx'
import AgentCard from '../components/AgentCard.jsx'
import { useAgents, useQueue, useTriggerResearch, useChat } from '../lib/queries.js'
import { useWSEvent } from '../lib/ws.js'

const MONO = { raven: 'Rv', 'quill-x': 'Qu', parrot: 'Pt', heron: 'Hr', koel: 'Ko', article: 'Aw', analyst: 'An' }
const ROUTE = { raven: '/agent/raven', 'quill-x': '/agent/quill-x', parrot: '/agent/parrot', heron: '/agent/heron', koel: '/agent/koel', article: '/agent/article', analyst: '/agent/analyst' }

function fmtTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' })
}

export default function ControlCenter() {
  const navigate = useNavigate()
  const agents = useAgents()
  const queue = useQueue('generated')
  const triggerResearch = useTriggerResearch()
  const runDrop = useChat()

  useWSEvent('research_complete', () => agents.refetch())
  useWSEvent('activity', () => agents.refetch())

  const pendingCount = queue.data?.drafts?.length ?? 0

  function viewModel(a) {
    const runs = a.status === 'not-built'
      ? [{ k: 'Last', v: '—' }, { k: 'Next', v: '—' }]
      : a.nextRun
        ? [{ k: 'Last', v: fmtTime(a.lastRun) }, { k: 'Next', v: a.nextRun, next: true }]
        : [{ k: 'Mode', v: a.mode || 'on demand' }, { k: 'Last', v: fmtTime(a.lastRun) }]

    const acts = []
    if (a.status === 'not-built') {
      acts.push({ label: 'Connect source', primary: true, disabled: true, title: 'Not built yet — coming in a future update' })
    } else {
      acts.push({ label: 'Open', onClick: () => navigate(ROUTE[a.id]) })
      if (a.id === 'raven') {
        acts.push({ label: 'Run now', ghost: true, loading: triggerResearch.isPending, onClick: () => triggerResearch.mutate({}) })
      }
      if (a.id === 'quill-x') {
        acts.push({ label: 'Run drop', ghost: true, loading: runDrop.isPending, onClick: () => runDrop.mutate({ message: '/drop' }) })
      }
    }

    return {
      id: a.id, name: a.name, role: a.role, mono: MONO[a.id] || a.id.slice(0, 2).toUpperCase(),
      svc: a.kind === 'shared', status: a.status, out: a.summary, runs, acts,
    }
  }

  const list = agents.data?.agents || []
  const platformManagers = list.filter((a) => a.kind === 'platform').map(viewModel)
  const sharedTeam = list.filter((a) => a.kind === 'shared').map(viewModel)

  return (
    <div className="content">
      <div className="card titto">
        <Sparrow className="mark" />
        <div className="who">
          <div className="name">
            Titto <span>CHIEF OF STAFF</span>
          </div>
          <div className="msg">
            {pendingCount > 0 ? `${pendingCount} draft${pendingCount === 1 ? '' : 's'} waiting on your call.` : 'Queue is clear — nothing waiting on you right now.'}
          </div>
        </div>
        <div className="acts">
          <button className="btn sm" onClick={() => navigate('/agent/titto')}>Ask Titto</button>
          <button className="btn sm primary" onClick={() => navigate('/queue')}>Review {pendingCount}</button>
        </div>
      </div>

      {agents.isLoading ? (
        <div className="card placeholder" style={{ marginTop: 20 }}><p>Loading team status…</p></div>
      ) : agents.isError ? (
        <div className="card placeholder" style={{ marginTop: 20 }}>
          <h2>Couldn't load the team</h2>
          <p>{agents.error?.message || 'The backend may not be running.'}</p>
        </div>
      ) : (
        <>
          <section className="section">
            <div className="section-head"><span className="eyebrow">Platform managers</span></div>
            <div className="team g3">
              {platformManagers.map((a) => <AgentCard key={a.id} agent={a} />)}
            </div>
          </section>

          <section className="section">
            <div className="section-head"><span className="eyebrow">Team</span></div>
            <div className="team g4">
              {sharedTeam.map((a) => <AgentCard key={a.id} agent={a} />)}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
