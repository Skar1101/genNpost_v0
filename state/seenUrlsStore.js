// Persists seen URLs across runs so Raven never shows duplicate content.
//
// ─── Why entries expire ──────────────────────────────────────────────────────
// Originally nothing expired: a URL seen once was blocked until it aged out of the 5000-entry cap.
// That quietly starved the slow-moving sources. Measured 2026-08-11 on a live fetch:
//
//     hackernews  13 fetched ->  0 survived      github  15 -> 0      youtube  6 -> 0
//     twitter     20 fetched -> 15 survived      reddit  25 -> 19     arxiv   15 -> 6
//
// GitHub, HN and YouTube are exactly the AI-TOOLS sources, and they move slowly — a trending repo
// stays trending for a week, a channel posts weekly. Twitter and Reddit churn constantly, so they
// kept producing "new" URLs and flooded the pool with whatever they happened to surface. That is
// why AI content vanished from the drop and off-topic Twitter/Reddit filler took its place.
//
// The fix is a per-source memory: block a URL long enough not to repeat it in consecutive drops,
// then let it back in if it's STILL trending — because on those sources, still-trending means it's
// genuinely worth posting about.
const fs = require('fs')
const path = require('path')

const DATA_DIR = path.join(__dirname, 'data')
const SEEN_FILE = path.join(DATA_DIR, 'seen-urls.json')
const MAX_URLS = 5000  // cap to prevent unbounded growth

// How long a URL stays blocked, per source. Slow-moving, high-quality sources forget sooner.
const TTL_DAYS = {
  github: 10,       // a repo trending 10 days later is a real signal, not a repeat
  hackernews: 7,
  youtube: 14,      // channels post weekly; two weeks avoids re-showing the same video
  arxiv: 21,
  twitter: 45,      // high churn — a specific tweet is genuinely one-shot
  reddit: 45,
}
const DEFAULT_TTL_DAYS = 30

function ttlFor(source) {
  return (TTL_DAYS[source] ?? DEFAULT_TTL_DAYS) * 24 * 60 * 60 * 1000
}

function load() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  if (!fs.existsSync(SEEN_FILE)) return { urls: [], addedAt: {}, sourceOf: {} }
  try {
    const d = JSON.parse(fs.readFileSync(SEEN_FILE, 'utf8'))
    return { urls: d.urls || [], addedAt: d.addedAt || {}, sourceOf: d.sourceOf || {} }
  } catch (_) {
    return { urls: [], addedAt: {}, sourceOf: {} }
  }
}

function save(data) {
  const tmp = SEEN_FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data))
  fs.renameSync(tmp, SEEN_FILE)
}

function normalize(url) {
  return (url || '').toLowerCase().trim().replace(/\/$/, '')
}

// Has this URL been seen recently enough to still be blocked? `source` picks the TTL; when it's
// unknown (older entries predate source tracking) the stored source is used, else the default.
function isBlocked(data, url, source) {
  const n = normalize(url)
  if (!data.seenSet.has(n)) return false
  const added = data.addedAt[n]
  if (!added) return true                       // no timestamp — treat as permanently seen (old entry)
  const src = source || data.sourceOf[n]
  return (Date.now() - new Date(added).getTime()) < ttlFor(src)
}

function isNew(url, source = null) {
  const data = load()
  data.seenSet = new Set(data.urls)
  return !isBlocked(data, url, source)
}

/**
 * @param {Array<string|{url,source}>} entries  URLs, or items carrying their source (preferred —
 *        the source is what decides how long the URL stays blocked).
 */
function markSeen(entries) {
  const data = load()
  const seenSet = new Set(data.urls)
  const now = new Date().toISOString()

  for (const e of entries || []) {
    const url = typeof e === 'string' ? e : e?.url
    const source = typeof e === 'string' ? null : e?.source
    const n = normalize(url)
    if (!n) continue
    // Refresh the timestamp even when already present, so something that keeps trending keeps its
    // block window rolling rather than expiring mid-streak.
    seenSet.add(n)
    data.addedAt[n] = now
    if (source) data.sourceOf[n] = source
  }

  let allUrls = Array.from(seenSet)
  if (allUrls.length > MAX_URLS) {
    allUrls = allUrls
      .sort((a, b) => ((data.addedAt[a] || '') < (data.addedAt[b] || '') ? -1 : 1))
      .slice(allUrls.length - MAX_URLS)
    const kept = new Set(allUrls)
    for (const k of Object.keys(data.addedAt)) if (!kept.has(k)) delete data.addedAt[k]
    for (const k of Object.keys(data.sourceOf)) if (!kept.has(k)) delete data.sourceOf[k]
  }

  data.urls = allUrls
  delete data.seenSet
  save(data)
}

function filterNew(items) {
  const data = load()
  data.seenSet = new Set(data.urls)
  return items.filter(item => !isBlocked(data, item.url, item.source))
}

// Diagnostics for /health — how much each source is currently being suppressed.
function stats() {
  const data = load()
  const bySource = {}
  for (const url of data.urls) {
    const src = data.sourceOf[url] || 'unknown'
    const added = data.addedAt[url]
    const blocked = !added || (Date.now() - new Date(added).getTime()) < ttlFor(src)
    bySource[src] = bySource[src] || { total: 0, blocked: 0 }
    bySource[src].total++
    if (blocked) bySource[src].blocked++
  }
  return { total: data.urls.length, bySource, ttlDays: { ...TTL_DAYS, default: DEFAULT_TTL_DAYS } }
}

module.exports = { isNew, markSeen, filterNew, stats, TTL_DAYS }
