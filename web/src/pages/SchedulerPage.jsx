import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import Sparrow from '../components/Sparrow.jsx'
import SlotGrid from '../components/SlotGrid.jsx'
import {
  useAgents, useQueue, useSchedule, useReschedule, useGenerateIntoSlot,
  useScheduler, useSetScheduler, useSetHeronScheduler, useSetParrotScheduler, useSetScheduleTimes,
} from '../lib/queries.js'
import { useWSEvent } from '../lib/ws.js'

// Merged 2026-09-12: this page used to be split across Control Center (the visual weekly grid) and a
// separate Schedules page (auto-run on/off + per-slot times). One page now — the grid is what you look
// at daily, the on/off settings are a secondary panel you open when you actually need to change them.
const ROUTE = { raven: '/agent/raven', 'quill-x': '/agent/quill-x', parrot: '/agent/parrot', heron: '/agent/heron', koel: '/agent/koel', article: '/agent/article', image: '/agent/image', analyst: '/agent/analyst' }
const AGENT_LABEL = { raven: 'Raven', 'quill-x': 'Quill', heron: 'Heron', parrot: 'Parrot' }
const SLOT_TIME_KEY = { 'morning-research': 'morningResearch', 'daily-drop': 'dailyDrop', 'linkedin-drop': 'linkedinDrop' }

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
// The IST calendar date an instant falls on — same math scheduleStore.js uses server-side.
function istDateOfIso(iso) {
  return new Date(new Date(iso).getTime() + (5 * 60 + 30) * 60 * 1000).toISOString().slice(0, 10)
}

