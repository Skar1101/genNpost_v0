import { useMemo, useState } from 'react'
import DraftCard from '../components/DraftCard.jsx'
import {
  useResearchRuns, useTriggerResearch, useReplies, useTriggerReplies, useDraftReply,
  useScheduler, useSetScheduler, useKoelWrite, useLogText,
} from '../lib/queries.js'
import { useWSEvent } from '../lib/ws.js'
import { openWithPrefill } from '../lib/tittoDockStore.js'
import { SOURCES, TYPES, SOURCE_META, relTime, scoreClass, triggerClass } from '../lib/sourceMeta.js'

const LOG_TABS = [
  { id: 'today', label: 'Today' },
  { id: 'errors', label: 'Errors only' },
  { id: 'scrape/hackernews', label: 'Hacker News' },
  { id: 'scrape/reddit', label: 'Reddit' },
  { id: 'scrape/github', label: 'GitHub' },
  { id: 'scrape/twitter', label: 'Twitter' },
  { id: 'scrape/youtube', label: 'YouTube' },
  { id: 'scrape/arxiv', label: 'arXiv' },
  { id: 'scrape/raven', label: 'Raven' },
]

function LogsView() {
  const [logTab, setLogTab] = useState('today')
  const log = useLogText(logTab)

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 650 }}>Scrape Logs</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {LOG_TABS.map((t) => (
            <button key={t.id} className={`chip${logTab === t.id ? ' is-active' : ''}`} onClick={() => setLogTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => log.refetch()}>↻ Refresh</button>
      </div>
      <pre className="mono" style={{
        background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12,
        padding: 16, fontSize: 11, lineHeight: 1.7, whiteSpace: 'pre-wrap', overflowY: 'auto',
        maxHeight: 'calc(100vh - 320px)', color: 'var(--muted)',
      }}>
        {log.isLoading ? 'Loading…' : (log.data || '(empty)')}
      </pre>
    </div>
  )
}


function ItemModal({ item, onClose }) {
  const srcMeta = SOURCE_META[item.source] || { label: item.source || 'news', cls: 'src-news' }
  function onAskTitto() {
    openWithPrefill(`Tell me more about: ${item.title}`)
    onClose()
  }
  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-card card">
        <div className="modal-head">
          <h3>{item.title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">
          <div className="choice-row">
            <span className={`src-badge ${srcMeta.cls}`}>{srcMeta.label.toUpperCase()}</span>
            {item.postPotential && <span className={`type-badge type-${item.postPotential}`}>{item.postPotential.toUpperCase()}</span>}
            <span className="chip">SCORE: {item.trendingScore ?? '?'}</span>
            {item.publisher && <span className="chip">{item.publisher}</span>}
          </div>
          {item.snippet && <p>{item.snippet}</p>}
          {item.why && <p className="modal-why">Why it matters: {item.why}</p>}
          {item.url && <a className="result-url" href={item.url} target="_blank" rel="noreferrer">{item.url}</a>}
          <div className="modal-acts">
            <button className="btn primary" onClick={onAskTitto}>Ask Titto</button>
            {item.url && <a className="btn" href={item.url} target="_blank" rel="noreferrer">Open Article ↗</a>}
          </div>
        </div>
      </div>
    </div>
  )
}

function ResultRow({ item, i, onOpen }) {
  const [writeResult, setWriteResult] = useState(null)
  const koelWrite = useKoelWrite()
  const srcMeta = SOURCE_META[item.source] || { label: item.source || 'news', cls: 'src-news' }

  function onWrite(e) {
    e.stopPropagation()
    koelWrite.mutate(
      { format: 'short', input: item.title, inputType: 'topic', count: 1, extraInstructions: item.url ? `Source: ${item.url}` : '' },
      { onSuccess: (data) => setWriteResult(data) },
    )
  }
  function onAskTitto(e) {
    e.stopPropagation()
    openWithPrefill(`Tell me more about: ${item.title}`)
  }

  return (
    <>
      <div className="raven-row" onClick={() => onOpen(item)} style={{ cursor: 'pointer' }}>
        <div className="rank">{item.rank || i + 1}</div>
        <div className={`score ${scoreClass(item.trendingScore || 0)}`}>{item.trendingScore || 0}</div>
        <div className="body">
          <div className="title">{item.title}</div>
          <div className="meta">{item.publisher}{item.publishedAt ? ` · ${relTime(item.publishedAt)}` : ''}</div>
        </div>
        {item.postPotential && <span className={`type-badge type-${item.postPotential}`}>{item.postPotential}</span>}
        <span className={`src-badge ${srcMeta.cls}`}>{srcMeta.label}</span>
        <div className="row-acts">
          <button className="row-act write" onClick={onWrite} disabled={koelWrite.isPending}>✍️ Write</button>
          <button className="row-act ask" onClick={onAskTitto}>Ask Titto</button>
          {item.url && <a className="row-link" href={item.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>↗</a>}
        </div>
      </div>
      {writeResult && (
        <div className="raven-row-drafts">
          {writeResult.draftRecords.map((rec) => (
            <DraftCard key={rec.id} draft={{ id: rec.id, text: rec.text, format: writeResult.format, origin: 'koel', platform: 'x', meta: {} }} />
          ))}
        </div>
      )}
    </>
  )
}

function RunSection({ run, i, source, type, sort, collapsed, onToggle, onOpen }) {
  let items = run.results || []
  if (source !== 'all') items = items.filter((r) => r.source === source)
  if (type !== 'all') items = items.filter((r) => r.postPotential === type)
  if (sort === 'score') items = [...items].sort((a, b) => (b.trendingScore || 0) - (a.trendingScore || 0))
  else if (sort === 'score_asc') items = [...items].sort((a, b) => (a.trendingScore || 0) - (b.trendingScore || 0))

  const tLabel = run.triggerLabel || (run.triggeredBy === 'scheduler' ? '⏰ Scheduled' : '🖱 Manual Run')
  const runLabel = run.rankedAt
    ? new Date(run.rankedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }) + ' IST'
    : (run.runId || 'Unknown')

  return (
    <div className="run-section">
      <div className={`run-header${collapsed ? ' is-collapsed' : ''}`} onClick={onToggle}>
        <span className={`run-trigger ${triggerClass(tLabel)}`}>{tLabel}</span>
        <span className="run-time">{runLabel}</span>
        {i === 0 && <span className="run-latest">LATEST</span>}
        <span className="run-count">{items.length} items</span>
        <span className="run-arrow">{collapsed ? '▶' : '▼'}</span>
      </div>
      {!collapsed && (
        <div className="run-body">
          {items.length ? items.map((item, idx) => <ResultRow key={item.url || idx} item={item} i={idx} onOpen={onOpen} />)
            : <div style={{ padding: 16, fontSize: 12, color: 'var(--faint)' }}>No results match the current filters.</div>}
        </div>
      )}
    </div>
  )
}

function ReplyTargetCard({ target, onDraft, drafting }) {
  const [draft, setDraft] = useState(null)
  return (
    <div className="card result-card">
      <div className="result-head">
        <span className="result-title">{target.title}</span>
      </div>
      <div className="result-meta">
        <span>{(target.impressions || 0).toLocaleString()} imp</span>
        <span>I2C {target.i2c}</span>
        <span>{target.ageMinutes}m old</span>
      </div>
      <a className="result-url" href={target.url} target="_blank" rel="noreferrer">{target.url}</a>
      {draft ? (
        <div className="draft-body" style={{ marginTop: 6 }}>{draft}</div>
      ) : (
        <div className="draft-actions">
          <button className="act" disabled={drafting} onClick={() => onDraft(target, setDraft)}>💬 Draft reply</button>
        </div>
      )}
    </div>
  )
}

export default function RavenPage() {
  const [view, setView] = useState('research') // research | replies
  const [source, setSource] = useState('all')
  const [type, setType] = useState('all')
  const [sort, setSort] = useState('rank')
  const [running, setRunning] = useState(false)
  const [progressStep, setProgressStep] = useState('')
  const [collapseOverrides, setCollapseOverrides] = useState({}) // runId -> explicit collapsed bool
  const [modalItem, setModalItem] = useState(null)

  const runs = useResearchRuns(10)
  const triggerResearch = useTriggerResearch()
  const scheduler = useScheduler()
  const setScheduler = useSetScheduler()

  const replies = useReplies()
  const triggerReplies = useTriggerReplies()
  const draftReply = useDraftReply()

  useWSEvent('research_progress', (data) => {
    setProgressStep(`${data.step === 'fetching' ? 'Fetching' : 'Ranking with AI'} — ${data.source}`)
  })
  useWSEvent('research_complete', () => {
    setRunning(false)
    runs.refetch()
  })
  useWSEvent('reply_targets_complete', () => {
    replies.refetch()
  })

  function runResearch() {
    setRunning(true)
    setProgressStep('Starting…')
    triggerResearch.mutate({ filterSources: source === 'all' ? null : [source] })
  }
  function runReplies() {
    triggerReplies.mutate({})
  }
  function onDraftReply(target, setDraft) {
    draftReply.mutate({ url: target.url }, { onSuccess: (data) => setDraft(data.text) })
  }
  function isCollapsed(runId, index) {
    if (runId in collapseOverrides) return collapseOverrides[runId]
    return index >= 2 // default: first two expanded, rest collapsed — matches old dashboard
  }
  function toggleRun(runId, index) {
    setCollapseOverrides((prev) => ({ ...prev, [runId]: !isCollapsed(runId, index) }))
  }

  const runList = useMemo(() => runs.data || [], [runs.data])
  const totalItems = runList[0]?.results?.length || 0

  return (
    <div className="content">
      <div className="toolbar">
        <div className="tabs">
          <button className={view === 'research' ? 'is-active' : ''} onClick={() => setView('research')}>Research</button>
          <button className={view === 'replies' ? 'is-active' : ''} onClick={() => setView('replies')}>💬 Replies</button>
          <button className={view === 'logs' ? 'is-active' : ''} onClick={() => setView('logs')}>📋 Logs</button>
        </div>
        {view === 'research' && (
          <>
            <select className="select" value={source} onChange={(e) => setSource(e.target.value)}>
              {SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <select className="select" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="rank">Sort: Rank</option>
              <option value="score">Sort: Score ↓</option>
              <option value="score_asc">Sort: Score ↑</option>
            </select>
            <span className="hint">{totalItems} items{runList[0]?.rankedAt ? ` · ${new Date(runList[0].rankedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST` : ''}</span>
          </>
        )}
        <div className="spacer" />
        {view === 'research' && (
          <button className="btn primary" onClick={runResearch} disabled={running || triggerResearch.isPending}>
            {running ? 'Running…' : 'Run research'}
          </button>
        )}
        {view === 'replies' && (
          <button className="btn primary" onClick={runReplies} disabled={triggerReplies.isPending}>
            {triggerReplies.isPending ? 'Scanning…' : 'Find reply targets'}
          </button>
        )}
        {scheduler.data && (
          <button
            className="btn sm"
            onClick={() => setScheduler.mutate(!scheduler.data.enabled)}
            title="Toggle scheduled auto-runs"
          >
            <span className={`sdot ${scheduler.data.enabled ? 'good' : 'crit'}`} /> Auto: {scheduler.data.enabled ? 'ON' : 'OFF'}
          </button>
        )}
      </div>

      {view === 'research' && running && (
        <div className="card working"><div className="spin">🐦</div><div>Raven is researching…</div><div className="step mono">{progressStep}</div></div>
      )}

      {view === 'research' && !running && (
        runList.length === 0 ? (
          <div className="card placeholder"><h2>No results yet</h2><p>Run research to see ranked items here.</p></div>
        ) : (
          runList.map((run, i) => (
            <RunSection
              key={run.runId || i} run={run} i={i} source={source} type={type} sort={sort}
              collapsed={isCollapsed(run.runId, i)}
              onToggle={() => toggleRun(run.runId, i)}
              onOpen={setModalItem}
            />
          ))
        )
      )}

      {view === 'replies' && (
        (replies.data?.qualified?.length ?? 0) === 0 ? (
          <div className="card placeholder"><h2>No reply targets yet</h2><p>Run a search to find fresh posts worth replying to.</p></div>
        ) : (
          <div className="drafts">
            {replies.data.qualified.map((t, i) => (
              <ReplyTargetCard key={t.url || i} target={t} onDraft={onDraftReply} drafting={draftReply.isPending} />
            ))}
          </div>
        )
      )}

      {view === 'logs' && <LogsView />}

      {modalItem && <ItemModal item={modalItem} onClose={() => setModalItem(null)} />}
    </div>
  )
}
