const fs = require('fs')
const path = require('path')

const DATA_DIR = path.join(__dirname, 'data')
const CONV_FILE = path.join(DATA_DIR, 'conversations.json')
// 6 was far too small: a single write_post turn appends up to 4 entries, so two exchanges evicted
// everything and Titto genuinely had no memory of what you'd just discussed.
const MAX_HISTORY = 24
// A pasted article can be huge; keep stored turns bounded so the file (and the prompt) stay sane.
const MAX_CONTENT_CHARS = 4000

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
  const text = String(content == null ? '' : content).trim()
  if (!text) return
  const all = load()
  if (!all[sessionId]) all[sessionId] = []

  // Several branches in titto.js append the same user input twice (classify, then again inside the
  // intent handler). Collapsing an identical consecutive turn keeps the window from being eaten by
  // duplicates rather than real conversation.
  const prev = all[sessionId][all[sessionId].length - 1]
  if (prev && prev.role === role && prev.content === text.slice(0, MAX_CONTENT_CHARS)) return

  all[sessionId].push({ role, content: text.slice(0, MAX_CONTENT_CHARS), ts: new Date().toISOString() })
  // keep last MAX_HISTORY messages
  if (all[sessionId].length > MAX_HISTORY) {
    all[sessionId] = all[sessionId].slice(-MAX_HISTORY)
  }
  save(all)
}

// How long a turn stays part of the ACTIVE conversation. Raising MAX_HISTORY 6 → 24 without this
// meant a "write me an article" from the previous day was still live context and kept re-firing the
// writer on unrelated messages. Old turns stay on disk; they just stop steering new intent.
const CONTEXT_TTL_MS = 3 * 60 * 60 * 1000   // 3 hours
// A gap longer than this starts a fresh conversation outright.
const SESSION_GAP_MS = 6 * 60 * 60 * 1000

// Prior turns as a real OpenAI messages array, for callers that want genuine multi-turn context
// instead of history flattened into one prompt string. Stale turns are dropped.
function getMessages(sessionId, limit = MAX_HISTORY) {
  const all = getHistory(sessionId)
  if (!all.length) return []

  const now = Date.now()
  const tsOf = (m) => {
    const t = Date.parse(m.ts || '')
    return Number.isFinite(t) ? t : now
  }

  // If the last turn is itself ancient, this is a new conversation — carry nothing forward.
  if (now - tsOf(all[all.length - 1]) > SESSION_GAP_MS) return []

  return all
    .filter((m) => now - tsOf(m) <= CONTEXT_TTL_MS)
    .slice(-limit)
    .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }))
}

function clearHistory(sessionId) {
  const all = load()
  delete all[sessionId]
  save(all)
}

module.exports = { getHistory, getMessages, appendMessage, clearHistory, MAX_HISTORY }
