import { useEffect, useRef, useState } from 'react'
import {
  useModels, useArticles, useArticle, useGenerateArticle, useRefineArticle, useRevertArticle,
} from '../lib/queries.js'
import { useWSEvent } from '../lib/ws.js'
import { getToken } from '../lib/api.js'

export default function ArticleWriterPage() {
  const [topic, setTopic] = useState('')
  const [model, setModel] = useState('')
  const [currentId, setCurrentId] = useState(null)
  const [streaming, setStreaming] = useState(false)
  const [text, setText] = useState('')
  const [meta, setMeta] = useState(null) // { sources, usage, cost, model, version }
  const [refineText, setRefineText] = useState('')
  const boxRef = useRef(null)

  const models = useModels()
  const articles = useArticles()
  const record = useArticle(currentId)
  const generate = useGenerateArticle()
  const refine = useRefineArticle()
  const revert = useRevertArticle()

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
    setMeta({ sources: data.sources, usage: data.usage, cost: data.cost, model: data.model, version: data.version })
  })
  useWSEvent('article_error', (data) => {
    if (data.id !== currentId) return
    setStreaming(false)
    setText((t) => t + `\n\n⚠️ ${data.message}`)
  })

  function onGenerate() {
    if (!topic.trim()) return
    setMeta(null)
    generate.mutate(
      { topic, model },
      { onSuccess: (data) => { setCurrentId(data.id); setStreaming(true); setText('') } },
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

  function openArticle(id) {
    if (!id) return
    setCurrentId(id)
    setStreaming(false)
  }

  // record loads the full versioned article once selected/refetched
  useEffect(() => {
    if (record.data && !streaming) {
      const versions = record.data.versions || []
      const last = versions[versions.length - 1]
      if (last) {
        setText(last.text)
        setMeta({ sources: last.sources, usage: last.usage, cost: last.cost, model: last.model, version: last.v })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.data])

  function exportMd() {
    if (!currentId) return
    const token = getToken()
    const url = `/api/article/${currentId}/export` + (token ? `?token=${encodeURIComponent(token)}` : '')
    window.open(url, '_blank')
  }

  const words = text ? text.split(/\s+/).filter(Boolean).length : 0

  return (
    <div className="content">
      <div className="toolbar">
        <input
          className="field" style={{ flex: 1 }}
          placeholder="Article topic or angle — e.g. why solo founders should ship ugly v1s"
          value={topic} onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onGenerate()}
        />
        <select className="select" value={model} onChange={(e) => setModel(e.target.value)}>
          {(models.data?.models || []).map((m) => <option key={m.id} value={m.id}>{m.label || m.id}</option>)}
        </select>
        <button className="btn primary" onClick={onGenerate} disabled={generate.isPending || streaming || !topic.trim()}>
          ✍️ Write Article
        </button>
        <select className="select" value={currentId || ''} onChange={(e) => openArticle(e.target.value)}>
          <option value="">Past articles…</option>
          {(articles.data?.articles || []).map((a) => <option key={a.id} value={a.id}>{a.title || a.topic}</option>)}
        </select>
      </div>

      <div className="card" style={{ padding: 26, maxWidth: 780, margin: '0 auto' }} ref={boxRef}>
        {!text && !streaming ? (
          <div className="placeholder">
            <p>Give a topic above and I'll write a professional, cited article in your voice — streamed live.<br />Then refine it conversationally, switch models, and export to .md.</p>
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
                <div className="hint" style={{ marginBottom: 6 }}>SOURCES</div>
                {meta.sources.map((s, i) => (
                  <div key={i}><a className="result-url" href={s.url} target="_blank" rel="noreferrer">{s.title || s.url}</a></div>
                ))}
              </div>
            )}

            {currentId && !streaming && (
              <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                <div className="hint" style={{ marginBottom: 8 }}>REWRITE WITH THE WRITER</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="field" placeholder="e.g. tighten the intro, add a concrete example"
                    value={refineText} onChange={(e) => setRefineText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && onRefine()}
                  />
                  <button className="btn" onClick={onRefine} disabled={refine.isPending || !refineText.trim()}>Rewrite</button>
                  <button className="btn" onClick={exportMd}>Export .md</button>
                </div>
                {record.data?.versions?.length > 1 && (
                  <div className="choice-row" style={{ marginTop: 10 }}>
                    {record.data.versions.map((v) => (
                      <button
                        key={v.v} className={`choice-btn${meta?.version === v.v ? ' is-active' : ''}`}
                        onClick={() => revert.mutate({ id: currentId, version: v.v })}
                      >
                        v{v.v}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
