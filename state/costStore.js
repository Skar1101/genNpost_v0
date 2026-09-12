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
// entry: { agent, action, model, cost, promptTokens, completionTokens, account? }
// `account` is optional and additive — entries logged before this field existed, or by call sites
// that haven't been updated to pass it, simply have account: null and are excluded from any
// per-account total (see totalForAccount below). The shared log itself stays one global file: with
// exactly one real account today there's nothing to gain from splitting it, and it avoids a data
// migration entirely. Split it per-account only once a second tenant actually exists.
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
    // Image generations are billed per image, not per token — without this the count was being
    // passed in and silently dropped by this whitelist, leaving image rows with no units at all.
    images: entry.images ?? null,
    account: entry.account || null,
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

// Total spend for one account since a given ISO timestamp. Entries with no account tag (everything
// logged before per-account tagging, or by a call site not yet updated to pass it) are excluded —
// safe under-counting rather than attributing untagged spend to the wrong tenant.
function totalForAccount(account, sinceIso) {
  if (!account) return 0
  return readAll()
    .filter(e => e.account === account && (!sinceIso || e.ts >= sinceIso))
    .reduce((s, e) => s + (e.cost || 0), 0)
}

module.exports = { record, list, totalForAccount }
