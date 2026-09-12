import { useState } from 'react'
import { useParrotStatus, useParrotWrite, useParrotPlan, useParrotDraftFromSuggestion, useParrotSessions } from '../lib/queries.js'

const CATEGORY_LABEL = { career: 'Career growth', ai: 'AI / tech', 'building-in-public': 'Building in public' }

export default function ParrotPage() {
  const [tab, setTab] = useState('plan') // plan | write

  return (
    <div className="content">
      <ConnectionCard />
      <div className="choice-row" style={{ marginBottom: 14 }}>
        <button className={`choice-btn${tab === 'plan' ? ' is-active' : ''}`} onClick={() => setTab('plan')}>✨ Plan</button>
        <button className={`choice-btn${tab === 'write' ? ' is-active' : ''}`} onClick={() => setTab('write')}>✍️ Write</button>
      </div>
      {tab === 'plan' ? <PlanSection /> : <WriteSection />}
    </div>
  )
}

function ConnectionCard() {
  const status = useParrotStatus()
  const s = status.data

  if (status.isLoading) return <div className="card" style={{ padding: 16, marginBottom: 14 }}><p className="hint">Checking LinkedIn connection…</p></div>

  const connected = !!s?.connected
  const expiringSoon = !!s?.expiringSoon
  const ok = connected && s?.valid && !expiringSoon

  return (
    <div className="card" style={{ padding: 16, marginBottom: 14 }}>
      <div className="result-head">
        <span className={`pill ${ok ? 'good' : 'crit'}`}><span className="d" />
          {!connected ? 'LinkedIn not connected' : s.valid ? (expiringSoon ? `Expires in ~${s.daysLeft} day(s)` : 'LinkedIn connected') : 'LinkedIn token expired'}
        </span>
        {!ok && (
          <a className="btn sm" style={{ marginLeft: 'auto' }} href="/api/parrot/oauth/start">
            {connected ? '🔗 Reconnect LinkedIn' : '🔗 Connect LinkedIn'}
          </a>
        )}
      </div>
      <div className="result-why">
        {ok
          ? 'Approve on Parrot\'s Telegram bot (or the Queue page) posts to LinkedIn immediately — no further manual step.'
          : 'Content still generates and queues normally, but Approve can\'t actually post until this is connected. Standard LinkedIn apps have no silent refresh — expect to reconnect roughly every 60 days.'}
      </div>
    </div>
  )
}

function ParrotSuggestionItem({ item, category, sessionId }) {
  const [draft, setDraft] = useState(null) // { draft }
  const draftMut = useParrotDraftFromSuggestion()

  function pick() {
    draftMut.mutate({ suggestion: { ...item, category }, sessionId }, { onSuccess: (data) => setDraft(data) })
  }

  return (
    <div className="card result-card">
      <div className="result-head"><span className="result-title">{item.title}</span></div>
      {item.angle && <div className="result-why">{item.angle}</div>}
      {item.url && <a className="result-url" href={item.url} target="_blank" rel="noreferrer">{item.url}</a>}
      {!draft ? (
        <div className="choice-row" style={{ marginTop: 6 }}>
          <button className="choice-btn" disabled={draftMut.isPending} onClick={pick}>
            {draftMut.isPending ? 'Writing…' : '✍️ Draft & send to Parrot bot'}
          </button>
        </div>
      ) : (
        <div className="draft-body" style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{draft.draft}</div>
      )}
    </div>
  )
}

