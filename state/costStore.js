const fs = require('fs')
const path = require('path')

// Central LLM spend log — one entry per priced call (agent, model, cost, token counts). Raw material
// for the Settings "Expenses" tab (day-wise, per-agent breakdown). Append-only, bounded, atomic
// .tmp→rename writes — mirrors state/activityStore.js. Article Writer costs are NOT logged here (they
// already persist per-version in articlesStore); see articlesStore.listCostEntries().
const DATA_DIR = path.join(__dirname, 'data')
const FILE = path.join(DATA_DIR, 'cost-log.json')
const MAX_ENTRIES = 5000

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

function readAll() {
  if (!fs.existsSync(FILE)) return []
  try {
    const data = JSON.parse(fs.readFileSync(FILE, 'utf8'))
    return Array.isArray(data) ? data : []
  } catch (_) { return [] }
}

function writeAll(entries) {
  ensureDir()
  const tmp = FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(entries, null, 2))
  fs.renameSync(tmp, FILE)
}

let _counter = 0

// Record one priced call. Assigns id + ts, prepends (newest first), trims, returns it.
// entry: { agent, action, model, cost, promptTokens, completionTokens }
function record(entry = {}) {
  const now = new Date()
  const item = {
    id: `${now.getTime()}-${++_counter}`,
    ts: now.toISOString(),
    agent: entry.agent || 'unknown',
    action: entry.action || 'run',
    model: entry.model || null,
    cost: entry.cost ?? null,
    promptTokens: entry.promptTokens ?? null,
    completionTokens: entry.completionTokens ?? null,
  }
  try {
    const entries = readAll()
    entries.unshift(item)
    writeAll(entries.slice(0, MAX_ENTRIES))
  } catch (_) { /* never let cost logging break a run */ }
  return item
}

function list(limit = MAX_ENTRIES) {
  return readAll().slice(0, limit)
}

module.exports = { record, list }
