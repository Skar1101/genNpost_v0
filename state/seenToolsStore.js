// Tracks seen tool URLs so Raven never shows the same tool twice
const fs = require('fs')
const path = require('path')

const DATA_DIR = path.join(__dirname, 'data')
const SEEN_FILE = path.join(DATA_DIR, 'seen-tools.json')
const MAX_TOOLS = 500  // ~167 days at 3/day

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

function markSeen(urls) {
  const data = load()
  const seenSet = new Set(data.urls)
  const now = new Date().toISOString()
  for (const url of urls) {
    const n = normalize(url)
    if (!seenSet.has(n)) { seenSet.add(n); data.addedAt[n] = now }
  }
  let allUrls = Array.from(seenSet)
  if (allUrls.length > MAX_TOOLS) {
    allUrls = allUrls
      .sort((a, b) => (data.addedAt[a] || '') < (data.addedAt[b] || '') ? -1 : 1)
      .slice(allUrls.length - MAX_TOOLS)
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

module.exports = { markSeen, filterNew }
