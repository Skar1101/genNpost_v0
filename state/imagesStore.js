// Image assets — the files live on disk under state/data/assets/images/, the metadata in one
// account-keyed JSON index. Assets (state/assetsStore.js) reference images by id.
//
// `approved`/`rejected` is not decoration: once ~15-20 images are approved they become the training
// set for a Flux LoRA on fal.ai. The approval loop is what builds that dataset, which is why every
// image carries a verdict field from the start.
const fs = require('fs')
const path = require('path')
const accounts = require('./accounts')

const DATA_DIR = path.join(__dirname, 'data')
const IMAGES_DIR = path.join(DATA_DIR, 'assets', 'images')
const FILE = 'images.json'

function ensureDir() {
  if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true })
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
function write(account, arr) { writeJSON(indexFile(account), arr.slice(-500)) }

function extFor(contentType) {
  if (/png/i.test(contentType)) return '.png'
  if (/webp/i.test(contentType)) return '.webp'
  return '.jpg'
}

// Reject anything that isn't a bare generated id before it reaches the filesystem — the served
// path is user-reachable, so a traversal here would read arbitrary files.
const ID_RE = /^img-[a-z0-9-]+$/i
function safeFilename(name) {
  const base = path.basename(String(name || ''))
  if (base !== String(name || '')) return null
  return base
}

/**
 * Save image bytes + metadata.
 * @param {Buffer} buffer
 * @param {object} meta { contentType, platform, prompt, subject, model, provider, source, cost, sourceText }
 */
function save(account, buffer, meta = {}) {
  ensureDir()
  const id = 'img-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6)
  const filename = id + extFor(meta.contentType || '')
  fs.writeFileSync(path.join(IMAGES_DIR, filename), buffer)

  const rec = {
    id,
    filename,
    url: `/assets/images/${filename}`,
    account: accounts.slug(account || accounts.getActiveAccount()),
    createdAt: new Date().toISOString(),
    bytes: buffer.length,
    contentType: meta.contentType || 'image/jpeg',
    platform: meta.platform || 'x',
    source: meta.source || 'generated',   // generated | upload
    prompt: meta.prompt || null,
    subject: meta.subject || null,
    model: meta.model || null,
    provider: meta.provider || null,
    cost: meta.cost ?? null,
    sourceText: (meta.sourceText || '').slice(0, 300) || null,
    verdict: null,                         // null | approved | rejected — feeds the future LoRA set
  }
  const arr = list(account)
  arr.push(rec)
  write(account, arr)
  return rec
}

function get(account, id) { return list(account).find(i => i.id === id) || null }

function setVerdict(account, id, verdict) {
  if (!['approved', 'rejected', null].includes(verdict)) throw new Error('invalid verdict: ' + verdict)
  const arr = list(account)
  const rec = arr.find(i => i.id === id)
  if (!rec) return null
  rec.verdict = verdict
  rec.verdictAt = new Date().toISOString()
  write(account, arr)
  return rec
}

// The training set for a future LoRA — approved images only.
function approved(account) { return list(account).filter(i => i.verdict === 'approved') }

function remove(account, id) {
  const arr = list(account)
  const rec = arr.find(i => i.id === id)
  if (!rec) return false
  const safe = safeFilename(rec.filename)
  if (safe) { try { fs.unlinkSync(path.join(IMAGES_DIR, safe)) } catch (_) { /* already gone */ } }
  write(account, arr.filter(i => i.id !== id))
  return true
}

module.exports = { save, get, list, setVerdict, approved, remove, IMAGES_DIR, ID_RE, safeFilename }
