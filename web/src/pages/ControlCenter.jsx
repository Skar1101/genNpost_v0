import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Sparrow from '../components/Sparrow.jsx'
import SlotGrid from '../components/SlotGrid.jsx'
import { useAgents, useQueue, useSchedule, useReschedule, useGenerateIntoSlot } from '../lib/queries.js'
import { useWSEvent } from '../lib/ws.js'

const ROUTE = { raven: '/agent/raven', 'quill-x': '/agent/quill-x', parrot: '/agent/parrot', heron: '/agent/heron', koel: '/agent/koel', article: '/agent/article', image: '/agent/image', analyst: '/agent/analyst' }

// IST "today", the same way the backend computes it.
function istToday() {
  return new Date(Date.now() + (5 * 60 + 30) * 60 * 1000).toISOString().slice(0, 10)
}
function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().slice(0, 10)
}

// Write-into-slot composer. Deliberately minimal: a brief and a platform, because the point is to
// plan the shape of a week quickly, not to write here — the draft lands in the library to edit.
function FillSlotModal({ iso, onClose, onSubmit, pending }) {
  const [brief, setBrief] = useState('')
  const [platform, setPlatform] = useState('x')
  const [withImage, setWithImage] = useState(false)
  const when = new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal-card" onClick={(e) => e.stopPropagation()}>
        <div style={{ fontWeight: 650, fontSize: 14, marginBottom: 4 }}>Write into this slot</div>
        <div className="hint" style={{ marginBottom: 12 }}>{when} IST</div>

        <div className="choice-row" style={{ gap: 8, marginBottom: 10 }}>
          {['x', 'linkedin', 'substack'].map((p) => (
            <button key={p} className={`btn sm ${platform === p ? 'primary' : ''}`} onClick={() => setPlatform(p)}>
              {p === 'linkedin' ? 'LinkedIn' : p === 'substack' ? 'Substack' : 'X'}
            </button>
          ))}
        </div>

        <textarea
          className="field" rows={4} autoFocus
          placeholder="What should this post be about?"
          value={brief} onChange={(e) => setBrief(e.target.value)}
        />

        <label className="choice-row" style={{ gap: 6, marginTop: 10, alignItems: 'center', cursor: 'pointer' }}>
          <input type="checkbox" checked={withImage} onChange={(e) => setWithImage(e.target.checked)} />
          <span className="hint">Generate an image too</span>
        </label>

        <div className="choice-row" style={{ gap: 8, marginTop: 14 }}>
          <button className="btn primary sm" disabled={!brief.trim() || pending} onClick={() => onSubmit({ brief, platform, withImage })}>
            {pending ? 'Writing…' : 'Write it'}
          </button>
          <button className="btn sm" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

export default function ControlCenter() {
  const navigate = useNavigate()
  const [start, setStart] = useState(istToday())
  const [fillIso, setFillIso] = useState(null)

  const agents = useAgents()
  const queue = useQueue('generated')
  const schedule = useSchedule({ start, days: 7 })
  const reschedule = useReschedule()
  const generate = useGenerateIntoSlot()

  useWSEvent('activity', () => { agents.refetch(); schedule.refetch() })

  const pendingCount = queue.data?.drafts?.length ?? 0
  const list = agents.data?.agents || []
  const scheduledCount = (schedule.data?.grid || []).flatMap((d) => d.cells).filter((c) => c.asset).length

  function submitFill({ brief, platform, withImage }) {
    generate.mutate(
      { brief, platform, scheduledFor: fillIso, withImage },
      { onSuccess: () => setFillIso(null) },
    )
  }

  return (
    <div className="content">
      <div className="card titto">
        <Sparrow className="mark" />
        <div className="who">
          <div className="name">Titto <span>CHIEF OF STAFF</span></div>
          <div className="msg">
            {scheduledCount > 0
              ? `${scheduledCount} post${scheduledCount === 1 ? '' : 's'} scheduled this week.`
              : 'Nothing scheduled yet — click an empty slot to plan the week.'}
            {pendingCount > 0 ? ` ${pendingCount} draft${pendingCount === 1 ? '' : 's'} waiting on your call.` : ''}
          </div>
        </div>
        <div className="acts">
          <button className="btn sm" onClick={() => navigate('/library')}>Library</button>
          <button className="btn sm primary" onClick={() => navigate('/queue')}>Review {pendingCount}</button>
        </div>
      </div>

      <section className="section">
        <div className="section-head" style={{ alignItems: 'center' }}>
          <span className="eyebrow">This week</span>
          <div className="spacer" style={{ flex: 1 }} />
          <button className="btn sm" onClick={() => setStart(addDays(start, -7))}>←</button>
          <button className="btn sm" onClick={() => setStart(istToday())}>Today</button>
          <button className="btn sm" onClick={() => setStart(addDays(start, 7))}>→</button>
        </div>

        {schedule.isLoading ? (
          <div className="card placeholder"><p>Loading calendar…</p></div>
        ) : schedule.isError ? (
          <div className="card placeholder"><p>{schedule.error?.message}</p></div>
        ) : (
          <SlotGrid
            data={schedule.data}
            todayYmd={istToday()}
            busyIso={generate.isPending ? fillIso : null}
            onMove={(assetId, iso) => reschedule.mutate({ assetId, scheduledFor: iso })}
            onOpen={() => navigate('/library')}
            onFill={(iso) => setFillIso(iso)}
          />
        )}
        <div className="hint" style={{ marginTop: 10 }}>
          Drag to move · click an empty slot to write into it · LinkedIn posts itself at its slot, X and
          Substack arrive in Telegram ready to copy.
        </div>
      </section>

      <section className="section">
        <div className="section-head"><span className="eyebrow">Team</span></div>
        <div className="agent-strip">
          {list.map((a) => (
            <button key={a.id} className="agent-pill" onClick={() => ROUTE[a.id] && navigate(ROUTE[a.id])}>
              <span className={`sdot ${a.status === 'not-built' ? '' : 'good'}`} />
              <span className="nm">{a.name}</span>
              <span className="hint">{a.summary || a.role}</span>
            </button>
          ))}
        </div>
      </section>

      {fillIso && (
        <FillSlotModal
          iso={fillIso}
          pending={generate.isPending}
          onClose={() => !generate.isPending && setFillIso(null)}
          onSubmit={submitFill}
        />
      )}
    </div>
  )
}
