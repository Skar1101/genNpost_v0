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
  if (origin === 'parrot') return 'Parrot · LinkedIn post'
  return 'Koel · direct'
}

export default function DraftCard({ draft }) {
  const [localState, setLocalState] = useState('pending') // pending | queued | rejected — optimistic UI only
  const [mode, setMode] = useState('view') // view | reject | edit
  const [editText, setEditText] = useState(draft.editedText || draft.text)
  const [copied, setCopied] = useState(false)
  const [postError, setPostError] = useState(null)
  const transition = useTransition()
  const navigate = useNavigate()
  const isHeronArticle = draft.origin === 'heron' && draft.meta?.kind === 'article' && draft.meta?.articleId
  const isLinkedIn = draft.platform === 'linkedin'

  const text = draft.editedText || draft.text

  function approve() {
    setPostError(null)
    if (isLinkedIn) {
      // Real post, not a draft-lifecycle move — stay 'pending' visually until we know the outcome.
      // A failure leaves the server-side draft untouched (still 'generated'), so this same button
      // works as retry.
      setLocalState('posting')
      transition.mutate({ id: draft.id, state: 'queued' }, {
        onSuccess: (data) => {
          if (data?.linkedin?.ok) setLocalState('posted')
          else { setLocalState('pending'); setPostError(data?.linkedin?.error || 'LinkedIn post failed') }
        },
        onError: (err) => { setLocalState('pending'); setPostError(err.message) },
      })
      return
    }
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

      {postError && (
        <div className="resolved rejected" style={{ marginBottom: 8 }}>
          <span>⚠️ {postError} — tap Post to LinkedIn to retry.</span>
        </div>
      )}

      {localState === 'pending' && mode === 'view' && (
        <div className="draft-actions">
          <button className="act approve" onClick={approve} disabled={transition.isPending}>
            <CheckIcon /> {isLinkedIn ? 'Post to LinkedIn' : 'Approve'}
          </button>
          <button className="act reject" onClick={() => setMode('reject')} disabled={transition.isPending}>
            <XIcon /> Reject
          </button>
          {!isHeronArticle && <button className="act" onClick={() => setMode('edit')}>Edit</button>}
          <button className="act" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
        </div>
      )}

      {localState === 'posting' && (
        <div className="draft-actions">
          <button className="act" disabled><CheckIcon /> Posting to LinkedIn…</button>
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

      {localState !== 'pending' && localState !== 'posting' && (
        <div className={`resolved ${localState === 'posted' ? 'queued' : localState}`}>
          <span>
            {localState === 'posted'
              ? '✓ Posted to LinkedIn'
              : localState === 'queued'
                ? '✓ Approved — added to your queue'
                : '✕ Rejected — Koel will avoid this angle'}
          </span>
        </div>
      )}
    </div>
  )
}
