import { useEffect, useState } from 'react'
import { useStrategy, useSaveStrategy } from '../lib/queries.js'

// Matches config/contentVolume.js posts.count — used only for the live preview.
const TOTAL_POSTS = 10

const THREAD_SLOT = [
  { id: 'always', label: 'Always', hint: 'Owns a thread slot every day' },
  { id: 'rotate', label: 'Rotate', hint: 'Shares remaining slots, alternating by day' },
  { id: 'none', label: 'Never', hint: 'Contributes topics, never claims a thread' },
]

const DOMAIN_HINT = {
  'ai-tools': 'tools, agents, releases',
  'ai-research': 'papers, academic',
  'ai-impact': 'AI changing work/life',
  'self-help': 'discipline, habits, focus',
  'wellness': 'sleep, energy, recovery',
  'building': 'solo SaaS, indie',
}

function listToText(a) { return (a || []).join('\n') }
function textToList(t) { return String(t || '').split('\n').map(s => s.trim()).filter(Boolean) }

// Mirrors state/strategyStore.js pillarTargets() — largest remainder, so the preview matches what
// the backend will actually allocate rather than being a rough approximation.
function allocate(pillars, count) {
  const active = pillars.filter((p) => p.active && p.weight > 0)
  const total = active.reduce((s, p) => s + p.weight, 0)
  if (!active.length || total <= 0 || count <= 0) return {}
  const rows = active.map((p) => {
    const share = (p.weight / total) * count
    return { id: p.id, n: Math.floor(share), rem: share - Math.floor(share), w: p.weight }
  })
  let left = count - rows.reduce((s, r) => s + r.n, 0)
  rows.sort((a, b) => b.rem - a.rem || b.w - a.w)
  for (let i = 0; left > 0; i++, left--) rows[i % rows.length].n++
  return Object.fromEntries(rows.map((r) => [r.id, r.n]))
}

