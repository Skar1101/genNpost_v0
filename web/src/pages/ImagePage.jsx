import { useState } from 'react'
import { useImages, useGenerateImage, useUploadImage, useImageVerdict } from '../lib/queries.js'
import { api } from '../lib/api.js'
import { useQueryClient } from '@tanstack/react-query'

const PLATFORMS = [
  { id: 'x', label: 'X', note: '3:2 wide' },
  { id: 'linkedin', label: 'LinkedIn', note: '1:1 square' },
  { id: 'substack', label: 'Substack', note: '3:2 wide' },
]

const MODES = [
  { id: 'post', label: 'From post text', hint: 'Give it the post — it works out a visual subject first, then generates. Best default.' },
  { id: 'subject', label: 'From a subject', hint: 'Describe the scene yourself. House style is still applied on top.' },
  { id: 'raw', label: 'Raw prompt', hint: 'Sent verbatim. House style is NOT applied — full manual control.' },
]

function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export default function ImagePage() {
  const queryClient = useQueryClient()
  const imagesQ = useImages()
  const generate = useGenerateImage()
  const upload = useUploadImage()
  const verdict = useImageVerdict()

  const [mode, setMode] = useState('post')
  const [text, setText] = useState('')
  const [platform, setPlatform] = useState('x')
  const [model, setModel] = useState('')
  const [selected, setSelected] = useState(null)

  const data = imagesQ.data
  const images = data?.images || []
  const models = (data?.models || []).filter((m) => m.available)
  const status = data?.providerStatus
  const activeMode = MODES.find((m) => m.id === mode)

  function run() {
    const body = { platform, modelId: model || null }
    if (mode === 'post') body.text = text
    else { body.subject = text; body.raw = mode === 'raw' }
    generate.mutate(body, { onSuccess: (d) => setSelected(d.image) })
  }

  function onFile(file) {
    if (!file?.type?.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => upload.mutate(
      { data: reader.result, contentType: file.type, platform },
      { onSuccess: (d) => setSelected(d.image) },
    )
    reader.readAsDataURL(file)
  }

  async function remove(id) {
    await api(`/images/${id}`, { method: 'DELETE' })
    if (selected?.id === id) setSelected(null)
    queryClient.invalidateQueries({ queryKey: ['images'] })
  }

  const approvedCount = data?.approvedCount ?? 0
  const spend = images.reduce((s, i) => s + (i.cost || 0), 0)

  return (
    <div className="content">
      <div className="toolbar">
        <span style={{ fontSize: 13, fontWeight: 650 }}>Image</span>
        <span className="hint">Generate visuals in the house style — attach them from the Library</span>
        <div className="spacer" style={{ flex: 1 }} />
        {status && (
          <span className="hint">
            via <strong>{status.activeLabel || '—'}</strong>
            {status.forced ? ' (pinned)' : ''}
          </span>
        )}
        <button className="btn sm" onClick={() => imagesQ.refetch()}>↻ Refresh</button>
      </div>

      <div className="titto-page-split">
        {/* ── Generate ─────────────────────────────────────────────── */}
        <div className="card" style={{ padding: 18 }}>
          <div className="choice-row" style={{ gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            {MODES.map((m) => (
              <button key={m.id} className={`btn sm ${mode === m.id ? 'primary' : ''}`} onClick={() => setMode(m.id)}>
                {m.label}
              </button>
            ))}
          </div>
          <div className="hint" style={{ marginBottom: 10 }}>{activeMode.hint}</div>

          <textarea
            className="field"
            rows={7}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={(e) => {
              const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'))
              if (item) { e.preventDefault(); onFile(item.getAsFile()) }
            }}
            onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer?.files?.[0]) }}
            onDragOver={(e) => e.preventDefault()}
            placeholder={
              mode === 'post' ? 'Paste the post — the image subject is derived from what it means, not its words.'
                : mode === 'subject' ? 'A pair of worn running shoes by the front door, dust gathering'
                : 'Full prompt, sent exactly as written'
            }
          />

          <div className="choice-row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {PLATFORMS.map((p) => (
              <button key={p.id} className={`btn sm ${platform === p.id ? 'primary' : ''}`} onClick={() => setPlatform(p.id)} title={p.note}>
                {p.label} <span className="hint">{p.note}</span>
              </button>
            ))}
          </div>

          {models.length > 1 && (
            <div style={{ marginTop: 10 }}>
              <div className="hint" style={{ marginBottom: 4 }}>Model</div>
              <select className="field" value={model} onChange={(e) => setModel(e.target.value)}>
                <option value="">Default — {data?.defaultModel}</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>{m.label} · {m.providerLabel}</option>
                ))}
              </select>
            </div>
          )}

          <div className="choice-row" style={{ gap: 8, marginTop: 12, alignItems: 'center' }}>
            <button className="btn primary sm" onClick={run} disabled={!text.trim() || generate.isPending}>
              {generate.isPending ? 'Generating…' : 'Generate'}
            </button>
            <span className="hint">or drop / paste an image above to upload one</span>
          </div>

          {(generate.isError || upload.isError) && (
            <div className="hint" style={{ color: 'var(--crit)', marginTop: 8 }}>
              {generate.error?.message || upload.error?.message}
            </div>
          )}

          {selected && (
            <div style={{ marginTop: 16 }}>
              <img src={selected.url} alt="" style={{ maxWidth: '100%', borderRadius: 8, display: 'block' }} />
              <div className="hint" style={{ marginTop: 6 }}>
                {selected.provider ? `${selected.provider}/${selected.model}` : 'uploaded'}
                {selected.cost != null ? ` · $${selected.cost}` : ''} · {selected.platform}
              </div>
              {selected.subject && <div className="hint" style={{ marginTop: 4, fontStyle: 'italic' }}>“{selected.subject}”</div>}
            </div>
          )}

          {/* Provider info — changing it is an .env edit, so say so plainly rather than
              pretending it's a UI setting. */}
          {status && (
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 16, paddingTop: 12 }}>
              <div className="hint">
                Providers: {status.providers.map((p) => `${p.id}${p.configured ? '' : ' (no key)'}`).join(' · ')}
                <br />
                Change with <span className="mono">IMAGE_PROVIDER</span> in <span className="mono">.env</span>; add one with a file in <span className="mono">utils/imageProviders/</span>.
              </div>
            </div>
          )}
        </div>

        {/* ── Gallery ──────────────────────────────────────────────── */}
        <div>
          <div className="section-head" style={{ alignItems: 'center' }}>
            <span className="eyebrow">Generated</span>
            <div className="spacer" style={{ flex: 1 }} />
            <span className="hint">
              {images.length} total · {approvedCount} approved{spend > 0 ? ` · $${spend.toFixed(3)}` : ''}
            </span>
          </div>

          {approvedCount > 0 && approvedCount < 15 && (
            <div className="hint" style={{ marginBottom: 10 }}>
              {15 - approvedCount} more approvals and this set is big enough to train a model on your own look
              (needs a fal.ai key).
            </div>
          )}

          {imagesQ.isLoading ? (
            <div className="card placeholder"><p>Loading…</p></div>
          ) : images.length === 0 ? (
            <div className="card placeholder">
              <h2>No images yet</h2>
              <p>Generate one on the left. Approving and rejecting them teaches the house style — and builds the training set for a model tuned to your look.</p>
            </div>
          ) : (
            <div className="image-grid">
              {images.map((img) => (
                <div key={img.id} className={`image-tile ${img.verdict || ''}`}>
                  <img src={img.url} alt="" onClick={() => setSelected(img)} />
                  <div className="image-tile-meta">
                    <span className="mono">{img.platform}</span>
                    <span className="hint">{img.cost != null ? `$${img.cost}` : img.source}</span>
                    <span className="hint">{timeAgo(img.createdAt)}</span>
                  </div>
                  <div className="image-tile-acts">
                    <button
                      className={`btn sm ${img.verdict === 'approved' ? 'primary' : ''}`}
                      onClick={() => verdict.mutate({ id: img.id, verdict: img.verdict === 'approved' ? null : 'approved' })}
                      title="Approve — feeds the future training set"
                    >✓</button>
                    <button
                      className="btn sm"
                      onClick={() => verdict.mutate({ id: img.id, verdict: img.verdict === 'rejected' ? null : 'rejected' })}
                      title="Reject"
                    >✕</button>
                    <button className="btn sm" onClick={() => remove(img.id)} title="Delete">🗑</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
