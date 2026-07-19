import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DraftCard from '../components/DraftCard.jsx'
import { useKoelWrite, useKoelHistory, useKoelReload, useInsights } from '../lib/queries.js'

const FORMATS = [
  { id: 'short', label: 'Short Form', desc: 'Single tweet, punchy & direct, max 280 chars' },
  { id: 'thread', label: 'Thread', desc: '5–8 tweets, one CTA at the end' },
  { id: 'longform', label: 'Long Form', desc: '400–900 characters, single cohesive post' },
  { id: 'motivational', label: 'Motivational', desc: 'Personal, philosophy/resilience angle' },
  { id: 'engagement', label: 'Engagement', desc: 'Designed to invite replies' },
]
const INPUT_TYPES = [
  { id: 'freetext', label: 'Topic / Instruction' },
  { id: 'url', label: 'Paste URL' },
  { id: 'topic', label: 'From Research' },
]

export default function KoelPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('write')
  const [format, setFormat] = useState('short')
  const [inputType, setInputType] = useState('freetext')
  const [input, setInput] = useState('')
  const [extra, setExtra] = useState('')
  const [showExtra, setShowExtra] = useState(false)
  const [count, setCount] = useState(3)
  const [result, setResult] = useState(null)
  const [reloadMsg, setReloadMsg] = useState('')

  const write = useKoelWrite()
  const history = useKoelHistory()
  const reload = useKoelReload()
  const insights = useInsights()

  function reloadFiles() {
    reload.mutate(undefined, {
      onSuccess: (data) => setReloadMsg(data.message || 'Reloaded.'),
      onError: (err) => setReloadMsg(`Failed: ${err.message}`),
    })
  }

  function generate() {
    if (!input.trim()) return
    write.mutate(
      { format, input, inputType, count, extraInstructions: extra },
      { onSuccess: (data) => setResult(data) },
    )
  }

  const fmt = FORMATS.find((f) => f.id === format)

  return (
    <div className="content">
      <div className="toolbar">
        <div className="tabs">
          <button className={tab === 'write' ? 'is-active' : ''} onClick={() => setTab('write')}>Write</button>
          <button className={tab === 'history' ? 'is-active' : ''} onClick={() => setTab('history')}>History</button>
        </div>
        <div className="spacer" />
        <button className="btn sm" onClick={reloadFiles} disabled={reload.isPending} title="Reload knowledge files (profile, voice, approvals) after editing">
          {reload.isPending ? 'Reloading…' : '↻ Reload Files'}
        </button>
      </div>
      {reloadMsg && <div className="hint" style={{ margin: '8px 0 0' }}>{reloadMsg}</div>}

      {tab === 'write' && (
        <>
          <div className="card" style={{ padding: 18, marginBottom: 18 }}>
            <div style={{ fontWeight: 650, fontSize: 13.5, marginBottom: 12 }}>Write an X Post</div>

            <div style={{ marginBottom: 12 }}>
              <div className="hint" style={{ marginBottom: 6 }}>Format</div>
              <div className="choice-row">
                {FORMATS.map((f) => (
                  <button key={f.id} className={`choice-btn${format === f.id ? ' is-active' : ''}`} onClick={() => setFormat(f.id)}>
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="hint" style={{ marginTop: 6 }}>{fmt?.desc}</div>
            </div>

            <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="hint">Number of drafts</div>
              <input
                className="field" type="number" min={1} max={10} style={{ width: 70 }}
                value={count} onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <div className="hint" style={{ marginBottom: 6 }}>Input</div>
              <div className="choice-row" style={{ marginBottom: 8 }}>
                {INPUT_TYPES.map((t) => (
                  <button key={t.id} className={`choice-btn${inputType === t.id ? ' is-active' : ''}`} onClick={() => setInputType(t.id)}>
                    {t.label}
                  </button>
                ))}
              </div>
              <textarea
                className="field" rows={3}
                placeholder="Describe the topic, paste a URL, or give an instruction…"
                value={input} onChange={(e) => setInput(e.target.value)}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <button className="link-btn" onClick={() => setShowExtra((s) => !s)}>
                {showExtra ? '▼' : '▶'} Extra instructions (optional)
              </button>
              {showExtra && (
                <textarea
                  className="field" rows={2} style={{ marginTop: 8 }}
                  placeholder="e.g. Make it more personal, reference the transplant story, use lowercase…"
                  value={extra} onChange={(e) => setExtra(e.target.value)}
                />
              )}
            </div>

            <button className="btn primary" style={{ width: '100%', justifyContent: 'center' }} onClick={generate} disabled={write.isPending || !input.trim()}>
              {write.isPending ? 'Writing…' : '✍️ Generate Drafts'}
            </button>
          </div>

          {(() => {
            const ins = insights.data?.insights
            if (!ins || (!ins.workingFormats?.length && !ins.avoid?.length)) return null
            return (
              <div className="card" style={{ padding: '10px 14px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span className="hint" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>What's working</span>
                {(ins.workingFormats || []).slice(0, 3).map((f, i) => <span key={`f${i}`} className="chip">✅ {f}</span>)}
                {(ins.avoid || []).slice(0, 2).map((a, i) => <span key={`a${i}`} className="chip">🚫 {a}</span>)}
                <button className="link-btn" style={{ marginLeft: 'auto' }} onClick={() => navigate('/agent/analyst')}>→ Analyst</button>
              </div>
            )
          })()}

          {write.isPending && (
            <div className="card working"><div className="spin">✍️</div><div>Koel is writing…</div><div className="step mono">Crafting drafts in your voice</div></div>
          )}

          {result && !write.isPending && (
            <div className="drafts">
              {result.draftRecords.map((rec, i) => (
                <DraftCard key={rec.id} draft={{ id: rec.id, text: rec.text, format: result.format, origin: 'koel', platform: 'x', meta: {} }} />
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'history' && (
        history.isLoading ? (
          <div className="card placeholder"><p>Loading history…</p></div>
        ) : !history.data?.length ? (
          <div className="card placeholder"><h2>No history yet</h2><p>Generate some drafts first.</p></div>
        ) : (
          <div className="drafts">
            {history.data.slice().reverse().slice(0, 50).map((h, i) => (
              <div key={i} className="card result-card">
                <div className="result-head">
                  <span className="result-title">{h.format} · {(h.input || '').slice(0, 80)}</span>
                </div>
                <div className="result-meta"><span>{new Date(h.generatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</span></div>
                <div className="draft-body">{(h.drafts && h.drafts[0]) || ''}</div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}
