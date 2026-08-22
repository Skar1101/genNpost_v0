const fetchUserTweets = require('./fetchUserTweets')
const logger = require('../utils/logger')
const log = logger.source('watchlist')

// Recent posts from the accounts on Souvik's watchlist.
//
// Reposts are supposed to prioritise the watchlist, but the old implementation only re-ordered
// whatever the keyword search happened to return — and a keyword search almost never surfaces a
// specific handle, so in practice the watchlist did nothing. This pulls their timelines directly,
// which is the only way "watchlist first" can actually mean anything.
//
// Reuses tools/fetchUserTweets.js (the RapidAPI timeline endpoint already used by the brand audit),
// so there's no new provider or key involved.

function normalizeHandle(h) {
  return String(h || '')
    .trim()
    .replace(/^@/, '')
    .replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, '')
    .split(/[/?]/)[0]
    .toLowerCase()
}

/**
 * @param {string[]} handles     watchlist handles (bare, @-prefixed, or full profile URLs)
 * @param {number} perHandle     how many recent tweets to consider per handle
 * @param {number} maxAgeHours   ignore anything older — a repost should be timely
 * @returns items shaped like the research pool, so downstream code needs no special case
 */
// One API call per handle, so a 30-account watchlist costs 30 calls. Cache for a few hours so
// /drop, /reposts and a catch-up inside the same window reuse one fetch instead of re-billing it.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000
let _cache = { key: null, at: 0, items: null }

async function fetchWatchlist({ handles = [], perHandle = 5, maxAgeHours = 48, maxTotal = 80, force = false } = {}) {
  const clean = [...new Set((handles || []).map(normalizeHandle).filter(Boolean))]
  if (!clean.length) return []
  if (!process.env.RAPIDAPI_KEY) {
    log.warn('RAPIDAPI_KEY not set — skipping watchlist fetch')
    return []
  }

  const cacheKey = clean.slice().sort().join(',') + `|${perHandle}|${maxAgeHours}`
  if (!force && _cache.items && _cache.key === cacheKey && (Date.now() - _cache.at) < CACHE_TTL_MS) {
    log.info(`Using cached watchlist — ${_cache.items.length} items, ${Math.round((Date.now() - _cache.at) / 60000)}m old (${clean.length} handles not re-fetched)`)
    return _cache.items
  }

  const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000
  const out = []

  for (const handle of clean) {
    try {
      const { tweets } = await fetchUserTweets({ screenname: handle, count: perHandle })
      const fresh = (tweets || []).filter(t => {
        if (!t.text || t.text.startsWith('RT @')) return false
        if (!t.publishedAt) return true
        return new Date(t.publishedAt).getTime() >= cutoff
      })
      for (const t of fresh) {
        out.push({
          title: t.text.replace(/\s+/g, ' ').trim().slice(0, 200),
          fullText: t.text,
          snippet: t.snippet,
          url: t.url,
          source: 'twitter',
          publisher: handle,
          engagement: t.engagement,
          views: t.views,
          publishedAt: t.publishedAt,
          fetchedAt: t.fetchedAt,
          watchlist: true,          // marks these as priority candidates downstream
          topic: 'human',
        })
      }
      log.info(`@${handle}: ${fresh.length} recent post(s) within ${maxAgeHours}h`)
    } catch (err) {
      log.warn(`@${handle} failed: ${err.message}`)
    }
  }

  out.sort((a, b) => (b.engagement || 0) - (a.engagement || 0))
  // Cap the pool so a 30-account watchlist doesn't blow up the classification call downstream.
  const capped = out.slice(0, maxTotal)
  _cache = { key: cacheKey, at: Date.now(), items: capped }
  log.result(capped.length, out.length - capped.length)
  return capped
}

module.exports = fetchWatchlist
module.exports.normalizeHandle = normalizeHandle
