// Unified, account-keyed memory layer — the single source of truth the content engine reads
// before writing and appends to after every interaction. Reuses the atomic .tmp→rename pattern.
//
//   profile          — the creator profile (identity, niche, voice, restrictions, watchlist, …)
//   voice-examples   — real phrases/tweets that define the voice (seed for calibration)
//   approved-drafts  — drafts Souvik approved (what resonates)
//   rejected-drafts  — drafts Souvik rejected, WITH reason (never repeat these angles)
//   performance-log  — posted-tweet stats (weekly manual upload)
//   trend-log        — surfaced trends
//   draft-queue      — the draft-lifecycle state machine (generated→queued/rejected/edited→posted→measured)
const fs = require('fs')
const accounts = require('./accounts')

function readJSON(file, fallback) {
  try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')) } catch (_) { /* ignore */ }
  return fallback
}
function writeJSON(file, data) {
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, file)
}

// Generic account-keyed append-list store with FIFO cap.
function listStore(filename, max) {
  return {
    read(account) { return readJSON(accounts.accountFile(account, filename), []) },
    write(account, arr) { writeJSON(accounts.accountFile(account, filename), arr.slice(-max)) },
    append(account, entry) {
      const arr = this.read(account)
      arr.push({ ...entry, at: entry.at || new Date().toISOString() })
      this.write(account, arr)
      return entry
    },
  }
}

const voiceExamples = listStore('voice-examples.json', 200)
const approvedDrafts = listStore('approved-drafts.json', 300)
const rejectedDrafts = listStore('rejected-drafts.json', 300)
const performanceLog = listStore('performance-log.json', 300)
const trendLog = listStore('trend-log.json', 300)

// ── Profile (single object per account) ───────────────────────────────────────
const PROFILE_FILE = 'profile.json'
function getProfile(account) { return readJSON(accounts.accountFile(account, PROFILE_FILE), null) }
function saveProfile(account, profile) {
  writeJSON(accounts.accountFile(account, PROFILE_FILE), { ...profile, updatedAt: new Date().toISOString() })
  return getProfile(account)
}

// ── Draft lifecycle state machine ─────────────────────────────────────────────
const QUEUE_FILE = 'draft-queue.json'
const STATES = ['generated', 'queued', 'rejected', 'edited', 'posted', 'measured']

function readQueue(account) { return readJSON(accounts.accountFile(account, QUEUE_FILE), []) }
function writeQueue(account, arr) { writeJSON(accounts.accountFile(account, QUEUE_FILE), arr.slice(-500)) }

function addDraft(account, draft) {
  const q = readQueue(account)
  const id = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  const now = new Date().toISOString()
  const rec = {
    id,
    account: accounts.slug(account || accounts.getActiveAccount()),
    createdAt: now,
    state: 'generated',
    history: [{ state: 'generated', at: now }],
    text: draft.text || '',
    format: draft.format || 'short',
    origin: draft.origin || 'koel',   // koel | quill | reply
    meta: draft.meta || {},
  }
  q.push(rec)
  writeQueue(account, q)
  return rec
}

function getDraft(account, id) { return readQueue(account).find(d => d.id === id) || null }

// Move a draft to a new state; mirror the meaningful transitions into memory so the loop learns.
function transition(account, id, newState, extra = {}) {
  if (!STATES.includes(newState)) throw new Error('invalid draft state: ' + newState)
  const q = readQueue(account)
  const d = q.find(x => x.id === id)
  if (!d) return null
  const now = new Date().toISOString()
  d.state = newState
  d.history.push({ state: newState, at: now, ...(extra.reason ? { reason: extra.reason } : {}) })
  if (extra.editedText) d.editedText = extra.editedText
  if (extra.reason) d.reason = extra.reason
  if (extra.performance) d.performance = extra.performance
  if (newState === 'posted') d.postedAt = now
  writeQueue(account, q)

  const finalText = d.editedText || d.text
  const hookType = d.meta && d.meta.hookType
  if (newState === 'queued') approvedDrafts.append(account, { draftId: id, text: finalText, format: d.format, hookType })
  if (newState === 'rejected') rejectedDrafts.append(account, { draftId: id, text: d.text, format: d.format, reason: extra.reason || d.reason || '' })
  if (newState === 'edited') {
    approvedDrafts.append(account, { draftId: id, text: finalText, format: d.format, edited: true })
    voiceExamples.append(account, { text: finalText, source: 'edited-draft' })
  }
  if (newState === 'measured' && extra.performance) {
    performanceLog.append(account, { draftId: id, text: finalText, ...extra.performance })
  }
  return d
}

function listQueue(account, state) {
  const q = readQueue(account)
  return state ? q.filter(d => d.state === state) : q
}

// ── Read-before-write context (injected into Koel/Quill prompts in Phase 2) ───
function loadContext(account, opts = {}) {
  const a = account || accounts.getActiveAccount()
  const tail = (arr, n) => arr.slice(-n)
  return {
    account: accounts.slug(a),
    profile: getProfile(a),
    voiceExamples: tail(voiceExamples.read(a), opts.voiceN || 25),
    approved: tail(approvedDrafts.read(a), opts.approvedN || 25),
    rejected: tail(rejectedDrafts.read(a), opts.rejectedN || 40),
    performance: tail(performanceLog.read(a), opts.perfN || 20),
  }
}

module.exports = {
  accounts,
  voiceExamples, approvedDrafts, rejectedDrafts, performanceLog, trendLog,
  getProfile, saveProfile,
  addDraft, getDraft, transition, listQueue, readQueue, STATES,
  loadContext,
}
