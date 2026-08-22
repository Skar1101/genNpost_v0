// Account-keyed store for the real X brand-gap audit (agents/analyst.js's auditBrand()). One object
// per account, overwritten each run. Mirrors state/insightsStore.js's exact pattern.
const fs = require('fs')
const accounts = require('./accounts')

const FILE = 'brand-audit.json'

function readJSON(file, fallback) {
  try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')) } catch (_) { /* ignore */ }
  return fallback
}
function writeJSON(file, data) {
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, file)
}

// Latest audit or null. Shape:
//   { updatedAt, profile: {followers, totalTweets, following, createdAt}, ownStats: {avgEngagement,
//     avgViews, sampleSize}, topPerformers[], bottomPerformers[], nicheComparison[], summary,
//     gaps[], recommendations[] }
function get(account) {
  return readJSON(accounts.accountFile(account, FILE), null)
}

function save(account, audit) {
  const rec = { ...audit, updatedAt: new Date().toISOString() }
  writeJSON(accounts.accountFile(account, FILE), rec)
  return rec
}

module.exports = { get, save }
