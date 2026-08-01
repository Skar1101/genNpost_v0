// Account-keyed store for the latest batch of Substack article topics Heron surfaced (web/Telegram).
// Each topic keeps its source research item so the article can be written from the SAME research run.
// Overwritten each time a new set of topics is generated. Mirrors state/articleIdeasStore.js.
const fs = require('fs')
const accounts = require('./accounts')

const FILE = 'heron-topics-latest.json'

function readJSON(file, fallback) {
  try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')) } catch (_) { /* ignore */ }
  return fallback
}
function writeJSON(file, data) {
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, file)
}

// topics: [{ idx, title, angle, url, snippet, source, trendingScore }], plus the research runId they came from.
function save(account, topics, meta = {}) {
  const rec = { topics: topics || [], researchRunId: meta.researchRunId || null, at: new Date().toISOString() }
  writeJSON(accounts.accountFile(account, FILE), rec)
  return rec
}

function readLatest(account) {
  return readJSON(accounts.accountFile(account, FILE), null)
}

function getTopic(account, idx) {
  const d = readLatest(account)
  return d && Array.isArray(d.topics) ? (d.topics[idx] || null) : null
}

module.exports = { save, readLatest, getTopic }
