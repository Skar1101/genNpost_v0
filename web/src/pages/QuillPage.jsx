import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useQuillPillars, useQuillPlan, useQuillDraft, useQuillRefine, useQuillLatest,
  useQuillTriggerDaily, useQuillTriggerWeekly, useQuillSessions, useResearch,
} from '../lib/queries.js'
import { useWSEvent } from '../lib/ws.js'
import { openWithPrefill } from '../lib/tittoDockStore.js'
import { SOURCE_META, scoreClass } from '../lib/sourceMeta.js'

const FORMATS = ['short', 'medium', 'long', 'thread']

function SuggestionItem({ item, pillar, sessionId }) {
  const [draft, setDraft] = useState(null) // { uid, draft, format }
  const [refineText, setRefineText] = useState('')
  const draftMut = useQuillDraft()
  const refineMut = useQuillRefine()

  function pick(format) {
    draftMut.mutate(
      { suggestion: { ...item, pillar }, format, sessionId },
      { onSuccess: (data) => setDraft(data) },
    )
  }
  function refine() {
    if (!refineText.trim() || !draft) return
    refineMut.mutate(
      { draftText: draft.draft, instruction: refineText, format: draft.format, sessionId, draftUid: draft.uid },
      { onSuccess: (data) => { setDraft((d) => ({ ...d, draft: data.draft })); setRefineText('') } },
    )
  }

  return (
    <div className="card result-card">
      <div className="result-head"><span className="result-title">{item.title}</span></div>
      {item.angle && <div className="result-why">{item.angle}</div>}
      {item.url && <a className="result-url" href={item.url} target="_blank" rel="noreferrer">{item.url}</a>}

      {!draft ? (
        <div className="choice-row" style={{ marginTop: 6 }}>
          {FORMATS.map((f) => (
            <button key={f} className="choice-btn" disabled={draftMut.isPending} onClick={() => pick(f)}>{f}</button>
          ))}
        </div>
      ) : (
        <>
          <div className="draft-body" style={{ marginTop: 6 }}>{draft.draft}</div>
          <div className="draft-actions">
            <button className="act" onClick={() => navigator.clipboard.writeText(draft.draft)}>Copy</button>
            <button className="act" onClick={() => setDraft(null)}>Redo</button>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input
              className="field" placeholder="Refine instruction… e.g. tighten the hook"
              value={refineText} onChange={(e) => setRefineText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && refine()}
            />
            <button className="btn sm" onClick={refine} disabled={refineMut.isPending || !refineText.trim()}>Refine</button>
          </div>
        </>
      )}
    </div>
  )
}

