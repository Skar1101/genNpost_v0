// Video assets — files on disk under state/data/assets/videos/, metadata in one account-keyed JSON
// index. Mirrors state/imagesStore.js deliberately: same id scheme, same atomic writes, same
// traversal guard, so the two behave identically wherever they're used interchangeably.
//
// Videos are uploaded as RAW BINARY, not base64 JSON like images. A base64 payload inflates ~33%
// and the JSON body limit is 15mb (server/index.js) — fine for a picture, useless for video.
const fs = require('fs')
const path = require('path')
const accounts = require('./accounts')

const DATA_DIR = path.join(__dirname, 'data')
const VIDEOS_DIR = path.join(DATA_DIR, 'assets', 'videos')
const FILE = 'videos.json'

// Only formats the platforms actually accept. Checked against the real content-type, not the
// filename — an extension is a claim, a content-type is at least what the browser detected.
const TYPES = {
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
}
const MAX_BYTES = 200 * 1024 * 1024

function ensureDir() {
  if (!fs.existsSync(VIDEOS_DIR)) fs.mkdirSync(VIDEOS_DIR, { recursive: true })
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
function list(account) { return readJSON(indexFile(account), []) }
function write(account, arr) { writeJSON(indexFile(account), arr.slice(-200)) }

function extFor(contentType) { return TYPES[String(contentType).toLowerCase().split(';')[0].trim()] || null }
function isSupported(contentType) { return !!extFor(contentType) }

// Same traversal guard as imagesStore: the served path is user-reachable, so anything that isn't a
// bare generated id must never reach the filesystem.
const ID_RE = /^vid-[a-z0-9-]+$/i
function safeFilename(name) {
  const base = path.basename(String(name || ''))
  if (base !== String(name || '')) return null
  return base
}

function newId() {
  return 'vid-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6)
}

// `data` is a Buffer of the raw file. Returns the stored record.
function save({ data, contentType, account = null, platform = 'x', sourceText = '', filename = null } = {}) {
  const acct = account || accounts.getActiveAccount()
  const ext = extFor(contentType)
  if (!ext) throw new Error(`Unsupported video type "${contentType}" — use mp4, mov or webm`)
  if (!Buffer.isBuffer(data) || !data.length) throw new Error('No video data received')
  if (data.length > MAX_BYTES) throw new Error(`Video is ${(data.length / 1048576).toFixed(0)}MB — the limit is ${MAX_BYTES / 1048576}MB`)

  ensureDir()
  const id = newId()
  const file = id + ext
  fs.writeFileSync(path.join(VIDEOS_DIR, file), data)

  const rec = {
    id,
    filename: file,
    url: `/assets/videos/${file}`,
    account: acct,
    createdAt: new Date().toISOString(),
    bytes: data.length,
    contentType: String(contentType).split(';')[0].trim(),
    platform,
    source: 'upload',
    originalName: filename ? String(filename).slice(0, 120) : null,
    sourceText: String(sourceText || '').slice(0, 500),
  }
  const arr = list(acct)
  arr.push(rec)
  write(acct, arr)
  return rec
}

function get(account, id) {
  return list(account).find(v => v.id === id) || null
}

// Absolute path on disk — what the LinkedIn upload needs to stream the file.
function pathFor(account, id) {
  const rec = get(account, id)
  if (!rec) return null
  const safe = safeFilename(rec.filename)
  if (!safe) return null
  const p = path.join(VIDEOS_DIR, safe)
  return fs.existsSync(p) ? p : null
}

function remove(account, id) {
  const arr = list(account)
  const rec = arr.find(v => v.id === id)
  if (!rec) return false
  const safe = safeFilename(rec.filename)
  if (safe) { try { fs.unlinkSync(path.join(VIDEOS_DIR, safe)) } catch (_) { /* already gone */ } }
  write(account, arr.filter(v => v.id !== id))
  return true
}

module.exports = { save, get, list, remove, pathFor, isSupported, extFor, VIDEOS_DIR, ID_RE, safeFilename, MAX_BYTES, TYPES }