// Write-into-slot composer. Deliberately minimal: a brief and a platform, because the point is to
// plan the shape of a week quickly, not to write here — the draft lands in the library to edit.
function FillSlotModal({ iso, onClose, onSubmit, pending }) {
  const [brief, setBrief] = useState('')
  const [platform, setPlatform] = useState('x')
  const [withImage, setWithImage] = useState(true)
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
          <span className="hint">Generate an image too (adds a small per-image cost — see Settings → Expenses)</span>
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

function ScheduleSlotCard({ slot, onSave, saving }) {
  const [time, setTime] = useState(slot.hhmm || '')
  const dirty = slot.editable && time !== slot.hhmm

  return (
    <div className="card result-card">
      <div className="result-head">
        {slot.editable ? (
          <input
            type="time" className="field mono" style={{ width: 130 }}
            value={time} onChange={(e) => setTime(e.target.value)}
          />
        ) : (
          <span className="result-title mono">{slot.time}</span>
        )}
        <span className="pill good"><span className="d" />{AGENT_LABEL[slot.agent] || slot.agent}</span>
        {dirty && (
          <button className="btn sm" style={{ marginLeft: 'auto' }} disabled={saving} onClick={() => onSave(slot.id, time)}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        )}
      </div>
      <div className="result-why">{slot.what}</div>
    </div>
  )
}

// The on/off + per-slot-time settings, collapsed by default — the calendar grid above is what you
// look at day to day, this is what you open only when you actually want to change the automation.
function ScheduleSettingsPanel() {
  const scheduler = useScheduler()
  const setScheduler = useSetScheduler()
  const setHeronScheduler = useSetHeronScheduler()
  const setParrotScheduler = useSetParrotScheduler()
  const setScheduleTimes = useSetScheduleTimes()

  if (scheduler.isLoading) return <p className="hint">Loading schedule settings…</p>

  const enabled = !!scheduler.data?.enabled
  const heronEnabled = !!scheduler.data?.heronEnabled
  const parrotEnabled = !!scheduler.data?.parrotEnabled
  const slots = scheduler.data?.slots || []
  const mainSlots = slots.filter((s) => s.agent !== 'heron' && s.agent !== 'parrot')
  const heronSlots = slots.filter((s) => s.agent === 'heron')
  const parrotSlots = slots.filter((s) => s.agent === 'parrot')

  function saveSlotTime(slotId, hhmm) {
    const key = SLOT_TIME_KEY[slotId]
    if (!key || !hhmm) return
    setScheduleTimes.mutate({ [key]: hhmm })
  }

  return (
    <div>
      <div className="toolbar">
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>
          Morning research and the daily drop still run automatically, IST — pick a new time and hit
          Save; changes apply immediately, no restart needed. Evening research and the weekly wrap are
          deactivated (manual only — /research, /perf, or the dashboard).
        </span>
        <div className="spacer" />
        <button className="btn sm" onClick={() => setScheduler.mutate(!enabled)} disabled={setScheduler.isPending}>
          <span className={`sdot ${enabled ? 'good' : 'crit'}`} /> Auto-runs: {enabled ? 'ON' : 'OFF'}
        </button>
      </div>
      <div className="drafts">
        {mainSlots.map((s) => (
          <ScheduleSlotCard key={s.id} slot={s} onSave={saveSlotTime} saving={setScheduleTimes.isPending} />
        ))}
      </div>

      <div className="toolbar" style={{ marginTop: 24 }}>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>
          Heron runs 10 minutes after the daily drop above (not independently editable). Off by default;
          the on-demand Heron page always works either way.
        </span>
        <div className="spacer" />
        <button className="btn sm" onClick={() => setHeronScheduler.mutate(!heronEnabled)} disabled={setHeronScheduler.isPending}>
          <span className={`sdot ${heronEnabled ? 'good' : 'crit'}`} /> Heron auto-runs: {heronEnabled ? 'ON' : 'OFF'}
        </button>
      </div>
      <div className="drafts">
        {heronSlots.map((s) => (
          <ScheduleSlotCard key={s.id} slot={s} onSave={saveSlotTime} saving={setScheduleTimes.isPending} />
        ))}
      </div>

      <div className="toolbar" style={{ marginTop: 24 }}>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>
          Parrot has its own time, editable below. Unlike every other toggle here, Approve on a Parrot
          draft posts to LinkedIn immediately — off by default. Posting still requires a connected
          LinkedIn account regardless of this toggle.
        </span>
        <div className="spacer" />
        <button className="btn sm" onClick={() => setParrotScheduler.mutate(!parrotEnabled)} disabled={setParrotScheduler.isPending}>
          <span className={`sdot ${parrotEnabled ? 'good' : 'crit'}`} /> Parrot auto-runs: {parrotEnabled ? 'ON' : 'OFF'}
        </button>
      </div>
      <div className="drafts">
        {parrotSlots.map((s) => (
          <ScheduleSlotCard key={s.id} slot={s} onSave={saveSlotTime} saving={setScheduleTimes.isPending} />
        ))}
      </div>
    </div>
  )
}

export default function SchedulerPage() {
  const navigate = useNavigate()
  const location = useLocation()
  // Arriving here from Studio's "Set" button (see StudioPage.jsx's scheduleAt) — jump to the week
  // that post landed in and flash its cell, so Set actually shows you it's on the calendar instead of
  // just trusting it happened.
  const highlightIso = location.state?.highlightIso || null
  const [start, setStart] = useState(() => (highlightIso ? istDateOfIso(highlightIso) : istToday()))
  const [fillIso, setFillIso] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

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
        <div className="section-head with-icon">
          <span className="section-icon tone-green">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M3 10h18M8 2v4M16 2v4" /></svg>
          </span>
          <span className="section-title">This week</span>
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
            highlightIso={highlightIso}
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

      <section className="section" id="schedule-settings">
        <div className="section-head with-icon">
          <span className="section-icon tone-amber">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#966516" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>
          </span>
          <span className="section-title">Schedule settings</span>
          <div className="spacer" style={{ flex: 1 }} />
          <button className="btn sm" onClick={() => setSettingsOpen((v) => !v)}>
            {settingsOpen ? 'Hide' : 'Show'} auto-run times
          </button>
        </div>
        {settingsOpen && (
          <div className="card" style={{ padding: 18 }}>
            <ScheduleSettingsPanel />
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head with-icon">
          <span className="section-icon tone-purple">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#5b4bc4" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
          </span>
          <span className="section-title">Team</span>
        </div>
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
