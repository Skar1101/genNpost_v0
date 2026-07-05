// Account-keyed store for the learned "what's working" insights produced by the Phase 4
// performance loop (agents/analyst.js). One object per account, overwritten each analysis.
const fs = require('fs')
const accounts = require('./accounts')

const FILE = 'insights.json'

function readJSON(file, fallback) {
  try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')) } catch (_) { /* ignore */ }
  return fallback
}
function writeJSON(file, data) {
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, file)
}

// Latest insights or null. Shape:
//   { updatedAt, summary, workingHooks[], workingFormats[], workingTopics[], avoid[],
//     focus[], downweight[], sourceStats[{source,drafted,approved,rejected,winRate}] }
function get(account) {
  return readJSON(accounts.accountFile(account, FILE), null)
}

function save(account, insights) {
  const rec = { ...insights, updatedAt: new Date().toISOString() }
  writeJSON(accounts.accountFile(account, FILE), rec)
  return rec
}

module.exports = { get, save }
