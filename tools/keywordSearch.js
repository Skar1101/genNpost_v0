require('dotenv').config()
const OpenAI = require('openai')
const researchStore = require('../state/researchStore')
const keywordsStore = require('../state/keywordsStore')
const llm = require('../utils/llm')
const guard = require('../utils/llmGuard')
const G = require('../config/guardrails')
const costTracker = require('../utils/costTracker')
const logger = require('../utils/logger')
const log = logger.source('keywords')

let _openai = null
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

// Keyword research against the material this app actually sees.
//
// Deliberately deterministic-first: the LLM is used ONLY to expand a seed topic into candidate
// terms. Whether a term is worth anything is then decided by counting real occurrences in the
// current research pool — a made-up "trending" score from a model would be worse than useless here,
// since the whole point is to find what the sources are genuinely surfacing.

const STOP = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'are', 'was', 'how', 'why', 'what', 'you',
  'your', 'its', 'has', 'have', 'not', 'but', 'all', 'can', 'will', 'new', 'now', 'just', 'more',
  'most', 'when', 'where', 'been', 'they', 'them', 'their', 'about', 'into', 'than', 'then', 'over',
  'only', 'also', 'some', 'such', 'very', 'much', 'made', 'make', 'like', 'said', 'says', 'here',
])

function haystack(item) {
  return `${item.title || ''} ${item.snippet || ''} ${item.why || ''}`.toLowerCase()
}

// How many items in the pool mention this term, and how much engagement those items carry.
function scoreTerm(term, pool) {
  const t = String(term || '').toLowerCase().trim()
  if (!t) return null
  const hits = pool.filter(item => haystack(item).includes(t))
  if (!hits.length) return { term, hits: 0, engagement: 0, avgFit: null, sources: [] }
  const engagement = hits.reduce((s, h) => s + (h.engagement || 0), 0)
  const sources = [...new Set(hits.map(h => h.source).filter(Boolean))]
  return { term, hits: hits.length, engagement, sources }
}

// Terms the pool is talking about on its own — no seed needed. Word-frequency over titles, minus
// stopwords, which is a decent proxy for "what today's research is actually about".
function organicTerms(pool, limit = 12) {
  const counts = {}
  for (const item of pool) {
    const words = String(item.title || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/)
    for (const w of words) {
      if (w.length < 4 || STOP.has(w)) continue
      counts[w] = (counts[w] || 0) + 1
    }
  }
  return Object.entries(counts)
    .filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([term, hits]) => ({ term, hits }))
}

async function expandSeed(seed, platform) {
  const prompt = `Expand this topic into 12 specific search keywords someone would actually use to find content about it.

TOPIC: "${seed}"
PLATFORM: ${platform} — bias toward terms that matter to that platform's audience (x = timely/contrarian/cultural, linkedin = professional/career/industry, substack = evergreen/depth).

Rules:
- Concrete, searchable phrases (2-4 words). Not single generic words like "AI" or "technology".
- Cover adjacent angles, not just synonyms of the topic itself.
- No hashtags, no punctuation, lowercase.

Return ONLY a JSON array of strings.`

  const res = await llm.chat({ model: 'openai/gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.4, max_tokens: 400 })
  costTracker.priceAndRecord({ agent: 'raven', action: 'keyword_expand', modelId: 'openai/gpt-4o-mini', usage: res.usage })
  const raw = res.choices[0].message.content.trim()
  try {
    const m = raw.match(/\[[\s\S]*\]/)
    const arr = JSON.parse(m ? m[0] : raw)
    return Array.isArray(arr) ? arr.map(String).filter(Boolean) : []
  } catch (err) {
    log.warn('keyword expansion parse failed: ' + err.message)
    return []
  }
}

/**
 * @param {string|null} seed      topic to expand; omit to report on what the pool is already about
 * @param {string} platform       x | linkedin | substack — biases expansion + reports that platform's fit
 * @param {object|null} research  research run to score against; defaults to the latest
 */
async function keywordSearch({ seed = null, platform = 'x', research = null } = {}) {
  const run = research || researchStore.readLatest()
  const pool = (run?.results || []).filter(r => r.tag !== 'reply')
  if (!pool.length) {
    return { seed, platform, pool: 0, saved: keywordsStore.terms(null, platform), organic: [], candidates: [], note: 'No research available yet — run /research first.' }
  }

  const candidates = seed ? await expandSeed(seed, platform) : []
  const scored = candidates
    .map(t => scoreTerm(t, pool))
    .filter(Boolean)
    .sort((a, b) => b.hits - a.hits || b.engagement - a.engagement)

  // How the platform's own saved keywords are doing against today's pool — the useful bit for
  // deciding whether a configured term is still earning its place.
  const savedScored = keywordsStore.terms(null, platform)
    .map(t => scoreTerm(t, pool))
    .filter(Boolean)
    .sort((a, b) => b.hits - a.hits)

  log.info(`Keyword search — seed:"${seed || '(none)'}" platform:${platform} pool:${pool.length} candidates:${scored.length}`)

  return {
    seed,
    platform,
    pool: pool.length,
    rankedAt: run.rankedAt || null,
    organic: organicTerms(pool),
    candidates: scored,
    saved: savedScored,
  }
}

module.exports = keywordSearch
module.exports.scoreTerm = scoreTerm
module.exports.organicTerms = organicTerms
