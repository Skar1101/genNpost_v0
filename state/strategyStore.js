// THE content strategy — one editable source of truth for what this account is about.
//
// Before this existed, topical control was spread across seven places, none editable from the UI:
// sub-agents/quill/PILLARS.md (and setPillars() actually threw), prompts/rankResults.js's hardcoded
// exclusions, agents/raven.js's hardcoded DOMAINS, config/contentVolume.js's thread themes,
// state/keywordsStore.js, tools/sources.config.js, and profile.json. Changing positioning meant
// editing several of them in code. Everything now derives from this file instead.
//
// Consumers:
//   prompts/rankResults.js  — domain taxonomy + HARD EXCLUDE list
//   agents/raven.js         — ON_TOPIC domains, off-topic drop
//   agents/quill.js         — which pillar owns each thread slot
//   config/contentVolume.js — thread themes
//   state/keywordsStore.js  — seeds per-platform keywords
const fs = require('fs')
const accounts = require('./accounts')

const FILE = 'strategy.json'

function readJSON(file, fallback) {
  try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')) } catch (_) { /* ignore */ }
  return fallback
}
function writeJSON(file, data) {
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, file)
}

// Every domain an item can be classified into. `other` is not postable — it's the label the ranker
// gives something that should have been excluded, and raven drops it in code.
const ALL_DOMAINS = ['ai-tools', 'ai-research', 'ai-impact', 'self-help', 'wellness', 'building', 'other']

// `threadSlot`:
//   'always' — owns a thread slot every single day
//   'rotate' — shares the remaining slot(s) with other 'rotate' pillars, alternating by day
//   'none'   — contributes topics and filtering, but never claims a thread
const DEFAULTS = {
  positioning: 'AI influencer · self-help expert · wellness expert',
  pillars: [
    {
      id: 'ai',
      label: 'AI',
      active: true,
      threadSlot: 'always',
      weight: 50,
      domains: ['ai-tools', 'ai-impact', 'ai-research'],
      notes: 'AI tools, agents, models, and how they change the way people work. Practical over academic.',
      keywords: ['AI agents', 'AI tools', 'LLM workflow', 'automation', 'AI at work', 'prompt engineering'],
      // Shorts are mined for THIS pillar only. Queries cover the four things worth surfacing:
      // AI tools, AI product/model updates, practical AI workflow, and AI experts on the industry.
      shorts: true,
      sources: {
        subreddits: ['artificial', 'LocalLLaMA', 'OpenAI', 'singularity'],
        youtubeQueries: [
          'new AI tools',
          'AI news update this week',
          'AI agent workflow tutorial',
          'AI expert on the tech industry',
        ],
        xQueries: ['(AI OR LLM OR "AI agent") (tool OR launch OR release) lang:en'],
      },
    },
    {
      id: 'self-help',
      label: 'Self-help',
      active: true,
      threadSlot: 'rotate',
      weight: 25,
      domains: ['self-help'],
      notes: 'Discipline, habits, focus, mindset, resilience. Raw and specific — never soft self-care fluff.',
      shorts: false,   // Shorts search on self-help queries returns guru clips and viral bait
      keywords: ['discipline', 'habits', 'deep work', 'focus', 'consistency', 'mindset'],
      sources: {
        subreddits: ['getdisciplined', 'selfimprovement', 'productivity', 'Stoicism'],
        youtubeQueries: ['discipline habits', 'deep work focus', 'stop procrastinating'],
        xQueries: ['(discipline OR habits OR "deep work" OR consistency) lang:en'],
      },
    },
    {
      id: 'wellness',
      label: 'Wellness',
      active: true,
      threadSlot: 'rotate',
      weight: 25,
      domains: ['wellness'],
      notes: 'Sleep, energy, recovery, meditation, physical and mental health. Secular and evidence-led.',
      shorts: false,   // same — wellness Shorts skew to pseudoscience and engagement bait
      keywords: ['sleep', 'energy', 'recovery', 'meditation', 'burnout', 'mental health'],
      sources: {
        subreddits: ['Meditation', 'Biohackers', 'sleep'],
        youtubeQueries: ['sleep science', 'meditation for focus', 'burnout recovery'],
        xQueries: ['(meditation OR mindfulness OR sleep OR burnout OR recovery) lang:en'],
      },
    },
  ],
  // Editable ban list, injected verbatim into the ranking prompt's HARD EXCLUDE section.
  exclusions: [
    'Religion and devotional practice — scripture, chanting/mantras, prayer, gurus, karma, astrology, manifestation. Secular meditation and mindfulness ARE wanted; faith-based practice is not.',
    'Politics or policy of any kind — elections, government, law, drug policy',
    'Recreational drugs, alcohol, cannabis — including "history of" and cultural-commentary framings',
    'Finance, crypto, trading, get-rich content',
    'Sports, celebrity gossip',
    'General-interest trivia, etymology, language curiosities, history lessons, "fun fact" content',
    'Video games, gaming benchmarks, game-playing AI research',
    'Home decor, interior design, travel, food, lifestyle aesthetics',
    'ASMR, "oddly satisfying", and other low-effort engagement-bait formats',
    // Positioning as a wellness EXPERT means the credibility bar is higher, not lower — one
    // binaural-beats post undoes a month of evidence-led ones.
    'Pseudoscience and wellness woo — binaural beats / "528 Hz healing", detoxes, chakras, energy healing, miracle supplements, anything promising regeneration or cures without evidence',
  ],
}

