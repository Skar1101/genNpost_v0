// The asset library. An ASSET is a finished, editable, publishable unit: polished text split into
// segments, images attached, platform rules validated.
//
// Versioning mirrors state/articlesStore.js exactly — every edit appends a version rather than
// overwriting, so nothing is ever lost and any earlier state can be restored.
//
// `segments[]` is the thread split: one entry for a single post, N for a thread. It also happens to
// match the shape a scheduler like Postiz expects (posts[].post[]), so exporting to one later is a
// serializer rather than a refactor.
const fs = require('fs')
const path = require('path')
const accounts = require('./accounts')

const DATA_DIR = path.join(__dirname, 'data')
const ASSETS_DIR = path.join(DATA_DIR, 'assets')
const FILE = 'assets.json'

const STATES = ['draft', 'ready', 'scheduled', 'posted', 'archived']

function ensureDir() {
  if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true })
}

function readJSON(file, fallback) {
  try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')) } catch (_) { /* ignore */ }
  return fallback
}
function writeJSON(file, data) {
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, file)
}

function indexFile(account) { return accounts.accountFile(account, FILE) }
function readAll(account) { return readJSON(indexFile(account), []) }
function writeAll(account, arr) { ensureDir(); writeJSON(indexFile(account), arr.slice(-1000)) }

function titleFrom(segments) {
  const first = (segments?.[0]?.text || '').replace(/\s+/g, ' ').trim()
  return first.slice(0, 70) + (first.length > 70 ? '…' : '')
}

/**
 * @param {object[]} segments  [{ text, imageId? }]
 * @param {string} origin      manual | koel | quill | parrot | heron | repost | …
 */
function create(account, { segments = [], platform = 'x', origin = 'manual', meta = {}, warnings = [] } = {}) {
  const acct = accounts.slug(account || accounts.getActiveAccount())
  const now = new Date().toISOString()
  const id = 'as-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6)
  // Media fields are whitelisted explicitly: anything not named here is dropped, which is why
  // videoId and link have to be listed rather than spread — a bare {...s} would let arbitrary
  // client-supplied keys into the stored record.
  const clean = (segments || []).map(s => ({
    text: String(s.text || ''),
    imageId: s.imageId || null,
    videoId: s.videoId || null,
    link: s.link || null,
  }))

  const rec = {
    id,
    account: acct,
    platform,
    origin,
    state: 'draft',
    title: titleFrom(clean),
    segments: clean,
    warnings,
    meta,
    scheduledFor: null,
    postedAt: null,
    createdAt: now,
    updatedAt: now,
    versions: [{ v: 1, segments: clean, note: 'created', createdAt: now }],
  }
  const arr = readAll(account)
  arr.push(rec)
  writeAll(account, arr)
  return rec
}

function get(account, id) { return readAll(account).find(a => a.id === id) || null }

function list(account, { platform = null, state = null, limit = 200 } = {}) {
  let arr = readAll(account)
  if (platform) arr = arr.filter(a => a.platform === platform)
  if (state) arr = arr.filter(a => a.state === state)
  return arr.slice().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, limit)
}

// Append a version. Never overwrites history — that's the whole point of the store.
function update(account, id, { segments = null, platform = null, state = null, warnings = null, meta = null, note = 'edited' } = {}) {
  const arr = readAll(account)
  const rec = arr.find(a => a.id === id)
  if (!rec) return null

  if (segments) {
    const clean = segments.map(s => ({
      text: String(s.text || ''),
      imageId: s.imageId || null,
      videoId: s.videoId || null,
      link: s.link || null,
    }))
    rec.segments = clean
    rec.title = titleFrom(clean)
    rec.versions.push({ v: rec.versions.length + 1, segments: clean, note, createdAt: new Date().toISOString() })
  }
  if (platform) rec.platform = platform
  if (state) {
    if (!STATES.includes(state)) throw new Error('invalid asset state: ' + state)
    rec.state = state
    if (state === 'posted') rec.postedAt = new Date().toISOString()
  }
  if (warnings) rec.warnings = warnings
  if (meta) rec.meta = { ...rec.meta, ...meta }
  rec.updatedAt = new Date().toISOString()
  writeAll(account, arr)
  return rec
}

// Restore an earlier version by appending it as a NEW version, so the revert itself is undoable.
function revert(account, id, v) {
  const rec = get(account, id)
  if (!rec) return null
  const target = rec.versions.find(ver => ver.v === Number(v))
  if (!target) return null
  return update(account, id, { segments: target.segments, note: `reverted to v${v}` })
}

function setSchedule(account, id, iso) {
  const arr = readAll(account)
  const rec = arr.find(a => a.id === id)
  if (!rec) return null
  rec.scheduledFor = iso || null
  rec.state = iso ? 'scheduled' : (rec.state === 'scheduled' ? 'ready' : rec.state)
  rec.updatedAt = new Date().toISOString()
  writeAll(account, arr)
  return rec
}

// Everything with a slot, ordered by time — the calendar's read model.
function scheduled(account) {
  return readAll(account).filter(a => a.scheduledFor).sort((a, b) => new Date(a.scheduledFor) - new Date(b.scheduledFor))
}

// Assets whose slot has come and gone but which haven't been delivered yet.
function dueBefore(account, iso) {
  return scheduled(account).filter(a => a.state === 'scheduled' && a.scheduledFor <= iso)
}

function remove(account, id) {
  const arr = readAll(account)
  if (!arr.some(a => a.id === id)) return false
  writeAll(account, arr.filter(a => a.id !== id))
  return true
}

module.exports = { create, get, list, update, revert, setSchedule, scheduled, dueBefore, remove, STATES, ASSETS_DIR }