function PillarEditor({ pillar, allDomains, onChange, onRemove, sharePct, postCount }) {
  const set = (patch) => onChange({ ...pillar, ...patch })

  return (
    <div className="card" style={{ padding: 14, marginBottom: 10, opacity: pillar.active ? 1 : 0.55 }}>
      <div className="choice-row" style={{ gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <input
          className="field"
          style={{ flex: '1 1 160px', fontWeight: 650 }}
          value={pillar.label}
          onChange={(e) => set({ label: e.target.value })}
          placeholder="Pillar name"
        />
        <button className={`btn sm ${pillar.active ? 'primary' : ''}`} onClick={() => set({ active: !pillar.active })}>
          {pillar.active ? 'Active' : 'Off'}
        </button>
        <button className="btn sm" onClick={onRemove} title="Remove pillar">✕</button>
      </div>

      {/* Weight is the priority lever — how much of the daily output this pillar gets. Relative,
          not a percentage, so adding a pillar later doesn't force renumbering the others. */}
      <div className="choice-row" style={{ gap: 10, alignItems: 'center', marginBottom: 10 }}>
        <span className="hint" style={{ flex: 'none' }}>Weight</span>
        <input
          type="range" min={0} max={100} step={5}
          value={pillar.weight}
          onChange={(e) => set({ weight: Number(e.target.value) })}
          style={{ flex: 1 }}
        />
        <input
          className="field mono"
          style={{ width: 62, textAlign: 'right' }}
          type="number" min={0}
          value={pillar.weight}
          onChange={(e) => set({ weight: Math.max(0, Number(e.target.value) || 0) })}
        />
        <span className="hint" style={{ flex: 'none', width: 118, textAlign: 'right' }}>
          {pillar.weight > 0 && pillar.active
            ? `${sharePct}% · ${postCount} of ${TOTAL_POSTS} posts`
            : pillar.weight === 0 ? 'no posts' : 'inactive'}
        </span>
      </div>

      <div className="hint" style={{ marginBottom: 4 }}>Thread slot</div>
      <div className="choice-row" style={{ gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {THREAD_SLOT.map((s) => (
          <button
            key={s.id}
            className={`btn sm ${pillar.threadSlot === s.id ? 'primary' : ''}`}
            title={s.hint}
            onClick={() => set({ threadSlot: s.id })}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="hint" style={{ marginBottom: 4 }}>Domains — what the ranker labels an item to match this pillar</div>
      <div className="choice-row" style={{ gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {allDomains.filter((d) => d !== 'other').map((d) => {
          const on = pillar.domains.includes(d)
          return (
            <button
              key={d}
              className={`btn sm ${on ? 'primary' : ''}`}
              title={DOMAIN_HINT[d] || ''}
              onClick={() => set({ domains: on ? pillar.domains.filter((x) => x !== d) : [...pillar.domains, d] })}
            >
              {d}
            </button>
          )
        })}
      </div>

      <div className="hint" style={{ marginBottom: 4 }}>Description — fed to the ranker as what this pillar means</div>
      <textarea className="field" rows={2} value={pillar.notes} onChange={(e) => set({ notes: e.target.value })} />

      {/* Shorts mining is AI-only by default: a live pass across all pillars returned devotional
          clips for wellness queries and guru/viral-bait for self-help. */}
      <label className="choice-row" style={{ gap: 6, marginTop: 10, alignItems: 'center', cursor: 'pointer' }}>
        <input type="checkbox" checked={!!pillar.shorts} onChange={(e) => set({ shorts: e.target.checked })} />
        <span className="hint">
          Mine YouTube Shorts for this pillar
          {!pillar.domains.some((d) => d.startsWith('ai-')) && ' — ignored unless the pillar has an AI domain'}
        </span>
      </label>

      <div className="hint" style={{ margin: '10px 0 4px' }}>Keywords — one per line</div>
      <textarea
        className="field" rows={3}
        style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
        value={listToText(pillar.keywords)}
        onChange={(e) => set({ keywords: textToList(e.target.value) })}
      />
    </div>
  )
}

// The content strategy — one editable place that drives the ranking prompt's subjects and ban list,
// Raven's on-topic domains, the daily thread themes, and the repost filter. Before this, changing
// positioning meant editing seven files in code.
export default function StrategyCard() {
  const q = useStrategy()
  const save = useSaveStrategy()

  const [draft, setDraft] = useState(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => { if (q.data?.strategy) setDraft(q.data.strategy) }, [q.data])

  if (q.isLoading || !draft) {
    return <div className="card" style={{ padding: 18, marginBottom: 18 }}><p className="hint">Loading strategy…</p></div>
  }

  const allDomains = q.data?.allDomains || []
  const themes = q.data?.threadThemesToday || []
  const alloc = allocate(draft.pillars, TOTAL_POSTS)
  const activeWeight = draft.pillars.filter((p) => p.active && p.weight > 0).reduce((s, p) => s + p.weight, 0)

  function setPillar(i, next) {
    setDraft((d) => ({ ...d, pillars: d.pillars.map((p, idx) => (idx === i ? next : p)) }))
  }
  function addPillar() {
    setDraft((d) => ({
      ...d,
      pillars: [...d.pillars, { id: `pillar-${d.pillars.length + 1}`, label: 'New pillar', active: true, threadSlot: 'rotate', weight: 10, shorts: false, domains: [], notes: '', keywords: [], sources: { subreddits: [], youtubeQueries: [], xQueries: [] } }],
    }))
  }
  function removePillar(i) {
    setDraft((d) => ({ ...d, pillars: d.pillars.filter((_, idx) => idx !== i) }))
  }
  function commit() {
    save.mutate(draft, { onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2500) } })
  }

  return (
    <div className="card" style={{ padding: 18, marginBottom: 18 }}>
      <div style={{ fontWeight: 650, fontSize: 14, marginBottom: 4 }}>Content strategy</div>
      <div className="hint" style={{ marginBottom: 14 }}>
        What this account is about. Drives research ranking, the topic filter, the daily thread
        themes and which reposts qualify — change it here, not in code.
      </div>

      <div className="hint" style={{ marginBottom: 4 }}>Positioning</div>
      <input
        className="field"
        value={draft.positioning}
        onChange={(e) => setDraft((d) => ({ ...d, positioning: e.target.value }))}
        placeholder="AI influencer · self-help expert · wellness expert"
      />

      {themes.length > 0 && (
        <div className="hint" style={{ marginTop: 10 }}>
          Today's threads: <strong>{themes.map((t) => t.label).join('  +  ')}</strong>
        </div>
      )}

      <div className="section-head" style={{ marginTop: 18, marginBottom: 10 }}>
        <span className="eyebrow">Pillars</span>
        <div className="spacer" style={{ flex: 1 }} />
        <button className="btn sm" onClick={addPillar}>+ Add pillar</button>
      </div>

      {draft.pillars.map((p, i) => (
        <PillarEditor
          key={i}
          pillar={p}
          allDomains={allDomains}
          onChange={(next) => setPillar(i, next)}
          onRemove={() => removePillar(i)}
          sharePct={activeWeight > 0 ? Math.round((p.weight / activeWeight) * 100) : 0}
          postCount={alloc[p.id] ?? 0}
        />
      ))}

      <div className="hint" style={{ margin: '16px 0 4px' }}>
        Never include — one rule per line. Injected straight into the ranker's hard-exclude list.
      </div>
      <textarea
        className="field" rows={7}
        style={{ fontSize: 12.5 }}
        value={listToText(draft.exclusions)}
        onChange={(e) => setDraft((d) => ({ ...d, exclusions: textToList(e.target.value) }))}
      />

      <div className="choice-row" style={{ gap: 8, marginTop: 14, alignItems: 'center' }}>
        <button className="btn primary sm" onClick={commit} disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save strategy'}
        </button>
        {saved && <span className="hint" style={{ color: 'var(--good)' }}>Saved — takes effect on the next research run</span>}
        {save.isError && <span className="hint" style={{ color: 'var(--crit)' }}>{save.error?.message}</span>}
      </div>
    </div>
  )
}
