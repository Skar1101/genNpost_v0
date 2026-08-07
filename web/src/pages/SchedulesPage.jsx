import { useState } from 'react'
import { useScheduler, useSetScheduler, useSetHeronScheduler, useSetParrotScheduler, useSetScheduleTimes } from '../lib/queries.js'

const AGENT_LABEL = { raven: 'Raven', 'quill-x': 'Quill', heron: 'Heron', parrot: 'Parrot' }

// id -> the key schedulerStore/api.js use in the `times` object. Only the still-automatic slots are
// editable (evening research + the weekly wrap were deactivated — manual-only, not in this map).
const SLOT_TIME_KEY = { 'morning-research': 'morningResearch', 'daily-drop': 'dailyDrop', 'linkedin-drop': 'linkedinDrop' }

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

export default function SchedulesPage() {
  const scheduler = useScheduler()
  const setScheduler = useSetScheduler()
  const setHeronScheduler = useSetHeronScheduler()
  const setParrotScheduler = useSetParrotScheduler()
  const setScheduleTimes = useSetScheduleTimes()

  if (scheduler.isLoading) return <div className="content"><div className="card placeholder"><p>Loading schedule…</p></div></div>

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
    <div className="content">
      <div className="toolbar">
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>
          Morning research and the daily drop still run automatically, IST — pick a new time and hit
          Save; changes apply immediately, no restart needed. Evening research and the weekly wrap are
          deactivated (manual only — /research, /perf, or the dashboard). Manual commands always work
          regardless of this toggle.
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
        {mainSlots.map((s) => (
          <ScheduleSlotCard key={s.id} slot={s} onSave={saveSlotTime} saving={setScheduleTimes.isPending} />
        ))}
      </div>

      <div className="toolbar" style={{ marginTop: 24 }}>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>
          Heron runs 10 minutes after the daily drop above (not independently editable — change the
          daily drop's time and this follows). Off by default; the on-demand Heron page always works either way.
        </span>
        <div className="spacer" />
        <button
          className="btn sm"
          onClick={() => setHeronScheduler.mutate(!heronEnabled)}
          disabled={setHeronScheduler.isPending}
        >
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
          draft posts to LinkedIn immediately — off by default. The on-demand Parrot page always works
          either way, and posting still requires a connected LinkedIn account regardless of this toggle.
        </span>
        <div className="spacer" />
        <button
          className="btn sm"
          onClick={() => setParrotScheduler.mutate(!parrotEnabled)}
          disabled={setParrotScheduler.isPending}
        >
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
