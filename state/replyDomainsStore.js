// Persists which OPTIONAL (non-core) reply-search domains are enabled.
// Core domains are always on and never stored here.
const fs = require('fs')
const path = require('path')
const { DOMAINS, coreIds, byId } = require('../tools/replyDomains.config')

const DATA_DIR = path.join(__dirname, 'data')
const FILE = path.join(DATA_DIR, 'reply-domains.json')

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

function readExtras() {
  ensureDir()
  if (!fs.existsSync(FILE)) return []
  try {
    const j = JSON.parse(fs.readFileSync(FILE, 'utf8'))
    return Array.isArray(j.enabled) ? j.enabled : []
  } catch (_) {
    return []
  }
}

function writeExtras(ids) {
  ensureDir()
  const tmp = FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify({ enabled: ids, updatedAt: new Date().toISOString() }, null, 2))
  fs.renameSync(tmp, FILE)
}

// Enabled optional domains (validated against the registry, core stripped out).
function getEnabledExtras() {
  return readExtras().filter(id => { const d = byId(id); return d && !d.core })
}

// Full domain id list to actually search with = core + enabled extras.
function getEnabledDomainIds() {
  return [...coreIds(), ...getEnabledExtras()]
}

function setEnabledExtras(ids) {
  const valid = [...new Set((ids || []).map(String).filter(id => { const d = byId(id); return d && !d.core }))]
  writeExtras(valid)
  return valid
}

function enableDomain(id) {
  const d = byId(id)
  if (!d || d.core) return false
  const cur = new Set(getEnabledExtras())
  cur.add(id)
  writeExtras([...cur])
  return true
}

function disableDomain(id) {
  const cur = new Set(getEnabledExtras())
  if (!cur.has(id)) return false
  cur.delete(id)
  writeExtras([...cur])
  return true
}

// All domains with their current enabled state (for display / API / UI).
function listDomainsWithState() {
  const extras = new Set(getEnabledExtras())
  return DOMAINS.map(d => ({ id: d.id, label: d.label, core: !!d.core, enabled: d.core || extras.has(d.id) }))
}

module.exports = {
  getEnabledExtras,
  getEnabledDomainIds,
  setEnabledExtras,
  enableDomain,
  disableDomain,
  listDomainsWithState,
}
