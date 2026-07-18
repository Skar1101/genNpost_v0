import { useEffect, useState } from 'react'
import { useProfile, useSaveProfile, useReplyDomains, useSaveReplyDomains } from '../lib/queries.js'

const linesToArray = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean)
const arrayToLines = (a) => (a || []).join('\n')

function emptyForm() {
  return {
    identity: { name: '', handle: '', niche: '', audience: '', goal: '', deadline: '' },
    baseline: { followers: '', avgImpressions: '' },
    voice: { description: '', doRules: '', dontRules: '' },
    restrictions: '', watchlist: '', bestTweets: '',
  }
}

// Profile (nested objects + arrays) <-> flat form state (arrays as newline-joined strings for simple editing).
function profileToForm(p) {
  if (!p) return emptyForm()
  return {
    identity: { ...emptyForm().identity, ...p.identity },
    baseline: {
      followers: p.baseline?.followers ?? '',
      avgImpressions: p.baseline?.avgImpressions ?? '',
    },
    voice: {
      description: p.voice?.description || '',
      doRules: arrayToLines(p.voice?.doRules),
      dontRules: arrayToLines(p.voice?.dontRules),
    },
    restrictions: arrayToLines(p.restrictions),
    watchlist: arrayToLines(p.watchlist),
    bestTweets: arrayToLines((p.bestTweets || []).map((t) => (typeof t === 'string' ? t : t.url || t.text || ''))),
  }
}

function formToProfile(form, original) {
  return {
    ...original,
    identity: { ...original.identity, ...form.identity },
    baseline: {
      followers: form.baseline.followers === '' ? null : Number(form.baseline.followers),
      avgImpressions: form.baseline.avgImpressions === '' ? null : Number(form.baseline.avgImpressions),
    },
    voice: {
      ...original.voice,
      description: form.voice.description,
      doRules: linesToArray(form.voice.doRules),
      dontRules: linesToArray(form.voice.dontRules),
    },
    restrictions: linesToArray(form.restrictions),
    watchlist: linesToArray(form.watchlist),
    bestTweets: linesToArray(form.bestTweets),
  }
}

