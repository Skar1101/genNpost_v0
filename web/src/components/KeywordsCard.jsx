import { useEffect, useState } from 'react'
import { useKeywords, useSaveKeywords, useKeywordSearch } from '../lib/queries.js'

const PLATFORM_LABEL = { x: 'X', linkedin: 'LinkedIn', substack: 'Substack' }
const PLATFORM_HINT = {
  x: 'Timely, contrarian, cultural — what stops a scroll.',
  linkedin: 'Career, industry, workplace — what a professional can use.',
  substack: 'Evergreen and deep — what repays 100+ words.',
}

// Keywords are stored as { term, weight } with weight 1-3. Rendered as one "term :: weight" per
// line, which is far quicker to edit than a row of inputs and round-trips cleanly.
function toText(list) {
  return (list || []).map((k) => (k.weight === 2 ? k.term : `${k.term} :: ${k.weight}`)).join('\n')
}
function fromText(text) {
  return String(text || '')
    .split('\n')
    .map((line) => {
      const [term, w] = line.split('::')
      return { term: (term || '').trim(), weight: Math.min(3, Math.max(1, Number(w) || 2)) }
    })
    .filter((k) => k.term)
}

export default function KeywordsCard() {
  const kwQ = useKeywords()
  const saveKw = useSaveKeywords()
  const search = useKeywordSearch()

  const [platform, setPlatform] = useState('x')
  const [text, setText] = useState('')
  const [seed, setSeed] = useState('')
  const [saved, setSaved] = useState(false)

  // Reload the editor whenever the stored set or the selected platform changes.
  useEffect(() => {
    const all = kwQ.data?.keywords
    if (all) setText(toText(all[platform]))
  }, [kwQ.data, platform])

  function save() {
    saveKw.mutate({ [platform]: fromText(text) }, {
      onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2000) },
    })
  }

  const result = search.data
  const candidates = result?.candidates || []
  const organic = result?.organic || []
  const savedScores = result?.saved || []

  return (
    <div className="card" style={{ padding: 18, marginBottom: 18 }}>
      <div style={{ fontWeight: 650, fontSize: 14, marginBottom: 4 }}>Platform keywords</div>
      <div className="hint" style={{ marginBottom: 14 }}>
        What Raven should weight higher when scoring each platform's fit. These ride into the same
        ranking call, so each manager pulls from the shared pool ordered for its own platform.
      </div>

      <div className="choice-row" style={{ gap: 8, marginBottom: 14 }}>
        {Object.keys(PLATFORM_LABEL).map((p) => (
          <button
            key={p}
            className={`btn sm ${platform === p ? 'primary' : ''}`}
            onClick={() => setPlatform(p)}
          >
            {PLATFORM_LABEL[p]}
          </button>
        ))}
      </div>

      <div className="hint" style={{ marginBottom: 6 }}>{PLATFORM_HINT[platform]}</div>
      <textarea
        className="field"
        rows={8}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'one keyword per line\ncareer growth :: 3   (":: 1-3" sets weight, default 2)'}
        style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}
      />

      <div className="choice-row" style={{ gap: 8, marginTop: 10, alignItems: 'center' }}>
        <button className="btn primary sm" onClick={save} disabled={saveKw.isPending}>
          {saveKw.isPending ? 'Saving…' : `Save ${PLATFORM_LABEL[platform]} keywords`}
        </button>
        {saved && <span className="hint" style={{ color: 'var(--good)' }}>Saved</span>}
        {saveKw.isError && <span className="hint" style={{ color: 'var(--crit)' }}>{saveKw.error?.message}</span>}
      </div>

      {/* Keyword research — scores candidates by real occurrences in the current research pool,
          not by a model's guess at what's trending. */}
      <div style={{ borderTop: '1px solid var(--border)', marginTop: 18, paddingTop: 16 }}>
        <div style={{ fontWeight: 650, fontSize: 13, marginBottom: 8 }}>Keyword research</div>
        <div className="choice-row" style={{ gap: 8 }}>
          <input
            className="field"
            style={{ flex: 1 }}
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder="Seed topic to expand (leave blank to just check what today's research is about)"
            onKeyDown={(e) => { if (e.key === 'Enter') search.mutate({ seed: seed.trim() || null, platform }) }}
          />
          <button
            className="btn sm"
            onClick={() => search.mutate({ seed: seed.trim() || null, platform })}
            disabled={search.isPending}
          >
            {search.isPending ? 'Checking…' : 'Check against research'}
          </button>
        </div>

        {search.isError && <div className="hint" style={{ color: 'var(--crit)', marginTop: 8 }}>{search.error?.message}</div>}

        {result && (
          <div style={{ marginTop: 12 }}>
            <div className="hint" style={{ marginBottom: 8 }}>
              Scored against {result.pool} research items{result.rankedAt ? ` from ${String(result.rankedAt).slice(0, 10)}` : ''}.
              {result.note ? ' ' + result.note : ''}
            </div>

            {candidates.length > 0 && (
              <div className="insight-block">
                <h3>Suggested for {PLATFORM_LABEL[platform]} — hits in today's pool</h3>
                <ul>
                  {candidates.slice(0, 12).map((c) => (
                    <li key={c.term}>
                      <span className="mono">{c.hits}×</span> {c.term}
                      {c.sources?.length ? <span className="hint"> · {c.sources.join(', ')}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {savedScores.length > 0 && (
              <div className="insight-block">
                <h3>Your saved {PLATFORM_LABEL[platform]} keywords vs today's pool</h3>
                <ul>
                  {savedScores.map((s) => (
                    <li key={s.term} style={{ color: s.hits ? 'var(--muted)' : 'var(--faint)' }}>
                      <span className="mono">{s.hits}×</span> {s.term}
                      {!s.hits && <span className="hint"> · nothing in today's research matches this</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {organic.length > 0 && (
              <div className="insight-block">
                <h3>What today's research is actually about</h3>
                <ul>
                  <li>{organic.map((o) => `${o.term} (${o.hits})`).join(' · ')}</li>
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
