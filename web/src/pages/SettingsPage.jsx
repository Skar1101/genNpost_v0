import { useEffect, useState } from 'react'
import { useProfile, useSaveProfile, useReplyDomains, useSaveReplyDomains, useExpenses } from '../lib/queries.js'
import KeywordsCard from '../components/KeywordsCard.jsx'
import StrategyCard from '../components/StrategyCard.jsx'
import ArticlePreferencesCard from '../components/ArticlePreferencesCard.jsx'
import { AGENT_META } from '../lib/agentMeta.js'

const linesToArray = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean)
const arrayToLines = (a) => (a || []).join('\n')

function emptyForm() {
  return {
    identity: { name: '', handle: '', niche: '', audience: '', goal: '', deadline: '' },
    baseline: { followers: '', avgImpressions: '' },
    voice: { description: '', doRules: '', dontRules: '' },
    restrictions: '', watchlist: '', bestTweets: '',
  }
}

// Profile (nested objects + arrays) <-> flat form state (arrays as newline-joined strings for simple editing).
function profileToForm(p) {
  if (!p) return emptyForm()
  return {
    identity: { ...emptyForm().identity, ...p.identity },
    baseline: {
      followers: p.baseline?.followers ?? '',
      avgImpressions: p.baseline?.avgImpressions ?? '',
    },
    voice: {
      description: p.voice?.description || '',
      doRules: arrayToLines(p.voice?.doRules),
      dontRules: arrayToLines(p.voice?.dontRules),
    },
    restrictions: arrayToLines(p.restrictions),
    watchlist: arrayToLines(p.watchlist),
    bestTweets: arrayToLines((p.bestTweets || []).map((t) => (typeof t === 'string' ? t : t.url || t.text || ''))),
  }
}

function formToProfile(form, original) {
  return {
    ...original,
    identity: { ...original.identity, ...form.identity },
    baseline: {
      followers: form.baseline.followers === '' ? null : Number(form.baseline.followers),
      avgImpressions: form.baseline.avgImpressions === '' ? null : Number(form.baseline.avgImpressions),
    },
    voice: {
      ...original.voice,
      description: form.voice.description,
      doRules: linesToArray(form.voice.doRules),
      dontRules: linesToArray(form.voice.dontRules),
    },
    restrictions: linesToArray(form.restrictions),
    watchlist: linesToArray(form.watchlist),
    bestTweets: linesToArray(form.bestTweets),
  }
}

function istToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}
function daysAgoKey(n) {
  const d = new Date(Date.now() - n * 86400000)
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

function ExpensesCard() {
  const [window_, setWindow] = useState(30)
  // Always fetch the widest window once; 7d/30d/90d totals + the visible list are all derived
  // client-side from this, so switching the selector needs no extra request.
  const q = useExpenses(90)
  const allDays = q.data?.days || []

  const cutoff7 = daysAgoKey(6)
  const cutoff30 = daysAgoKey(29)
  const total7 = allDays.filter((d) => d.date >= cutoff7).reduce((s, d) => s + d.total, 0)
  const total30 = allDays.filter((d) => d.date >= cutoff30).reduce((s, d) => s + d.total, 0)
  const total90 = q.data?.grandTotal ?? 0

  const cutoff = window_ === 7 ? cutoff7 : window_ === 30 ? cutoff30 : daysAgoKey(89)
  const visibleDays = allDays.filter((d) => d.date >= cutoff)

  // Roll the per-day byAgent maps up over the selected window. The API has always returned this;
  // the card just wasn't showing it, so image spend was counted but invisible next to writing spend.
  const byAgent = {}
  for (const d of visibleDays) {
    for (const [agent, cost] of Object.entries(d.byAgent || {})) byAgent[agent] = (byAgent[agent] || 0) + cost
  }
  const agentRows = Object.entries(byAgent).sort((a, b) => b[1] - a[1])
  const windowTotal = agentRows.reduce((s, [, c]) => s + c, 0)

  return (
    <div className="card" style={{ padding: 18, marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontWeight: 650, fontSize: 14 }}>Expenses</div>
        <select className="select" style={{ marginLeft: 'auto', width: 100 }} value={window_} onChange={(e) => setWindow(Number(e.target.value))}>
          <option value={7}>7 days</option>
          <option value={30}>30 days</option>
          <option value={90}>90 days</option>
        </select>
      </div>
      <p className="hint" style={{ marginBottom: 12 }}>LLM API cost — total spend, day by day.</p>

      {!q.isLoading && (
        <div className="choice-row" style={{ marginBottom: 14 }}>
          <span className="chip">7d: ${total7.toFixed(4)}</span>
          <span className="chip">30d: ${total30.toFixed(4)}</span>
          <span className="chip">90d: ${total90.toFixed(4)}</span>
        </div>
      )}

      {q.isLoading ? (
        <p className="hint">Loading…</p>
      ) : !visibleDays.length ? (
        <p className="hint">No spend recorded yet.</p>
      ) : (
        <>
          {/* Where the money actually goes. Images are priced per image rather than per token, so
              they behave very differently from the writing spend and are worth seeing separately. */}
          {agentRows.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div className="hint" style={{ marginBottom: 6 }}>By agent, last {window_} days</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {agentRows.map(([agent, cost]) => {
                  const meta = AGENT_META[agent] || { label: agent, cls: '' }
                  const pct = windowTotal > 0 ? (cost / windowTotal) * 100 : 0
                  return (
                    <div key={agent} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className={`agent-badge ${meta.cls}`} style={{ flexShrink: 0 }}>{meta.label}</span>
                      <div style={{ flex: 1, height: 6, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)' }} />
                      </div>
                      <span className="mono" style={{ fontSize: 12, width: 74, textAlign: 'right' }}>${cost.toFixed(4)}</span>
                      <span className="hint" style={{ width: 38, textAlign: 'right' }}>{pct.toFixed(0)}%</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="hint" style={{ marginBottom: 6 }}>Day by day</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {visibleDays.map((d) => (
              <div key={d.date} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ width: 90, fontSize: 12.5, color: 'var(--muted)', flexShrink: 0 }}>{d.date === istToday() ? `${d.date} (today)` : d.date}</span>
                <span className="mono" style={{ fontWeight: 650, fontSize: 13, width: 70 }}>${d.total.toFixed(4)}</span>
                <span className="hint" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {Object.entries(d.byAgent || {})
                    .sort((a, b) => b[1] - a[1])
                    .map(([a, c]) => `${(AGENT_META[a] || { label: a }).label} $${c.toFixed(3)}`)
                    .join(' · ')}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default function SettingsPage() {
  const profileQ = useProfile()
  const saveProfile = useSaveProfile()
  const domainsQ = useReplyDomains()
  const saveDomains = useSaveReplyDomains()

  const [form, setForm] = useState(emptyForm())
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (profileQ.data?.profile) setForm(profileToForm(profileQ.data.profile))
  }, [profileQ.data])

  function set(section, field, value) {
    setForm((f) => (field == null ? { ...f, [section]: value } : { ...f, [section]: { ...f[section], [field]: value } }))
  }

  function save() {
    const merged = formToProfile(form, profileQ.data?.profile || {})
    saveProfile.mutate(merged, { onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2000) } })
  }

  function toggleDomain(id, currentlyEnabled) {
    const enabledExtras = (domainsQ.data?.domains || [])
      .filter((d) => !d.core && (d.id === id ? !currentlyEnabled : d.enabled))
      .map((d) => d.id)
    saveDomains.mutate(enabledExtras)
  }

  if (profileQ.isLoading) return <div className="content"><div className="card placeholder"><p>Loading profile…</p></div></div>

  return (
    <div className="content">
      <div className="card" style={{ padding: 18, marginBottom: 18 }}>
        <div style={{ fontWeight: 650, fontSize: 14, marginBottom: 14 }}>Creator profile</div>

        <div className="choice-row" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div style={{ flex: '1 1 200px' }}>
            <div className="hint" style={{ marginBottom: 4 }}>Name</div>
            <input className="field" value={form.identity.name} onChange={(e) => set('identity', 'name', e.target.value)} />
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <div className="hint" style={{ marginBottom: 4 }}>X handle</div>
            <input className="field" value={form.identity.handle} onChange={(e) => set('identity', 'handle', e.target.value)} placeholder="skar_connect" />
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div className="hint" style={{ marginBottom: 4 }}>Niche</div>
          <textarea className="field" rows={2} value={form.identity.niche} onChange={(e) => set('identity', 'niche', e.target.value)} />
        </div>

        <div className="choice-row" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div style={{ flex: '1 1 200px' }}>
            <div className="hint" style={{ marginBottom: 4 }}>Audience</div>
            <input className="field" value={form.identity.audience} onChange={(e) => set('identity', 'audience', e.target.value)} />
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <div className="hint" style={{ marginBottom: 4 }}>Goal</div>
            <input className="field" value={form.identity.goal} onChange={(e) => set('identity', 'goal', e.target.value)} placeholder="20k followers" />
          </div>
          <div style={{ flex: '1 1 140px' }}>
            <div className="hint" style={{ marginBottom: 4 }}>Deadline</div>
            <input className="field" value={form.identity.deadline} onChange={(e) => set('identity', 'deadline', e.target.value)} placeholder="2026-12-31" />
          </div>
        </div>

        <div className="choice-row" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div style={{ flex: '1 1 160px' }}>
            <div className="hint" style={{ marginBottom: 4 }}>Current followers</div>
            <input className="field" type="number" value={form.baseline.followers} onChange={(e) => set('baseline', 'followers', e.target.value)} />
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <div className="hint" style={{ marginBottom: 4 }}>Avg impressions</div>
            <input className="field" type="number" value={form.baseline.avgImpressions} onChange={(e) => set('baseline', 'avgImpressions', e.target.value)} />
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div className="hint" style={{ marginBottom: 4 }}>Voice description</div>
          <textarea className="field" rows={2} value={form.voice.description} onChange={(e) => set('voice', 'description', e.target.value)} />
        </div>

        <div className="choice-row" style={{ gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <div className="hint" style={{ marginBottom: 4 }}>Voice do's (one per line)</div>
            <textarea className="field" rows={4} value={form.voice.doRules} onChange={(e) => set('voice', 'doRules', e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="hint" style={{ marginBottom: 4 }}>Voice don'ts (one per line)</div>
            <textarea className="field" rows={4} value={form.voice.dontRules} onChange={(e) => set('voice', 'dontRules', e.target.value)} />
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div className="hint" style={{ marginBottom: 4 }}>Watchlist — handle or full profile link, one per line. Reposts prioritize these.</div>
          <textarea className="field" rows={2} placeholder="garyvee&#10;https://x.com/SahilBloom" value={form.watchlist} onChange={(e) => set('watchlist', null, e.target.value)} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <div className="hint" style={{ marginBottom: 4 }}>Best tweets — links or text, one per line (calibrates voice)</div>
          <textarea className="field" rows={3} value={form.bestTweets} onChange={(e) => set('bestTweets', null, e.target.value)} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <div className="hint" style={{ marginBottom: 4 }}>Restrictions — topics/words to avoid, one per line</div>
          <textarea className="field" rows={2} value={form.restrictions} onChange={(e) => set('restrictions', null, e.target.value)} />
        </div>

        <button className="btn primary" onClick={save} disabled={saveProfile.isPending}>
          {saveProfile.isPending ? 'Saving…' : saved ? '✓ Saved' : 'Save profile'}
        </button>
      </div>

      <div className="card" style={{ padding: 18 }}>
        <div style={{ fontWeight: 650, fontSize: 14, marginBottom: 4 }}>Reply-search domains</div>
        <p className="hint" style={{ marginBottom: 12 }}>Core domains are always on. Toggle the optional ones — they widen every /replies run.</p>
        <div className="choice-row">
          {(domainsQ.data?.domains || []).map((d) => (
            <button
              key={d.id}
              className={`choice-btn${d.enabled ? ' is-active' : ''}`}
              disabled={d.core || saveDomains.isPending}
              title={d.core ? 'Core domain — always on' : undefined}
              onClick={() => toggleDomain(d.id, d.enabled)}
            >
              {d.core ? '🔒 ' : ''}{d.label}
            </button>
          ))}
        </div>
      </div>

      <StrategyCard />

      <ArticlePreferencesCard />

      <KeywordsCard />

      <ExpensesCard />
    </div>
  )
}