function PrevPlanBody({ session }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 10 }}>
      {(session.suggestions || []).map((g, gi) => (
        <div key={g.category || gi}>
          <div className="hint" style={{ fontWeight: 700, marginBottom: 4 }}>{CATEGORY_LABEL[g.category] || g.category}</div>
          {(g.items || []).map((it, ii) => {
            const draft = (session.drafts || []).find((d) => d.title === it.title && d.category === g.category)
            return (
              <div key={ii} className="card result-card" style={{ marginBottom: 6 }}>
                <div className="result-head"><span className="result-title">{it.title}</span></div>
                {it.angle && <div className="result-why">{it.angle}</div>}
                {!draft ? (
                  <div className="hint" style={{ fontStyle: 'italic' }}>no draft written for this suggestion</div>
                ) : (
                  <div className="draft-body" style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{draft.text}</div>
                )}
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
        <span className="run-count">{(session.categories || []).length} categories · {suggCount} suggestions · {draftCount} draft{draftCount === 1 ? '' : 's'}</span>
        <span className="run-arrow">{open ? '▼' : '▶'}</span>
      </div>
      {open && <div className="run-body" style={{ padding: 12 }}><PrevPlanBody session={session} /></div>}
    </div>
  )
}

function PlanSection() {
  const [forceFresh, setForceFresh] = useState(false)
  const [plan, setPlan] = useState(null) // { sessionId, suggestions }
  const planMut = useParrotPlan()
  const sessions = useParrotSessions()

  function planToday() {
    planMut.mutate({ forceFresh }, { onSuccess: (data) => setPlan(data) })
  }

  const prevSessions = (sessions.data?.sessions || []).slice(1)

  return (
    <>
      <div className="toolbar">
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--muted)' }}>
          <input type="checkbox" checked={forceFresh} onChange={(e) => setForceFresh(e.target.checked)} />
          Fresh search
        </label>
        <div className="spacer" />
        <button className="btn primary" onClick={planToday} disabled={planMut.isPending}>
          {planMut.isPending ? 'Planning…' : '✨ Plan LinkedIn Posts'}
        </button>
      </div>

      {!plan ? (
        <div className="card placeholder" style={{ marginTop: 14 }}>
          <p>Pulls from the same research Quill and Heron already use (Reddit/GitHub/HN/YouTube/arXiv/X)
          and matches items to career-growth, AI/tech, and building-in-public angles. This isn't literal
          LinkedIn-native trending data — LinkedIn's own API doesn't offer that at any access tier — it's
          the same cross-platform research, reframed for LinkedIn. Check "Fresh search" for a live Raven
          re-run instead of reusing today's cached research.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 14 }}>
          {plan.suggestions.map((g, gi) => (
            <div key={g.category || gi}>
              <div className="hint" style={{ fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                {CATEGORY_LABEL[g.category] || g.category}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(g.items || []).map((it, ii) => (
                  <ParrotSuggestionItem key={ii} item={it} category={g.category} sessionId={plan.sessionId} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {prevSessions.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div className="hint" style={{ fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>Previous plans</div>
          {prevSessions.map((s) => <PrevPlanRow key={s.id} session={s} />)}
        </div>
      )}
    </>
  )
}

function WriteSection() {
  const [topic, setTopic] = useState('')
  const [count, setCount] = useState(1)
  const [drafts, setDrafts] = useState([])
  const [copiedIdx, setCopiedIdx] = useState(null)
  const write = useParrotWrite()

  function onWrite() {
    if (!topic.trim()) return
    write.mutate({ topic, count }, { onSuccess: (data) => setDrafts(data.drafts || []) })
  }

  async function copy(i, t) {
    try { await navigator.clipboard.writeText(t); setCopiedIdx(i); setTimeout(() => setCopiedIdx(null), 1500) } catch (_) {}
  }

  return (
    <>
      <div className="toolbar">
        <input
          className="field" style={{ flex: 1, minWidth: 200 }}
          placeholder="What's the LinkedIn post about? — career growth, AI/tech, building in public"
          value={topic} onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onWrite()}
        />
        <input
          type="number" className="field" style={{ width: 70, flex: 'none' }} min={1} max={5}
          value={count} onChange={(e) => setCount(Math.max(1, Math.min(5, parseInt(e.target.value) || 1)))}
          title="Number of drafts"
        />
        <button className="btn primary" onClick={onWrite} disabled={write.isPending || !topic.trim()}>
          {write.isPending ? '✍️ Writing…' : '✍️ Write Post'}
        </button>
      </div>

      {drafts.length === 0 ? (
        <div className="card" style={{ padding: 26, marginTop: 14 }}>
          <div className="placeholder">
            <p>Give a topic and I'll write a professional, thought-leadership LinkedIn post — sent to Parrot's
            Telegram bot with Approve/Reject/Edit buttons. <b>Approve posts it to LinkedIn immediately</b> —
            this is the one agent in genNpost where that's real, not a draft hand-off.</p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
          {drafts.map((d, i) => (
            <div key={i} className="card result-card">
              <div className="draft-body" style={{ whiteSpace: 'pre-wrap' }}>{d}</div>
              <div className="draft-actions">
                <button className="act" onClick={() => copy(i, d)}>{copiedIdx === i ? 'Copied' : 'Copy'}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