const AI_DOMAINS = ['ai-tools', 'ai-research', 'ai-impact']

// Fields added after a strategy was first saved would otherwise silently normalize to their generic
// fallback — `weight` landing on 1 for every pillar, flattening a deliberate 50/25/25 split to
// equal thirds. Backfilling from DEFAULTS by id keeps saved files forward-compatible.
function defaultsFor(id) {
  return DEFAULTS.pillars.find(d => d.id === id) || null
}

function normalizePillar(p, i) {
  const domains = Array.isArray(p.domains) ? p.domains.filter(d => ALL_DOMAINS.includes(d)) : []
  const fallback = defaultsFor(String(p.id || '').toLowerCase())
  // `shorts` — whether YouTube Shorts are mined for this pillar. Off unless explicitly set, except
  // for AI pillars: Shorts search is a slop magnet outside AI (self-help/wellness queries returned
  // devotional clips and viral-bait), and AI is where genuinely useful short-form material lives.
  const shorts = p.shorts !== undefined ? !!p.shorts : domains.some(d => AI_DOMAINS.includes(d))
  // Relative, not a percentage — so adding a fourth pillar later doesn't force renumbering the
  // other three. 0 is legal and means "filter and research on this subject, but post nothing".
  const weight = Number.isFinite(Number(p.weight))
    ? Math.max(0, Math.round(Number(p.weight)))
    : (fallback?.weight ?? 1)
  return {
    shorts,
    weight,
    id: String(p.id || p.label || `pillar-${i}`).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    label: String(p.label || p.id || `Pillar ${i + 1}`).trim(),
    active: p.active !== false,
    threadSlot: ['always', 'rotate', 'none'].includes(p.threadSlot) ? p.threadSlot : 'rotate',
    domains: domains.length ? domains : ['other'],
    notes: String(p.notes || '').trim(),
    keywords: Array.isArray(p.keywords) ? p.keywords.map(String).map(s => s.trim()).filter(Boolean) : [],
    sources: {
      subreddits: Array.isArray(p.sources?.subreddits) ? p.sources.subreddits.map(String) : [],
      youtubeQueries: Array.isArray(p.sources?.youtubeQueries) ? p.sources.youtubeQueries.map(String) : [],
      xQueries: Array.isArray(p.sources?.xQueries) ? p.sources.xQueries.map(String) : [],
    },
  }
}

function get(account) {
  const saved = readJSON(accounts.accountFile(account, FILE), null)
  if (!saved) return JSON.parse(JSON.stringify(DEFAULTS))
  return {
    positioning: String(saved.positioning || DEFAULTS.positioning),
    pillars: Array.isArray(saved.pillars) && saved.pillars.length
      ? saved.pillars.map(normalizePillar)
      : DEFAULTS.pillars,
    exclusions: Array.isArray(saved.exclusions) ? saved.exclusions.map(String).filter(Boolean) : DEFAULTS.exclusions,
    updatedAt: saved.updatedAt || null,
  }
}

function save(account, patch) {
  const current = get(account)
  const next = {
    positioning: patch.positioning !== undefined ? String(patch.positioning) : current.positioning,
    pillars: Array.isArray(patch.pillars) ? patch.pillars.map(normalizePillar) : current.pillars,
    exclusions: Array.isArray(patch.exclusions) ? patch.exclusions.map(String).filter(Boolean) : current.exclusions,
    updatedAt: new Date().toISOString(),
  }
  if (!next.pillars.some(p => p.active)) throw new Error('At least one pillar must stay active')
  writeJSON(accounts.accountFile(account, FILE), next)
  return get(account)
}

