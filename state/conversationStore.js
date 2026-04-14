const fs = require('fs')
const path = require('path')

const DATA_DIR = path.join(__dirname, 'data')
const CONV_FILE = path.join(DATA_DIR, 'conversations.json')
const MAX_HISTORY = 6

function load() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  if (!fs.existsSync(CONV_FILE)) return {}
  try {
    return JSON.parse(fs.readFileSync(CONV_FILE, 'utf8'))
  } catch (_) {
    return {}
  }
}

function save(data) {
  const tmp = CONV_FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, CONV_FILE)
}

function getHistory(sessionId) {
  const all = load()
  return all[sessionId] || []
}

function appendMessage(sessionId, role, content) {
  const all = load()
  if (!all[sessionId]) all[sessionId] = []
  all[sessionId].push({ role, content, ts: new Date().toISOString() })
  // keep last MAX_HISTORY messages
  if (all[sessionId].length > MAX_HISTORY) {
    all[sessionId] = all[sessionId].slice(-MAX_HISTORY)
  }
  save(all)
}

function clearHistory(sessionId) {
  const all = load()
  delete all[sessionId]
  save(all)
}

module.exports = { getHistory, appendMessage, clearHistory }
