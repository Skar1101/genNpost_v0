import { useState } from 'react'
import { useInsights, useChat, useBrandAudit, useTriggerBrandAudit } from '../lib/queries.js'

function Section({ title, items }) {
  if (!items?.length) return null
  return (
    <div className="insight-block">
      <h3>{title}</h3>
      <ul>{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </div>
  )
}

// Real X brand-gap audit — pulls Souvik's actual tweet history + real niche comparison
// (agents/analyst.js's auditBrand()). Not a Titto-chat-only feature — same data, dashboard view.
function BrandAuditCard() {
  const audit = useBrandAudit()
  const trigger = useTriggerBrandAudit()
  const a = audit.data?.audit

  function run() {
    trigger.mutate({})
  }

  return (
    <div className="card" style={{ padding: 18, marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontWeight: 650, fontSize: 14 }}>Brand Audit — real X performance</div>
        <div className="spacer" />
        <button className="btn sm" onClick={run} disabled={trigger.isPending}>
          {trigger.isPending ? 'Auditing…' : a ? '↻ Re-run' : '✨ Run audit'}
        </button>
      </div>

      {trigger.isError && <p className="hint" style={{ marginTop: 8, color: 'var(--crit, #e5484d)' }}>{trigger.error?.message || 'Audit failed.'}</p>}

      {!a ? (
        <p className="hint" style={{ marginTop: 10 }}>
          Pulls your real X tweet history (RapidAPI) and compares it against real high-performing posts
          already sitting in Raven's research pool for your niche — not generic advice, your actual
          numbers vs. what's actually landing right now. Run it to see where your posts are falling short.
        </p>
      ) : (
        <>
          <div className="hint" style={{ marginTop: 6 }}>
            {a.profile?.followers ?? '?'} followers · avg {a.ownStats?.avgEngagement ?? '?'} engagement /
            {' '}{a.ownStats?.avgViews ?? '?'} views per post ({a.ownStats?.sampleSize ?? '?'} real posts
            analyzed) · updated {a.updatedAt ? new Date(a.updatedAt).toLocaleDateString('en-IN') : '—'}
          </div>
          <p style={{ marginTop: 10, fontSize: 13.5, color: 'var(--muted)' }}>{a.summary}</p>

          <Section title="Gaps" items={a.gaps} />
          <Section title="Recommendations" items={a.recommendations} />

          <div style={{ display: 'flex', gap: 16, marginTop: 14, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 260px', minWidth: 240 }}>
              <div className="hint" style={{ fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>Your top real posts</div>
              {(a.topPerformers || []).slice(0, 5).map((t, i) => (
                <div key={i} className="card result-card" style={{ marginBottom: 6 }}>
                  <div className="result-why">{t.engagement} engagement · {t.views} views</div>
                  <div style={{ fontSize: 13 }}>{t.text}</div>
                  {t.url && <a className="result-url" href={t.url} target="_blank" rel="noreferrer">{t.url}</a>}
                </div>
              ))}
              {!a.topPerformers?.length && <div className="hint">None found.</div>}
            </div>
            <div style={{ flex: '1 1 260px', minWidth: 240 }}>
              <div className="hint" style={{ fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>Real niche virals right now</div>
              {(a.nicheComparison || []).slice(0, 5).map((t, i) => (
                <div key={i} className="card result-card" style={{ marginBottom: 6 }}>
                  <div className="result-why">@{t.publisher} · {t.engagement} engagement · {t.views} views</div>
                  <div style={{ fontSize: 13 }}>{t.text}</div>
                </div>
              ))}
              {!a.nicheComparison?.length && <div className="hint">None found — run /research first.</div>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default function AnalystPage() {
  const insights = useInsights();
  const chat = useChat()
  const [pasted, setPasted] = useState('')
  const [reply, setReply] = useState(null)

  const ins = insights.data?.insights

  function submitPerf() {
    if (!pasted.trim()) return
    chat.mutate(
      { message: `/perf ${pasted}` },
      { onSuccess: (data) => { setReply(data.reply); setPasted(''); insights.refetch() } },
    )
  }

  return (
    <div className="content">
      <BrandAuditCard />

      <div className="card" style={{ padding: 18, marginBottom: 18 }}>
        <div style={{ fontWeight: 650, fontSize: 13.5, marginBottom: 8 }}>Log this week's performance</div>
        <p className="hint" style={{ marginBottom: 10 }}>
          Paste your top &amp; bottom tweets with their stats (impressions, likes, replies) — Analyst matches them to drafts and refreshes what's working.
        </p>
        <textarea className="field" rows={4} placeholder="Paste tweet text + impressions/likes/replies, one block per tweet…"
          value={pasted} onChange={(e) => setPasted(e.target.value)} />
        <button className="btn primary" style={{ marginTop: 10 }} onClick={submitPerf} disabled={chat.isPending || !pasted.trim()}>
          {chat.isPending ? 'Logging…' : 'Log performance'}
        </button>
        {reply && <div className="draft-body" style={{ marginTop: 12, whiteSpace: 'pre-wrap' }}>{reply}</div>}
      </div>

      {insights.isLoading ? (
        <div className="card placeholder"><p>Loading insights…</p></div>
      ) : !ins ? (
        <div className="card placeholder">
          <h2>Not enough data yet</h2>
          <p>Approve a few drafts, then paste a week of tweet stats above. Insights will show up here.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontWeight: 650, fontSize: 14, marginBottom: 4 }}>What's working</div>
          {ins.updatedAt && <div className="hint">updated {new Date(ins.updatedAt).toLocaleDateString('en-IN')}</div>}
          <p style={{ marginTop: 10, fontSize: 13.5, color: 'var(--muted)' }}>{ins.summary}</p>

          <Section title="Hooks landing" items={ins.workingHooks} />
          <Section title="Formats landing" items={ins.workingFormats} />
          <Section title="Topics landing" items={ins.workingTopics} />
          <Section title="Avoid" items={ins.avoid} />
          <Section title="Research focus" items={ins.focus} />
          <Section title="Research downweight" items={ins.downweight} />

          {ins.sourceStats?.length > 0 && (
            <div className="insight-block">
              <h3>Source win-rates</h3>
              <div className="choice-row">
                {ins.sourceStats.filter((s) => s.decided >= 1).map((s) => (
                  <span key={s.source} className="chip">{s.source} · {Math.round((s.winRate || 0) * 100)}%</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
