const fs = require('fs')
const path = require('path')

const DATA_DIR = path.join(__dirname, 'data')
const FILE = path.join(DATA_DIR, 'scheduler.json')

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

function readRaw() {
  if (!fs.existsSync(FILE)) return {}
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) || {} } catch (_) { return {} }
}

// Merge-write so independent fields (enabled, lastDrop) never clobber each other.
function writeRaw(patch) {
  ensureDir()
  const data = { ...readRaw(), ...patch, updatedAt: new Date().toISOString() }
  const tmp = FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, FILE)
  return data
}

function getStatus() {
  const data = readRaw()
  return { enabled: data?.enabled !== false }   // default ON
}

function setEnabled(enabled) { return writeRaw({ enabled: !!enabled }) }

function isEnabled() { return getStatus().enabled }

// Idempotency key for the daily drop — the IST date (YYYY-MM-DD) it last ran, so a scheduled fire and a
// startup catch-up can't both run the same day.
function getLastDrop() { return readRaw().lastDrop || null }
function setLastDrop(ymd) { writeRaw({ lastDrop: ymd }); return ymd }

module.exports = { getStatus, setEnabled, isEnabled, getLastDrop, setLastDrop }
