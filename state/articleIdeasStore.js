// Account-keyed store for the latest batch of article ideas offered to Souvik (Telegram buttons /
// web). Each idea keeps its source research item so the article can be written from the SAME research
// run (no fresh search). Overwritten each time a new set of ideas is generated.
const fs = require('fs')
const accounts = require('./accounts')

const FILE = 'article-ideas-latest.json'

function readJSON(file, fallback) {
  try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')) } catch (_) { /* ignore */ }
  return fallback
}
function writeJSON(file, data) {
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, file)
}

// ideas: [{ idx, title, angle, url, snippet, source }], plus the runId of the research they came from.
function save(account, ideas, meta = {}) {
  const rec = { ideas: ideas || [], researchRunId: meta.researchRunId || null, at: new Date().toISOString() }
  writeJSON(accounts.accountFile(account, FILE), rec)
  return rec
}

function readLatest(account) {
  return readJSON(accounts.accountFile(account, FILE), null)
}

function getIdea(account, idx) {
  const d = readLatest(account)
  return d && Array.isArray(d.ideas) ? (d.ideas[idx] || null) : null
}

module.exports = { save, readLatest, getIdea }
