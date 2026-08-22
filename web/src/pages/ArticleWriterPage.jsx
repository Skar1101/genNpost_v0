import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  useModels, useArticles, useArticle, useGenerateArticle, useRefineArticle, useRevertArticle,
  useCancelArticle,
} from '../lib/queries.js'
import { useWSEvent, useWSStatus } from '../lib/ws.js'
import { getToken } from '../lib/api.js'

export default function ArticleWriterPage() {
  const location = useLocation()
  const [topic, setTopic] = useState('')
  const [model, setModel] = useState('')
  const [currentId, setCurrentId] = useState(location.state?.articleId || null)
  const [streaming, setStreaming] = useState(false)
  const [text, setText] = useState('')
  const [meta, setMeta] = useState(null) // { sources, usage, cost, model, version }
  const [refineText, setRefineText] = useState('')
  const [showRefine, setShowRefine] = useState(false)
  const [previewV, setPreviewV] = useState(null) // version number being previewed, null = latest
  const boxRef = useRef(null)
  const wsStatus = useWSStatus()

  const models = useModels()
  const articles = useArticles()
  const record = useArticle(currentId)
  const generate = useGenerateArticle()
  const refine = useRefineArticle()
  const revert = useRevertArticle()
  const cancel = useCancelArticle()

  useEffect(() => {
    if (!model && models.data?.default) setModel(models.data.default)
  }, [models.data, model])

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight })
  }, [text])

  // Streaming used to be cleared ONLY by article_done / article_error. If neither ever arrived —
  // the server restarted mid-stream (node --watch does this on any save), the WebSocket dropped,
  // the request hung — `streaming` stayed true forever. The "Edit / rewrite" button is gated on
  // !streaming, so it vanished permanently and the page could never recover, because the record
  // re-sync effect below is gated the same way.
  //
  // This watchdog ends a stream that has gone quiet, restores the controls, and refetches so the
  // article shows whatever actually made it to disk.
  const STREAM_IDLE_MS = 90000
  const idleTimer = useRef(null)

  function stopStreaming({ note = null } = {}) {
    setStreaming(false)
    clearTimeout(idleTimer.current)
    if (note) setText((t) => (t ? t + `\n\n${note}` : note))
    record.refetch()
    articles.refetch()
  }

  function keepAlive() {
    clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => {
      stopStreaming({ note: '⚠️ The writer stopped responding — nothing was saved, and the article below is whatever was last stored. Try again.' })
    }, STREAM_IDLE_MS)
  }

  // Clear the timer if the page unmounts mid-stream.
  useEffect(() => () => clearTimeout(idleTimer.current), [])

  useWSEvent('article_start', (data) => {
    if (data.id !== currentId) return
    setStreaming(true)
    setText('')
    keepAlive()
  })
  useWSEvent('article_token', (data) => {
    if (data.id !== currentId) return
    setText((t) => t + data.delta)
    keepAlive()   // each token pushes the deadline out
  })
  useWSEvent('article_done', (data) => {
    if (data.id !== currentId) return
    setText(data.text)
    setMeta({ sources: data.sources, usage: data.usage, cost: data.cost, model: data.model, version: data.version })
    // A stopped run still saves what it wrote, so say so rather than letting a short article look
    // like a bad one.
    stopStreaming(data.cancelled ? { note: '🛑 Stopped early — the text above was saved and can be edited or rewritten.' } : {})
  })
  useWSEvent('article_error', (data) => {
    if (data.id !== currentId) return
    // Nothing was written server-side, so don't leave the error where the article should be —
    // refetch and show the text that actually exists.
    stopStreaming({ note: `⚠️ ${data.message}` })
  })

  function onGenerate() {
    if (!topic.trim()) return
    setMeta(null)
    setShowRefine(false)
    generate.mutate(
      { brief: topic, model },
      { onSuccess: (data) => { setCurrentId(data.id); setStreaming(true); setText('') } },
    )
  }

  // Stop asks the server to abort the upstream call, which actually halts generation rather than
  // just hiding it. Whatever was written is saved as a version, so article_done still arrives and
  // ends the stream — no need to clear `streaming` here.
  function onStop() {
    if (!currentId || !streaming) return
    cancel.mutate({ id: currentId })
  }

  function onRefine() {
    if (!refineText.trim() || !currentId) return
    refine.mutate(
      { id: currentId, instruction: refineText, model },
      { onSuccess: () => { setStreaming(true); setText('') } },
    )
    setRefineText('')
  }

  function openArticle(id) {
    if (!id) return
    setCurrentId(id)
    setStreaming(false)
    setShowRefine(false)
    setPreviewV(null)
  }

  // A dropped WebSocket while streaming means article_done can never arrive — end the stream rather
  // than leaving the controls hidden until a reload.
  useEffect(() => {
    if (streaming && wsStatus === 'offline') {
      stopStreaming({ note: '⚠️ Lost connection to the server mid-write. Nothing was saved.' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsStatus, streaming])

  // record loads the full versioned article once selected/refetched — always the latest version.
  // Skipped while streaming so live tokens aren't overwritten by the stale stored copy.
  useEffect(() => {
    if (record.data && !streaming) {
      const versions = record.data.versions || []
      // Prefer the newest version that actually has text — a pre-2026-08-19 failed refine could
      // leave an empty one, and rendering that made the article look destroyed.
      const last = [...versions].reverse().find((v) => (v.text || '').trim()) || versions[versions.length - 1]
      if (last) {
        // `sources` lives at the article level, not per-version — every version shares it.
        setText(last.text)
        setMeta({ sources: record.data.sources, usage: last.usage, cost: last.cost, model: last.model, version: last.v })
        setPreviewV(null)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.data])

  function previewVersion(v) {
    setPreviewV(v.v)
    setText(v.text)
    setMeta({ sources: record.data?.sources, usage: v.usage, cost: v.cost, model: v.model, version: v.v })
  }

  function makeCurrent() {
    if (!currentId || previewV == null) return
    revert.mutate({ id: currentId, version: previewV })
  }

  function copyArticle() {
    if (text) navigator.clipboard.writeText(text)
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

  return (
    <div className="content">
      <div className="toolbar">
        {/* A brief, not just a topic: length, structure, tone and what to avoid all get obeyed now,
            so the box has to be big enough to write them in. Enter sends, Shift+Enter newlines. */}
        <textarea
          className="field" rows={1} style={{ flex: 1, minWidth: 200, resize: 'vertical', minHeight: 38, maxHeight: 160, fontFamily: 'inherit' }}
          placeholder="Topic — or a full brief: “600 words on morning routines, second person, numbered checklist, no citations”"
          value={topic} onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onGenerate() } }}
        />
        {streaming ? (
          <button className="btn" onClick={onStop} disabled={cancel.isPending} title="Stop writing — keeps what's been written so far">
            {cancel.isPending ? '⏳ Stopping…' : '🛑 Stop'}
          </button>
        ) : (
          <button className="btn primary" onClick={onGenerate} disabled={generate.isPending || !topic.trim()}>
            ✍️ Write Article
          </button>
        )}
        <select className="select" style={{ maxWidth: 170, flex: 'none' }} value={currentId || ''} onChange={(e) => openArticle(e.target.value)} title="Past articles">
          <option value="">Past articles…</option>
          {(articles.data?.articles || []).map((a) => <option key={a.id} value={a.id}>{a.title || a.topic}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        <div className="card" style={{ padding: 26, flex: 1, minWidth: 0, maxHeight: '78vh', overflowY: 'auto' }} ref={boxRef}>
          {!text && !streaming ? (
            <div className="placeholder">
              <p>Give a topic above — or a full brief, and it will be followed.<br />Length, structure, tone, person, what to avoid: whatever you type there outranks the house template.<br />Streams live; hit Stop any time, then Edit to refine, switch models, and export to .md.</p>
            </div>
          ) : (
            <>
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

              {showRefine && currentId && !streaming && (
                <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                  <div className="hint" style={{ marginBottom: 8 }}>REWRITE WITH THE WRITER</div>
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
            {models.data && (
              <div className="hint" style={{ marginTop: 5 }}>
                {models.data.openrouter ? 'via OpenRouter' : 'OpenAI fallback (set OPENROUTER_API_KEY for more models)'}
              </div>
            )}
          </div>

          {hasArticle && (
            <div>
              <div className="hint" style={{ fontWeight: 700, letterSpacing: '.05em', marginBottom: 6 }}>ACTIONS</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {currentId && !streaming && (
                  <button className="btn" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => setShowRefine((s) => !s)}>✏️ Edit / rewrite</button>
                )}
                <button className="btn" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={copyArticle}>📋 Copy</button>
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

          {meta?.cost != null && <div className="hint" style={{ marginTop: 'auto' }}>${meta.cost.toFixed(4)}</div>}
        </div>
      </div>
    </div>
  )
}