function LatestSearchCard() {
  const research = useResearch()
  const items = (research.data?.results || []).slice(0, 10)
  if (!research.data || items.length === 0) return null

  const when = research.data.rankedAt
    ? new Date(research.data.rankedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })
    : ''

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <span className="hint" style={{ textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>
          🔎 Latest search {when && <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>· {items.length} items · {when} IST</span>}
        </span>
        <button className="btn sm" onClick={() => research.refetch()}>↻ Refresh</button>
      </div>
      {items.map((s, i) => {
        const srcMeta = SOURCE_META[s.source] || { label: s.source || 'news', cls: 'src-news' }
        return (
          <div key={s.url || i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', borderBottom: '1px solid var(--border)' }}>
            <span className="hint mono" style={{ width: 18, flexShrink: 0 }}>{i + 1}</span>
            <span className={`src-badge ${srcMeta.cls}`}>{srcMeta.label}</span>
            <span style={{ flex: 1, fontSize: 12.5, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</span>
            <span className={`score ${scoreClass(s.trendingScore || 0)}`} style={{ flexShrink: 0 }}>{s.trendingScore || '?'}</span>
            <button className="row-act ask" onClick={() => openWithPrefill(`Tell me more about: ${s.title}`)}>Ask Titto</button>
            {s.url && <a className="row-link" href={s.url} target="_blank" rel="noreferrer">↗</a>}
          </div>
        )
      })}
    </div>
  )
}

function PrevPlanBody({ session }) {
  const draftsBySid = {}
  for (const d of session.drafts || []) {
    if (!d.sid || d.format === 'article') continue
    ;(draftsBySid[d.sid] ||= []).push(d)
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 10 }}>
      {(session.suggestions || []).map((g, gi) => (
        <div key={g.pillar || gi}>
          <div className="hint" style={{ fontWeight: 700, marginBottom: 4 }}>{g.pillar || 'Pillar'}</div>
          {(g.items || []).map((it, ii) => {
            const sid = `s${gi}-${ii}`
            const drafts = draftsBySid[sid] || []
            return (
              <div key={sid} className="card result-card" style={{ marginBottom: 6 }}>
                <div className="result-head"><span className="result-title">{it.title}</span></div>
                {it.angle && <div className="result-why">{it.angle}</div>}
                {drafts.length === 0 ? (
                  <div className="hint" style={{ fontStyle: 'italic' }}>no draft written for this suggestion</div>
                ) : drafts.map((d, di) => (
                  <div key={di} className="draft-body" style={{ marginTop: 6 }}>
                    <span className="hint" style={{ fontWeight: 700 }}>{(d.formatLabel || d.format || 'draft').toUpperCase()}</span>
                    <div>{d.text}</div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function PrevPlanRow({ session }) {
  const [open, setOpen] = useState(false)
  const when = session.createdAt
    ? new Date(session.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })
    : ''
  const suggCount = (session.suggestions || []).reduce((n, g) => n + (g.items?.length || 0), 0)
  const draftCount = (session.drafts || []).length

  return (
    <div className="run-section">
      <div className={`run-header${open ? '' : ' is-collapsed'}`} onClick={() => setOpen((o) => !o)}>
        <span className="run-time">{when}</span>
        <span className="hint">{session.triggerLabel || '🖱 Plan button'}</span>
        <span className="run-count">{(session.pillars || []).length} pillars · {suggCount} suggestions · {draftCount} draft{draftCount === 1 ? '' : 's'}</span>
        <span className="run-arrow">{open ? '▼' : '▶'}</span>
      </div>
      {open && <div className="run-body" style={{ padding: 12 }}><PrevPlanBody session={session} /></div>}
    </div>
  )
}

export default function QuillPage() {
  const navigate = useNavigate()
  const [forceFresh, setForceFresh] = useState(false)
  const [plan, setPlan] = useState(null) // { sessionId, suggestions }
  const [dailyStatus, setDailyStatus] = useState('')
  const [weeklyStatus, setWeeklyStatus] = useState('')

  const pillars = useQuillPillars()
  const planMut = useQuillPlan()
  const latest = useQuillLatest()
  const dailyMut = useQuillTriggerDaily()
  const weeklyMut = useQuillTriggerWeekly()
  const sessions = useQuillSessions()

  useWSEvent('quill_complete', () => latest.refetch())
  useWSEvent('quill_suggestions_complete', (data) => setPlan(data))

  function planToday() {
    planMut.mutate({ forceFresh }, { onSuccess: (data) => setPlan(data) })
  }
  function generateToday() {
    setDailyStatus('Writing…')
    dailyMut.mutate(undefined, {
      onSuccess: () => setDailyStatus('Started — drafts will arrive via Telegram + here shortly.'),
      onError: (err) => setDailyStatus(`Failed: ${err.message}`),
    })
  }
  function weeklyRun() {
    setWeeklyStatus('Running…')
    weeklyMut.mutate(undefined, {
      onSuccess: () => setWeeklyStatus('Weekly run triggered — check Telegram for results.'),
      onError: (err) => setWeeklyStatus(`Failed: ${err.message}`),
    })
  }

  // Skip the current in-progress session (first in the list) in "Previous plans".
  const prevSessions = (sessions.data?.sessions || []).slice(1)

  return (
    <div className="content">
      <div className="toolbar">
        <span style={{ fontSize: 13, fontWeight: 650 }}>Quill</span>
        <span className="hint">Daily Content Agent</span>
        <div className="spacer" />
        <button className="btn sm" onClick={() => navigate('/agent/article')}>📰 Write Article</button>
        <button className="btn sm" onClick={generateToday} disabled={dailyMut.isPending}>
          {dailyMut.isPending ? 'Writing…' : '✍️ Generate Today'}
        </button>
        <button className="btn sm" onClick={weeklyRun} disabled={weeklyMut.isPending}>
          {weeklyMut.isPending ? 'Running…' : '📝 Weekly Run'}
        </button>
      </div>
      {(dailyStatus || weeklyStatus) && (
        <div className="hint" style={{ marginBottom: 12 }}>{[dailyStatus, weeklyStatus].filter(Boolean).join('  ·  ')}</div>
      )}

      <div className="card" style={{ padding: 14, marginBottom: 16 }}>
        <div className="hint" style={{ marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>Content pillars</div>
        <div className="choice-row">
          {(pillars.data?.pillars || []).map((p) => (
            <span key={p.id || p.label} className="chip">{p.label}</span>
          ))}
          {pillars.data && pillars.data.pillars.length === 0 && <span className="hint">No pillars defined — edit sub-agents/quill/PILLARS.md</span>}
        </div>
      </div>

      <div className="toolbar">
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--muted)' }}>
          <input type="checkbox" checked={forceFresh} onChange={(e) => setForceFresh(e.target.checked)} />
          Fresh search
        </label>
        <div className="spacer" />
        <button className="btn primary" onClick={planToday} disabled={planMut.isPending}>
          {planMut.isPending ? 'Planning…' : '✨ Plan Today\'s Posts'}
        </button>
      </div>

      {planMut.isPending && (
        <div className="card working">
          <div className="spin">🪶</div>
          <div>Quill is planning your posts…</div>
          <div className="step mono">Fresh research + matching pillars can take up to 90 seconds</div>
        </div>
      )}

      {plan && !planMut.isPending && (
        <div className="section">
          {plan.suggestions.map((group) => (
            <div key={group.pillar} style={{ marginBottom: 18 }}>
              <div className="section-head"><span className="eyebrow">{group.pillar}</span></div>
              <div className="drafts">
                {group.items.map((item, i) => (
                  <SuggestionItem key={i} item={item} pillar={group.pillar} sessionId={plan.sessionId} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {!plan && !planMut.isPending && (
        <div className="card placeholder" style={{ marginBottom: 16 }}><h2>No plan yet</h2><p>Click "Plan Today's Posts" to get 2–3 trending angles per pillar.</p></div>
      )}

      <LatestSearchCard />

      {prevSessions.length > 0 && (
        <div className="section" style={{ marginTop: 20 }}>
          <div className="section-head"><span className="eyebrow">Previous plans</span></div>
          {prevSessions.map((s) => <PrevPlanRow key={s.id} session={s} />)}
        </div>
      )}
    </div>
  )
}