export default function SettingsPage() {
  const profileQ = useProfile()
  const saveProfile = useSaveProfile()
  const domainsQ = useReplyDomains()
  const saveDomains = useSaveReplyDomains()

  const [form, setForm] = useState(emptyForm())
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (profileQ.data?.profile) setForm(profileToForm(profileQ.data.profile))
  }, [profileQ.data])

  function set(section, field, value) {
    setForm((f) => (field == null ? { ...f, [section]: value } : { ...f, [section]: { ...f[section], [field]: value } }))
  }

  function save() {
    const merged = formToProfile(form, profileQ.data?.profile || {})
    saveProfile.mutate(merged, { onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2000) } })
  }

  function toggleDomain(id, currentlyEnabled) {
    const enabledExtras = (domainsQ.data?.domains || [])
      .filter((d) => !d.core && (d.id === id ? !currentlyEnabled : d.enabled))
      .map((d) => d.id)
    saveDomains.mutate(enabledExtras)
  }

  if (profileQ.isLoading) return <div className="content"><div className="card placeholder"><p>Loading profile…</p></div></div>

  return (
    <div className="content">
      <div className="card" style={{ padding: 18, marginBottom: 18 }}>
        <div style={{ fontWeight: 650, fontSize: 14, marginBottom: 14 }}>Creator profile</div>

        <div className="choice-row" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div style={{ flex: '1 1 200px' }}>
            <div className="hint" style={{ marginBottom: 4 }}>Name</div>
            <input className="field" value={form.identity.name} onChange={(e) => set('identity', 'name', e.target.value)} />
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <div className="hint" style={{ marginBottom: 4 }}>X handle</div>
            <input className="field" value={form.identity.handle} onChange={(e) => set('identity', 'handle', e.target.value)} placeholder="skar_connect" />
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div className="hint" style={{ marginBottom: 4 }}>Niche</div>
          <textarea className="field" rows={2} value={form.identity.niche} onChange={(e) => set('identity', 'niche', e.target.value)} />
        </div>

        <div className="choice-row" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div style={{ flex: '1 1 200px' }}>
            <div className="hint" style={{ marginBottom: 4 }}>Audience</div>
            <input className="field" value={form.identity.audience} onChange={(e) => set('identity', 'audience', e.target.value)} />
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <div className="hint" style={{ marginBottom: 4 }}>Goal</div>
            <input className="field" value={form.identity.goal} onChange={(e) => set('identity', 'goal', e.target.value)} placeholder="20k followers" />
          </div>
          <div style={{ flex: '1 1 140px' }}>
            <div className="hint" style={{ marginBottom: 4 }}>Deadline</div>
            <input className="field" value={form.identity.deadline} onChange={(e) => set('identity', 'deadline', e.target.value)} placeholder="2026-12-31" />
          </div>
        </div>

        <div className="choice-row" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div style={{ flex: '1 1 160px' }}>
            <div className="hint" style={{ marginBottom: 4 }}>Current followers</div>
            <input className="field" type="number" value={form.baseline.followers} onChange={(e) => set('baseline', 'followers', e.target.value)} />
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <div className="hint" style={{ marginBottom: 4 }}>Avg impressions</div>
            <input className="field" type="number" value={form.baseline.avgImpressions} onChange={(e) => set('baseline', 'avgImpressions', e.target.value)} />
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div className="hint" style={{ marginBottom: 4 }}>Voice description</div>
          <textarea className="field" rows={2} value={form.voice.description} onChange={(e) => set('voice', 'description', e.target.value)} />
        </div>

        <div className="choice-row" style={{ gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <div className="hint" style={{ marginBottom: 4 }}>Voice do's (one per line)</div>
            <textarea className="field" rows={4} value={form.voice.doRules} onChange={(e) => set('voice', 'doRules', e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="hint" style={{ marginBottom: 4 }}>Voice don'ts (one per line)</div>
            <textarea className="field" rows={4} value={form.voice.dontRules} onChange={(e) => set('voice', 'dontRules', e.target.value)} />
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div className="hint" style={{ marginBottom: 4 }}>Watchlist handles (one per line)</div>
          <textarea className="field" rows={2} value={form.watchlist} onChange={(e) => set('watchlist', null, e.target.value)} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <div className="hint" style={{ marginBottom: 4 }}>Best tweets — links or text, one per line (calibrates voice)</div>
          <textarea className="field" rows={3} value={form.bestTweets} onChange={(e) => set('bestTweets', null, e.target.value)} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <div className="hint" style={{ marginBottom: 4 }}>Restrictions — topics/words to avoid, one per line</div>
          <textarea className="field" rows={2} value={form.restrictions} onChange={(e) => set('restrictions', null, e.target.value)} />
        </div>

        <button className="btn primary" onClick={save} disabled={saveProfile.isPending}>
          {saveProfile.isPending ? 'Saving…' : saved ? '✓ Saved' : 'Save profile'}
        </button>
      </div>

      <div className="card" style={{ padding: 18 }}>
        <div style={{ fontWeight: 650, fontSize: 14, marginBottom: 4 }}>Reply-search domains</div>
        <p className="hint" style={{ marginBottom: 12 }}>Core domains are always on. Toggle the optional ones — they widen every /replies run.</p>
        <div className="choice-row">
          {(domainsQ.data?.domains || []).map((d) => (
            <button
              key={d.id}
              className={`choice-btn${d.enabled ? ' is-active' : ''}`}
              disabled={d.core || saveDomains.isPending}
              title={d.core ? 'Core domain — always on' : undefined}
              onClick={() => toggleDomain(d.id, d.enabled)}
            >
              {d.core ? '🔒 ' : ''}{d.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
