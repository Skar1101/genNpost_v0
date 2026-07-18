import { useMemo, useState } from 'react'
import ResultCard from '../components/ResultCard.jsx'
import {
  useResearch, useTriggerResearch, useReplies, useTriggerReplies, useDraftReply,
  useScheduler, useSetScheduler,
} from '../lib/queries.js'
import { useWSEvent } from '../lib/ws.js'

const SOURCES = [
  { id: 'all', label: 'All sources' },
  { id: 'hackernews', label: 'Hacker News' },
  { id: 'twitter', label: 'Twitter / X' },
  { id: 'reddit', label: 'Reddit' },
  { id: 'github', label: 'GitHub' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'arxiv', label: 'arXiv' },
]

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
  const [sort, setSort] = useState('rank')
  const [running, setRunning] = useState(false)
  const [progressStep, setProgressStep] = useState('')

  const research = useResearch()
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
    research.refetch()
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

  const items = useMemo(() => {
    let list = research.data?.results || []
    if (source !== 'all') list = list.filter((r) => r.source === source)
    list = [...list]
    if (sort === 'score') list.sort((a, b) => (b.trendingScore || 0) - (a.trendingScore || 0))
    else if (sort === 'score_asc') list.sort((a, b) => (a.trendingScore || 0) - (b.trendingScore || 0))
    return list
  }, [research.data, source, sort])

  const lastRunLabel = research.data?.rankedAt
    ? `${research.data.results?.length || 0} items · ${new Date(research.data.rankedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`
    : 'No run yet'

  return (
    <div className="content">
      <div className="toolbar">
        <div className="tabs">
          <button className={view === 'research' ? 'is-active' : ''} onClick={() => setView('research')}>Research</button>
          <button className={view === 'replies' ? 'is-active' : ''} onClick={() => setView('replies')}>💬 Replies</button>
        </div>
        {view === 'research' && (
          <>
            <select className="select" value={source} onChange={(e) => setSource(e.target.value)}>
              {SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <select className="select" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="rank">Sort: Rank</option>
              <option value="score">Sort: Score ↓</option>
              <option value="score_asc">Sort: Score ↑</option>
            </select>
            <span className="hint">{lastRunLabel}</span>
          </>
        )}
        <div className="spacer" />
        {view === 'research' ? (
          <button className="btn primary" onClick={runResearch} disabled={running || triggerResearch.isPending}>
            {running ? 'Running…' : 'Run research'}
          </button>
        ) : (
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
        items.length === 0 ? (
          <div className="card placeholder"><h2>No results yet</h2><p>Run research to see ranked items here.</p></div>
        ) : (
          <div className="drafts">{items.map((item, i) => <ResultCard key={item.url || i} item={item} />)}</div>
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
    </div>
  )
}
