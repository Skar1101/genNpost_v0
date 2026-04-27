const fs = require('fs')
const path = require('path')

const DATA_DIR = path.join(__dirname, 'data')
const HISTORY_FILE = path.join(DATA_DIR, 'koel-history.json')
const MAX_ENTRIES = 50

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

function readHistory() {
  if (!fs.existsSync(HISTORY_FILE)) return []
  try { return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')) } catch (_) { return [] }
}

function appendEntry(entry) {
  ensureDir()
  const history = readHistory()
  history.unshift(entry)           // newest first
  if (history.length > MAX_ENTRIES) history.splice(MAX_ENTRIES)
  const tmp = HISTORY_FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(history, null, 2))
  fs.renameSync(tmp, HISTORY_FILE)
}

module.exports = { readHistory, appendEntry }
