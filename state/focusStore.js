// Account-keyed research focus OVERRIDE. When set, ChitraG biases toward these topics until Souvik
// clears it ("until I specify otherwise"). When empty, the system falls back to the profile niche.
const fs = require('fs')
const accounts = require('./accounts')

const FILE = 'focus-override.json'

function readJSON(file, fallback) {
  try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')) } catch (_) { /* ignore */ }
  return fallback
}
function writeJSON(file, data) {
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, file)
}

// Current override topics, or null when none set.
function get(account) {
  const d = readJSON(accounts.accountFile(account, FILE), null)
  return d && Array.isArray(d.topics) && d.topics.length ? d.topics : null
}

function set(account, topics) {
  const clean = (topics || []).map(t => String(t).trim()).filter(Boolean)
  writeJSON(accounts.accountFile(account, FILE), { topics: clean, at: new Date().toISOString() })
  return clean
}

function clear(account) {
  writeJSON(accounts.accountFile(account, FILE), { topics: [], at: new Date().toISOString() })
}

module.exports = { get, set, clear }
