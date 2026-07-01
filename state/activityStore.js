const fs = require('fs')
const path = require('path')

// Central activity log — one line per agent run (research, reply targets, daily batch, weekly,
// plan, write, tools). This is the raw material for the Titto "control tower" tab: what ran,
// who triggered it, when, and what came out. Append-only, bounded, atomic .tmp→rename writes.
const DATA_DIR = path.join(__dirname, 'data')
const FILE = path.join(DATA_DIR, 'activity-log.json')
const MAX_ENTRIES = 200

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

// Infer the trigger source from the label emoji (matches the UI badge convention).
function sourceFromLabel(label = '') {
  if (label.startsWith('⏰')) return 'scheduler'
  if (label.startsWith('📱')) return 'telegram'
  if (label.startsWith('💬')) return 'user'
  return 'api'
}

// Record one completed (or errored) run. Assigns id + ts, prepends (newest first), trims, returns it.
// entry: { agent, action, source, triggerLabel, status, summary, ref }
function record(entry = {}) {
  const now = new Date()
  const triggerLabel = entry.triggerLabel || '🖱 Manual'
  const item = {
    id: `${now.getTime()}-${++_counter}`,
    ts: now.toISOString(),
    agent: entry.agent || 'unknown',
    action: entry.action || 'run',
    source: entry.source || sourceFromLabel(triggerLabel),
    triggerLabel,
    status: entry.status || 'done',
    summary: entry.summary || '',
    ref: entry.ref || null,
  }
  try {
    const entries = readAll()
    entries.unshift(item)
    writeAll(entries.slice(0, MAX_ENTRIES))
  } catch (_) { /* never let logging break a run */ }
  return item
}

// Record + push the live `activity` WS event so the Titto tab updates without a refresh.
function recordAndBroadcast(broadcast, entry) {
  const item = record(entry)
  try { if (broadcast) broadcast({ type: 'activity', data: item }) } catch (_) {}
  return item
}

function list(limit = 100) {
  return readAll().slice(0, limit)
}

module.exports = { record, recordAndBroadcast, list }
