// Per-platform keyword priority. What earns reach on LinkedIn (career, industry, professional
// craft) is not what earns it on X (contrarian, timely, cultural) or Substack (evergreen, depth) —
// so a single global focus list, which is all `analyst.researchInstructions()` returned before this,
// pulls every platform toward the same handful of items.
//
// Account-keyed, one object per account. Same atomic .tmp→rename pattern as the other stores.
const fs = require('fs')
const accounts = require('./accounts')

const FILE = 'keywords.json'

function readJSON(file, fallback) {
  try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')) } catch (_) { /* ignore */ }
  return fallback
}
function writeJSON(file, data) {
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, file)
}

const PLATFORMS = ['x', 'linkedin', 'substack']

// Sensible starting sets, used until the user edits them in Settings. Weights are 1-3 and act as a
// soft multiplier on the LLM's platform-fit score — they nudge ordering, they don't hard-filter.
const DEFAULTS = {
  x: [
    { term: 'discipline', weight: 3 },
    { term: 'habits', weight: 3 },
    { term: 'AI in daily life', weight: 3 },
    { term: 'building in public', weight: 2 },
    { term: 'contrarian take', weight: 2 },
    { term: 'developer tools', weight: 1 },
  ],
  linkedin: [
    { term: 'career growth', weight: 3 },
    { term: 'engineering leadership', weight: 3 },
    { term: 'AI adoption at work', weight: 3 },
    { term: 'hiring and teams', weight: 2 },
    { term: 'startup lessons', weight: 2 },
    { term: 'productivity systems', weight: 1 },
  ],
  substack: [
    { term: 'deep dive', weight: 3 },
    { term: 'how AI changes how people work', weight: 3 },
    { term: 'long-term thinking', weight: 2 },
    { term: 'craft and mastery', weight: 2 },
    { term: 'essays on technology', weight: 2 },
    { term: 'first principles', weight: 1 },
  ],
}

function normalize(list) {
  if (!Array.isArray(list)) return []
  return list
    .map(k => (typeof k === 'string' ? { term: k, weight: 2 } : k))
    .map(k => ({ term: String(k.term || '').trim(), weight: Math.min(3, Math.max(1, Number(k.weight) || 2)) }))
    .filter(k => k.term)
}

// Full set for every platform, falling back to DEFAULTS per platform (not wholesale) so editing one
// platform never blanks the other two.
function getAll(account) {
  const saved = readJSON(accounts.accountFile(account, FILE), null) || {}
  const out = {}
  for (const p of PLATFORMS) {
    const list = normalize(saved[p])
    out[p] = list.length ? list : DEFAULTS[p]
  }
  return out
}

function get(account, platform) {
  return getAll(account)[PLATFORMS.includes(platform) ? platform : 'x']
}

// Bare terms, highest weight first — the shape the ranking prompt wants.
function terms(account, platform) {
  return get(account, platform).slice().sort((a, b) => b.weight - a.weight).map(k => k.term)
}

function save(account, patch) {
  const current = getAll(account)
  const next = { ...current }
  for (const p of PLATFORMS) {
    if (patch && patch[p] !== undefined) next[p] = normalize(patch[p])
  }
  writeJSON(accounts.accountFile(account, FILE), { ...next, updatedAt: new Date().toISOString() })
  return getAll(account)
}

module.exports = { getAll, get, terms, save, PLATFORMS, DEFAULTS }
