// Persists seen URLs across runs so ChitraG never shows duplicate content
const fs = require('fs')
const path = require('path')

const DATA_DIR = path.join(__dirname, 'data')
const SEEN_FILE = path.join(DATA_DIR, 'seen-urls.json')
const MAX_URLS = 5000  // cap to prevent unbounded growth (~30 days of runs)

function load() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  if (!fs.existsSync(SEEN_FILE)) return { urls: [], addedAt: {} }
  try {
    return JSON.parse(fs.readFileSync(SEEN_FILE, 'utf8'))
  } catch (_) {
    return { urls: [], addedAt: {} }
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

function isNew(url) {
  const data = load()
  return !data.urls.includes(normalize(url))
}

function markSeen(urls) {
  const data = load()
  const seenSet = new Set(data.urls)
  const now = new Date().toISOString()

  for (const url of urls) {
    const n = normalize(url)
    if (!seenSet.has(n)) {
      seenSet.add(n)
      data.addedAt[n] = now
    }
  }

  // Trim oldest if over limit
  let allUrls = Array.from(seenSet)
  if (allUrls.length > MAX_URLS) {
    // Sort by addedAt ascending, drop oldest
    allUrls = allUrls
      .sort((a, b) => (data.addedAt[a] || '') < (data.addedAt[b] || '') ? -1 : 1)
      .slice(allUrls.length - MAX_URLS)
    // Clean up addedAt for removed entries
    const kept = new Set(allUrls)
    for (const k of Object.keys(data.addedAt)) {
      if (!kept.has(k)) delete data.addedAt[k]
    }
  }

  data.urls = allUrls
  save(data)
}

function filterNew(items) {
  const data = load()
  const seenSet = new Set(data.urls)
  return items.filter(item => !seenSet.has(normalize(item.url)))
}

module.exports = { isNew, markSeen, filterNew }
