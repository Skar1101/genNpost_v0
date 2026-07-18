import { useState } from 'react'
import {
  useQuillPillars, useQuillPlan, useQuillDraft, useQuillRefine, useQuillLatest,
} from '../lib/queries.js'
import { useWSEvent } from '../lib/ws.js'

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

export default function QuillPage() {
  const [forceFresh, setForceFresh] = useState(false)
  const [plan, setPlan] = useState(null) // { sessionId, suggestions }

  const pillars = useQuillPillars()
  const planMut = useQuillPlan()
  const latest = useQuillLatest()

  useWSEvent('quill_complete', () => latest.refetch())
  useWSEvent('quill_suggestions_complete', (data) => setPlan(data))

  function planToday() {
    planMut.mutate({ forceFresh }, { onSuccess: (data) => setPlan(data) })
  }

  return (
    <div className="content">
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
        <div className="card placeholder"><h2>No plan yet</h2><p>Click "Plan Today's Posts" to get 2–3 trending angles per pillar.</p></div>
      )}
    </div>
  )
}
