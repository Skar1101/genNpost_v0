const fs = require('fs')
const path = require('path')

const DATA_DIR = path.join(__dirname, 'data')
const HISTORY_FILE = path.join(DATA_DIR, 'quill-history.json')
const MAX_RUNS = 60  // ~2 months of daily runs

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

function readHistory() {
  if (!fs.existsSync(HISTORY_FILE)) return []
  try { return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')) } catch (_) { return [] }
}

function appendRun(data) {
  ensureDir()
  const history = readHistory()
  history.unshift(data)  // newest first
  if (history.length > MAX_RUNS) history.splice(MAX_RUNS)
  const tmp = HISTORY_FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(history, null, 2))
  fs.renameSync(tmp, HISTORY_FILE)
}

function readLatest() {
  const history = readHistory()
  return history[0] || null
}

module.exports = { appendRun, readHistory, readLatest }
