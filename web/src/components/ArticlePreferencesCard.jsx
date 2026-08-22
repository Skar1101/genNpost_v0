import { useEffect, useState } from 'react'
import {
  useArticleTemplate, useSaveArticleTemplate,
  useArticleLessons, useLearnArticleLessons, useAddArticleLesson, useRemoveArticleLesson,
} from '../lib/queries.js'

const PLATFORMS = [
  { id: 'x', label: 'X articles' },
  { id: 'substack', label: 'Substack posts' },
]

// Article preferences — length, structure, links, voice, anti-slop rules.
//
// These two markdown files were ALREADY driving every article; they just had no UI, so the only way
// to change how articles get written was to edit files on disk. Editing per `## section` rather than
// as one blob, because that's how the files are already written — changing the "Links" rule
// shouldn't mean scrolling a wall of markdown.
export default function ArticlePreferencesCard() {
  const [platform, setPlatform] = useState('x')
  const tpl = useArticleTemplate(platform)
  const save = useSaveArticleTemplate()

  const lessonsQ = useArticleLessons()
  const learn = useLearnArticleLessons()
  const addLesson = useAddArticleLesson()
  const removeLesson = useRemoveArticleLesson()

  const [sections, setSections] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)
  const [newRule, setNewRule] = useState('')

  useEffect(() => { setSections(tpl.data?.sections || null); setDirty(false) }, [tpl.data])

  const lessons = lessonsQ.data?.rules || []

  function setBody(i, body) {
    setSections((s) => s.map((sec, idx) => (idx === i ? { ...sec, body } : sec)))
    setDirty(true)
  }

  function commit() {
    save.mutate(
      { platform, preamble: tpl.data?.preamble || '', sections },
      { onSuccess: () => { setDirty(false); setSaved(true); setTimeout(() => setSaved(false), 2500) } },
    )
  }

  return (
    <div className="card" style={{ padding: 18, marginBottom: 18 }}>
      <div style={{ fontWeight: 650, fontSize: 14, marginBottom: 4 }}>Article preferences</div>
      <div className="hint" style={{ marginBottom: 14 }}>
        How articles get written — length, structure, links, voice. Read fresh on every article, so a
        save applies to the next one with no restart.
      </div>

      {/* ── Learned from your corrections ───────────────────────────────── */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 16 }}>
        <div className="choice-row" style={{ alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontWeight: 650, fontSize: 13 }}>Learned from your edits</span>
          <span className="hint">{lessonsQ.data?.learnedFrom ? `from ${lessonsQ.data.learnedFrom} corrections` : ''}</span>
          <div className="spacer" style={{ flex: 1 }} />
          <button className="btn sm" onClick={() => learn.mutate()} disabled={learn.isPending}>
            {learn.isPending ? 'Learning…' : 'Re-learn'}
          </button>
        </div>
        <div className="hint" style={{ marginBottom: 8 }}>
          Every time you refine an article, the instruction is kept. These are the standing rules
          distilled from them — they outrank the template below. Delete any that are wrong.
        </div>

        {lessons.length === 0 ? (
          <div className="hint">Nothing learned yet. Refine a few articles, then hit Re-learn.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {lessons.map((r) => (
              <div key={r.id} className="choice-row" style={{ gap: 8, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 12.5, flex: 1 }}>
                  {r.pinned && <span className="hint" title="Pinned — survives re-learning">📌 </span>}
                  {r.text}
                </span>
                <button className="btn sm" onClick={() => removeLesson.mutate(r.id)} title="Remove this rule">✕</button>
              </div>
            ))}
          </div>
        )}

        <div className="choice-row" style={{ gap: 6, marginTop: 10 }}>
          <input
            className="field" style={{ flex: 1 }}
            placeholder="Add a rule of your own — it'll be pinned and survive re-learning"
            value={newRule} onChange={(e) => setNewRule(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && newRule.trim()) { addLesson.mutate(newRule); setNewRule('') } }}
          />
          <button className="btn sm" disabled={!newRule.trim()} onClick={() => { addLesson.mutate(newRule); setNewRule('') }}>Add</button>
        </div>
      </div>

      {/* ── The template itself ─────────────────────────────────────────── */}
      <div className="choice-row" style={{ gap: 8, marginBottom: 8 }}>
        {PLATFORMS.map((p) => (
          <button key={p.id} className={`btn sm ${platform === p.id ? 'primary' : ''}`} onClick={() => setPlatform(p.id)}>
            {p.label}
          </button>
        ))}
        <div className="spacer" style={{ flex: 1 }} />
        <span className="hint mono" style={{ fontSize: 11 }}>{tpl.data?.rel}</span>
      </div>

      {tpl.isLoading || !sections ? (
        <p className="hint">Loading…</p>
      ) : (
        <>
          {sections.map((sec, i) => (
            <div key={sec.heading + i} style={{ marginBottom: 12 }}>
              <div className="hint" style={{ marginBottom: 4, fontWeight: 650 }}>{sec.heading}</div>
              <textarea
                className="field"
                style={{ fontSize: 12.5, minHeight: 70 }}
                rows={Math.min(12, Math.max(3, sec.body.split('\n').length))}
                value={sec.body}
                onChange={(e) => setBody(i, e.target.value)}
              />
            </div>
          ))}

          <div className="choice-row" style={{ gap: 8, alignItems: 'center', marginTop: 10 }}>
            <button className="btn primary sm" onClick={commit} disabled={!dirty || save.isPending}>
              {save.isPending ? 'Saving…' : dirty ? 'Save preferences' : 'Saved'}
            </button>
            {saved && <span className="hint" style={{ color: 'var(--good)' }}>Saved — applies to the next article</span>}
            {save.isError && <span className="hint" style={{ color: 'var(--crit)' }}>{save.error?.message}</span>}
          </div>
        </>
      )}
    </div>
  )
}