// ── Derived views (what the rest of the system actually reads) ────────────────

function activePillars(account) {
  return get(account).pillars.filter(p => p.active)
}

// Every domain the account publishes on. Anything outside this is dropped by raven.
function onTopicDomains(account) {
  const set = new Set()
  for (const p of activePillars(account)) for (const d of p.domains) if (d !== 'other') set.add(d)
  return [...set]
}

function pillarForDomain(account, domain) {
  return activePillars(account).find(p => p.domains.includes(domain)) || null
}

/**
 * Which pillar owns each thread slot today.
 * 'always' pillars claim slots first, in order; remaining slots go to 'rotate' pillars, offset by
 * the day so they alternate. Deterministic — no stored state, so it can't drift.
 */
function threadThemes(account, slots = 2, date = new Date()) {
  const active = activePillars(account)
  const always = active.filter(p => p.threadSlot === 'always')
  const rotate = active.filter(p => p.threadSlot === 'rotate')

  const themes = []
  for (const p of always) {
    if (themes.length >= slots) break
    themes.push({ label: p.label, pillarId: p.id, domains: p.domains })
  }
  if (rotate.length) {
    // Day-of-year offset so consecutive days start the rotation at a different pillar.
    const dayIndex = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000)
    let r = dayIndex
    while (themes.length < slots) {
      const p = rotate[r % rotate.length]
      themes.push({ label: p.label, pillarId: p.id, domains: p.domains })
      r++
      if (rotate.length === 1 && themes.length >= slots) break
    }
  }
  return themes.slice(0, slots)
}

/**
 * Distribute `count` slots across active pillars in proportion to their weights.
 *
 * Largest-remainder (Hamilton) rather than naive rounding: rounding each share independently either
 * loses a post or invents one — with 10 posts at 50/25/25 the naive result is 5+3+3=11. Here the
 * floors are handed out first, then the leftover slots go to the largest fractional remainders, so
 * the parts sum to exactly `count` every time.
 *
 * @returns [{ pillarId, label, domains, weight, n }] — ordered by allocation, largest first.
 */
function pillarTargets(account, count) {
  const active = activePillars(account).filter(p => p.weight > 0)
  const total = active.reduce((s, p) => s + p.weight, 0)
  if (!active.length || total <= 0 || count <= 0) return []

  const exact = active.map(p => ({ p, share: (p.weight / total) * count }))
  const rows = exact.map(({ p, share }) => ({
    pillarId: p.id, label: p.label, domains: p.domains, weight: p.weight,
    n: Math.floor(share), _rem: share - Math.floor(share),
  }))

  let left = count - rows.reduce((s, r) => s + r.n, 0)
  rows.sort((a, b) => b._rem - a._rem || b.weight - a.weight)
  for (let i = 0; left > 0; i++, left--) rows[i % rows.length].n++

  return rows
    .map(({ _rem, ...r }) => r)
    .sort((a, b) => b.n - a.n || b.weight - a.weight)
}

// The share of output that belongs to AI vs everything else, as a 0-1 fraction. Raven's supply
// balancer uses this instead of the hardcoded 60/40 it carried from before pillars existed.
function aiShare(account) {
  const active = activePillars(account)
  const total = active.reduce((s, p) => s + p.weight, 0)
  if (!total) return 0.5
  const ai = active.filter(p => p.domains.some(d => AI_DOMAINS.includes(d)))
                   .reduce((s, p) => s + p.weight, 0)
  return ai / total
}

// Merged keyword list across active pillars — seeds per-platform keywords.
function allKeywords(account) {
  return [...new Set(activePillars(account).flatMap(p => p.keywords))]
}

// Merged source hints, for sources.config consumers.
function sourceHints(account) {
  const out = { subreddits: [], youtubeQueries: [], xQueries: [] }
  for (const p of activePillars(account)) {
    out.subreddits.push(...(p.sources.subreddits || []))
    out.youtubeQueries.push(...(p.sources.youtubeQueries || []))
    out.xQueries.push(...(p.sources.xQueries || []))
  }
  for (const k of Object.keys(out)) out[k] = [...new Set(out[k])]
  return out
}

module.exports = {
  get, save, activePillars, onTopicDomains, pillarForDomain, threadThemes, allKeywords, sourceHints,
  pillarTargets, aiShare,
  ALL_DOMAINS, DEFAULTS,
}
