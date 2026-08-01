import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  useModels, useArticles, useArticle, useHeronTopics, useHeronSearchTopics,
  useGenerateHeronArticle, useRefineHeronArticle, useRevertArticle, useHeronWriteNote,
} from '../lib/queries.js'
import { useWSEvent } from '../lib/ws.js'
import { getToken } from '../lib/api.js'

export default function HeronPage() {
  const location = useLocation()
  const [tab, setTab] = useState('articles') // articles | notes

  return (
    <div className="content">
      <div className="choice-row" style={{ marginBottom: 14 }}>
        <button className={`choice-btn${tab === 'articles' ? ' is-active' : ''}`} onClick={() => setTab('articles')}>📄 Articles</button>
        <button className={`choice-btn${tab === 'notes' ? ' is-active' : ''}`} onClick={() => setTab('notes')}>✍️ Notes</button>
      </div>
      {tab === 'articles'
        ? <ArticlesTab initialArticleId={location.state?.articleId || null} />
        : <NotesTab />}
    </div>
  )
}

function ArticlesTab({ initialArticleId }) {
  const [topic, setTopic] = useState('')
  const [model, setModel] = useState('')
  const [currentId, setCurrentId] = useState(initialArticleId)
  const [streaming, setStreaming] = useState(false)
  const [text, setText] = useState('')
  const [meta, setMeta] = useState(null) // { sources, usage, cost, model, version, subject, previewText, subtitle, imagePrompt }
  const [refineText, setRefineText] = useState('')
  const [showRefine, setShowRefine] = useState(false)
  const [previewV, setPreviewV] = useState(null)
  const [showTopics, setShowTopics] = useState(false)
  const [topicQuery, setTopicQuery] = useState('')
  const [copiedPrompt, setCopiedPrompt] = useState(false)
  const boxRef = useRef(null)

  const models = useModels()
  const articles = useArticles()
  const record = useArticle(currentId)
  const topics = useHeronTopics()
  const searchTopics = useHeronSearchTopics()
  const generate = useGenerateHeronArticle()
  const refine = useRefineHeronArticle()
  const revert = useRevertArticle()

  const substackArticles = (articles.data?.articles || []).filter((a) => a.platform === 'substack')

  useEffect(() => {
    if (!model && models.data?.default) setModel(models.data.default)
  }, [models.data, model])

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight })
  }, [text])

  useWSEvent('article_start', (data) => {
    if (data.id !== currentId) return
    setStreaming(true)
    setText('')
  })
  useWSEvent('article_token', (data) => {
    if (data.id !== currentId) return
    setText((t) => t + data.delta)
  })
  useWSEvent('article_done', (data) => {
    if (data.id !== currentId) return
    setStreaming(false)
    setText(data.text)
    setMeta({
      sources: data.sources, usage: data.usage, cost: data.cost, model: data.model, version: data.version,
      subject: data.subject, previewText: data.previewText, subtitle: data.subtitle, imagePrompt: data.imagePrompt,
    })
  })
  useWSEvent('article_error', (data) => {
    if (data.id !== currentId) return
    setStreaming(false)
    setText((t) => t + `\n\n⚠️ ${data.message}`)
  })

  function onGenerate(idxOverride) {
    if (idxOverride == null && !topic.trim()) return
    setMeta(null)
    setShowRefine(false)
    generate.mutate(
      idxOverride != null ? { idx: idxOverride, model } : { topic, model },
      { onSuccess: (data) => { setCurrentId(data.id); setStreaming(true); setText(''); setTopic('') } },
    )
  }

  function onRefine() {
    if (!refineText.trim() || !currentId) return
    refine.mutate(
      { id: currentId, instruction: refineText, model },
      { onSuccess: () => { setStreaming(true); setText('') } },
    )
    setRefineText('')
  }

  function onFindTopics() {
    searchTopics.mutate({ query: topicQuery.trim() || null }, { onSuccess: () => setShowTopics(true) })
  }

  function openArticle(id) {
    if (!id) return
    setCurrentId(id)
    setStreaming(false)
    setShowRefine(false)
    setPreviewV(null)
  }

  useEffect(() => {
    if (record.data && !streaming) {
      const versions = record.data.versions || []
      const last = versions[versions.length - 1]
      if (last) {
        setText(last.text)
        setMeta({
          sources: record.data.sources, usage: last.usage, cost: last.cost, model: last.model, version: last.v,
          subject: last.subject, previewText: last.previewText, subtitle: last.subtitle, imagePrompt: last.imagePrompt,
        })
        setPreviewV(null)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.data])

  function previewVersion(v) {
    setPreviewV(v.v)
    setText(v.text)
    setMeta({
      sources: record.data?.sources, usage: v.usage, cost: v.cost, model: v.model, version: v.v,
      subject: v.subject, previewText: v.previewText, subtitle: v.subtitle, imagePrompt: v.imagePrompt,
    })
  }

  function makeCurrent() {
    if (!currentId || previewV == null) return
    revert.mutate({ id: currentId, version: previewV })
  }

  function copyArticle() {
    if (text) navigator.clipboard.writeText(text)
  }
  function copyImagePrompt() {
    if (!meta?.imagePrompt) return
    navigator.clipboard.writeText(meta.imagePrompt)
    setCopiedPrompt(true)
    setTimeout(() => setCopiedPrompt(false), 1500)
  }

  function exportMd() {
    if (!currentId) return
    const token = getToken()
    const url = `/api/article/${currentId}/export` + (token ? `?token=${encodeURIComponent(token)}` : '')
    window.open(url, '_blank')
  }

  const words = text ? text.split(/\s+/).filter(Boolean).length : 0
  const versions = record.data?.versions || []
  const latestV = versions[versions.length - 1]?.v
  const hasArticle = !!(text || currentId)
  const topicList = topics.data?.topics || []

  return (
    <>
      <div className="toolbar">
        <input
          className="field" style={{ flex: 1, minWidth: 200 }}
          placeholder="Newsletter topic or angle — e.g. why solo founders should ship ugly v1s"
          value={topic} onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onGenerate()}
        />
        <button className="btn primary" onClick={() => onGenerate()} disabled={generate.isPending || streaming || !topic.trim()}>
          {streaming ? '✍️ Writing…' : '✍️ Write Article'}
        </button>
        <select className="select" style={{ maxWidth: 170, flex: 'none' }} value={currentId || ''} onChange={(e) => openArticle(e.target.value)} title="Past Substack articles">
          <option value="">Past articles…</option>
          {substackArticles.map((a) => <option key={a.id} value={a.id}>{a.title || a.topic}</option>)}
        </select>
      </div>

      <div className="toolbar" style={{ marginTop: 8 }}>
        <input
          className="field" style={{ flex: 1, minWidth: 160 }}
          placeholder="Optional: search a specific topic (blank = use latest research)"
          value={topicQuery} onChange={(e) => setTopicQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onFindTopics()}
        />
        <button className="btn" onClick={onFindTopics} disabled={searchTopics.isPending}>
          {searchTopics.isPending ? '🔍 Searching…' : '🔍 Find topics'}
        </button>
        {topicList.length > 0 && (
          <button className="btn" onClick={() => setShowTopics((s) => !s)}>{showTopics ? 'Hide topics' : `Show topics (${topicList.length})`}</button>
        )}
      </div>

      {showTopics && topicList.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          {topicList.map((t, i) => (
            <div key={i} className="card result-card">
              <div className="result-head"><span className="result-title">{t.title}</span></div>
              {t.snippet && <div className="result-why">{t.snippet.slice(0, 200)}</div>}
              {t.url && <a className="result-url" href={t.url} target="_blank" rel="noreferrer">{t.url}</a>}
              <div className="choice-row" style={{ marginTop: 6 }}>
                <button className="choice-btn" disabled={generate.isPending || streaming} onClick={() => onGenerate(i)}>✍️ Write this</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', marginTop: 14 }}>
        <div className="card" style={{ padding: 26, flex: 1, minWidth: 0, maxHeight: '78vh', overflowY: 'auto' }} ref={boxRef}>
          {!text && !streaming ? (
            <div className="placeholder">
              <p>Give a topic above (or find one from Raven's research) and I'll write a full Substack newsletter post — subject line, preview text, subtitle, and an image prompt included. Approve it on Telegram when it's ready and I'll hand off everything except the actual publish click.</p>
            </div>
          ) : (
            <>
              {meta?.subject && <div className="hint" style={{ marginBottom: 2 }}><b>Subject:</b> {meta.subject}</div>}
              {meta?.previewText && <div className="hint" style={{ marginBottom: 2 }}><b>Preview:</b> {meta.previewText}</div>}
              {meta?.subtitle && <div className="hint" style={{ marginBottom: 10 }}><b>Subtitle:</b> {meta.subtitle}</div>}
              {meta && (
                <div className="stat-row">
                  <span>{words} words</span>
                  <span>{(meta.sources || []).length} sources</span>
                  {meta.cost != null && <span>${meta.cost.toFixed(4)}</span>}
                  {meta.model && <span>{meta.model}</span>}
                </div>
              )}
              <div className="article-prose" style={{ whiteSpace: 'pre-wrap' }}>{text}{streaming && '▍'}</div>
              {meta?.sources?.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <div className="hint" style={{ marginBottom: 6 }}>REFERENCES ({meta.sources.length})</div>
                  {meta.sources.map((s, i) => (
                    <div key={i}><a className="result-url" href={s.url} target="_blank" rel="noreferrer">{s.title || s.url}</a></div>
                  ))}
                </div>
              )}

              {meta?.imagePrompt && (
                <div className="card" style={{ marginTop: 20, padding: 14, background: 'var(--surface-2)' }}>
                  <div className="hint" style={{ marginBottom: 6, fontWeight: 700 }}>🖼 IMAGE PROMPT — paste into Midjourney/DALL·E/etc.</div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{meta.imagePrompt}</div>
                  <button className="btn sm" style={{ marginTop: 8 }} onClick={copyImagePrompt}>{copiedPrompt ? 'Copied' : '📋 Copy prompt'}</button>
                </div>
              )}

              {showRefine && currentId && !streaming && (
                <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                  <div className="hint" style={{ marginBottom: 8 }}>REWRITE WITH HERON</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      className="field" placeholder="e.g. tighten the intro, add a concrete example"
                      value={refineText} onChange={(e) => setRefineText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && onRefine()}
                    />
                    <button className="btn" onClick={onRefine} disabled={refine.isPending || !refineText.trim()}>Rewrite</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ width: 260, flex: 'none', display: 'flex', flexDirection: 'column', gap: 18, position: 'sticky', top: 90 }}>
          <div>
            <div className="hint" style={{ fontWeight: 700, letterSpacing: '.05em', marginBottom: 6 }}>MODEL</div>
            <select className="select" style={{ width: '100%' }} value={model} onChange={(e) => setModel(e.target.value)}>
              {(models.data?.models || []).map((m) => <option key={m.id} value={m.id}>{m.label || m.id}</option>)}
            </select>
          </div>

          {hasArticle && (
            <div>
              <div className="hint" style={{ fontWeight: 700, letterSpacing: '.05em', marginBottom: 6 }}>ACTIONS</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {currentId && !streaming && (
                  <button className="btn" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => setShowRefine((s) => !s)}>✏️ Edit / rewrite</button>
                )}
                <button className="btn" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={copyArticle}>📋 Copy body</button>
                {currentId && (
                  <button className="btn" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={exportMd}>⬇ Export .md</button>
                )}
              </div>
            </div>
          )}

          <div>
            <div className="hint" style={{ fontWeight: 700, letterSpacing: '.05em', marginBottom: 6 }}>VERSIONS</div>
            {versions.length > 1 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {versions.map((v) => (
                  <button
                    key={v.v}
                    className={`choice-btn${(previewV ?? latestV) === v.v ? ' is-active' : ''}`}
                    style={{ width: '100%', textAlign: 'left' }}
                    onClick={() => previewVersion(v)}
                  >
                    v{v.v}{v.instruction ? ` · ${v.instruction.slice(0, 24)}` : ' · original'}
                  </button>
                ))}
                {previewV != null && previewV !== latestV && (
                  <button className="btn sm" onClick={makeCurrent} disabled={revert.isPending}>
                    {revert.isPending ? 'Reverting…' : '↩ Make current'}
                  </button>
                )}
              </div>
            ) : (
              <div className="hint">No versions yet.</div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function NotesTab() {
  const [topic, setTopic] = useState('')
  const [count, setCount] = useState(1)
  const [notes, setNotes] = useState([])
  const [copiedIdx, setCopiedIdx] = useState(null)
  const writeNote = useHeronWriteNote()

  function onWrite() {
    if (!topic.trim()) return
    writeNote.mutate({ topic, count }, { onSuccess: (data) => setNotes(data.drafts || []) })
  }

  async function copy(i, t) {
    try { await navigator.clipboard.writeText(t); setCopiedIdx(i); setTimeout(() => setCopiedIdx(null), 1500) } catch (_) {}
  }

  return (
    <>
      <div className="toolbar">
        <input
          className="field" style={{ flex: 1, minWidth: 200 }}
          placeholder="What's the Note about? — tied to your content pillars"
          value={topic} onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onWrite()}
        />
        <input
          type="number" className="field" style={{ width: 70, flex: 'none' }} min={1} max={5}
          value={count} onChange={(e) => setCount(Math.max(1, Math.min(5, parseInt(e.target.value) || 1)))}
          title="Number of Notes"
        />
        <button className="btn primary" onClick={onWrite} disabled={writeNote.isPending || !topic.trim()}>
          {writeNote.isPending ? '✍️ Writing…' : '✍️ Write Notes'}
        </button>
      </div>

      {notes.length === 0 ? (
        <div className="card" style={{ padding: 26, marginTop: 14 }}>
          <div className="placeholder">
            <p>Give a topic and I'll write short, punchy Substack Notes tied to your content pillars — ready to approve on Telegram and paste in.</p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
          {notes.map((n, i) => (
            <div key={i} className="card result-card">
              <div className="draft-body">{n}</div>
              <div className="draft-actions">
                <button className="act" onClick={() => copy(i, n)}>{copiedIdx === i ? 'Copied' : 'Copy'}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
