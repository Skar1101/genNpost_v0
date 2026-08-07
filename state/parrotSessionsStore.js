const fs = require('fs')
const path = require('path')

const DATA_DIR = path.join(__dirname, 'data')
const FILE = path.join(DATA_DIR, 'parrot-sessions.json')
const MAX_SESSIONS = 30

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

function _readAll() {
  if (!fs.existsSync(FILE)) return { sessions: [] }
  try {
    const data = JSON.parse(fs.readFileSync(FILE, 'utf8'))
    if (!Array.isArray(data?.sessions)) return { sessions: [] }
    return data
  } catch (_) { return { sessions: [] } }
}

function _writeAll(data) {
  ensureDir()
  const tmp = FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, FILE)
}

function listSessions() {
  return _readAll().sessions
}

function readSession(id) {
  return _readAll().sessions.find(s => s.id === id) || null
}

function createSession({ triggerLabel = '🖱 Plan button', categories = [], suggestions = [] } = {}) {
  const data = _readAll()
  const id = 'plan-' + Date.now()
  const session = {
    id,
    createdAt: new Date().toISOString(),
    triggerLabel,
    categories,
    suggestions,
    drafts: [],
  }
  data.sessions.unshift(session)
  if (data.sessions.length > MAX_SESSIONS) data.sessions.splice(MAX_SESSIONS)
  _writeAll(data)
  return id
}

function appendDraft(sessionId, draft) {
  const data = _readAll()
  const s = data.sessions.find(x => x.id === sessionId)
  if (!s) return null
  s.drafts.push(draft)
  _writeAll(data)
  return draft
}

function deleteSession(id) {
  const data = _readAll()
  const before = data.sessions.length
  data.sessions = data.sessions.filter(s => s.id !== id)
  if (data.sessions.length === before) return false
  _writeAll(data)
  return true
}

module.exports = { listSessions, readSession, createSession, appendDraft, deleteSession }
