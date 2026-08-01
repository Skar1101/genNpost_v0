import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTransition } from '../lib/queries.js'

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M5 12l5 5L20 6" /></svg>
)
const XIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M6 6l12 12M18 6L6 18" /></svg>
)

const PLATFORM_LABEL = { x: 'X', linkedin: 'LinkedIn', substack: 'Substack' }
const platClass = (p) => (p === 'linkedin' ? 'badge-plat li' : p === 'substack' ? 'badge-plat sub' : 'badge-plat')

const REASONS = [
  { code: 'hook', label: 'weak hook' },
  { code: 'voice', label: 'off-voice' },
  { code: 'topic', label: 'wrong topic' },
  { code: 'seen', label: 'seen before' },
  { code: 'other', label: 'other' },
]

// Human label for where a draft came from (origin + meta), mirroring the Telegram draft headers.
function describeOrigin(draft) {
  const { origin, meta = {} } = draft
  if (origin === 'reply') return 'Koel · reply draft'
  if (origin === 'repost') return 'Quill · quote-repost'
  if (origin === 'quill' && meta.section) return `Quill · ${meta.section}`
  if (origin === 'quill') return 'Quill · daily drop'
  if (origin === 'heron' && meta.kind === 'article') return 'Heron · article'
  if (origin === 'heron' && meta.kind === 'note') return 'Heron · Note'
  if (origin === 'heron') return 'Heron · direct'
  return 'Koel · direct'
}

export default function DraftCard({ draft }) {
  const [localState, setLocalState] = useState('pending') // pending | queued | rejected — optimistic UI only
  const [mode, setMode] = useState('view') // view | reject | edit
  const [editText, setEditText] = useState(draft.editedText || draft.text)
  const [copied, setCopied] = useState(false)
  const transition = useTransition()
  const navigate = useNavigate()
  const isHeronArticle = draft.origin === 'heron' && draft.meta?.kind === 'article' && draft.meta?.articleId

  const text = draft.editedText || draft.text

  function approve() {
    setLocalState('queued')
    transition.mutate({ id: draft.id, state: 'queued' })
  }
  function reject(reasonCode) {
    setLocalState('rejected')
    transition.mutate({ id: draft.id, state: 'rejected', reason: reasonCode })
  }
  function saveEdit() {
    setLocalState('queued')
    transition.mutate({ id: draft.id, state: 'edited', editedText: editText })
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (_) { /* clipboard unavailable — no-op */ }
  }

  return (
    <div className="card draft pad2" data-state={localState}>
      <div className="draft-head">
        <span className={platClass(draft.platform)}>
          <span className="sdot" style={{ background: 'currentColor' }} />
          {PLATFORM_LABEL[draft.platform] || draft.platform}
        </span>
        <span className="fmt">{draft.format}</span>
        <span className="via">{describeOrigin(draft)}</span>
        {isHeronArticle && (
          <button
            className="act" style={{ marginLeft: 'auto' }}
            onClick={() => navigate('/agent/heron', { state: { articleId: draft.meta.articleId } })}
          >
            ↗ Open in Heron
          </button>
        )}
      </div>

      {mode === 'edit' ? (
        <textarea
          className="draft-body"
          style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: 10, background: 'var(--surface-2)', color: 'var(--ink)', font: 'inherit' }}
          rows={5}
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
        />
      ) : (
        <div className="draft-body">{text}</div>
      )}

      {localState === 'pending' && mode === 'view' && (
        <div className="draft-actions">
          <button className="act approve" onClick={approve} disabled={transition.isPending}>
            <CheckIcon /> Approve
          </button>
          <button className="act reject" onClick={() => setMode('reject')} disabled={transition.isPending}>
            <XIcon /> Reject
          </button>
          {!isHeronArticle && <button className="act" onClick={() => setMode('edit')}>Edit</button>}
          <button className="act" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
        </div>
      )}

      {localState === 'pending' && mode === 'reject' && (
        <div className="draft-actions">
          {REASONS.map((r) => (
            <button key={r.code} className="act reject" onClick={() => reject(r.code)} disabled={transition.isPending}>
              {r.label}
            </button>
          ))}
          <button className="act" onClick={() => setMode('view')}>↩ back</button>
        </div>
      )}

      {localState === 'pending' && mode === 'edit' && (
        <div className="draft-actions">
          <button className="act approve" onClick={saveEdit} disabled={transition.isPending}>
            <CheckIcon /> Save & approve
          </button>
          <button className="act" onClick={() => { setEditText(draft.editedText || draft.text); setMode('view') }}>
            Cancel
          </button>
        </div>
      )}

      {localState !== 'pending' && (
        <div className={`resolved ${localState}`}>
          <span>
            {localState === 'queued'
              ? '✓ Approved — added to your queue'
              : '✕ Rejected — Koel will avoid this angle'}
          </span>
        </div>
      )}
    </div>
  )
}
