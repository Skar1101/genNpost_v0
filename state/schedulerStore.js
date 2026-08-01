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

// Editable IST times ("HH:mm", 24h) for the 2 daily slots that are still automatic. Evening research
// and the weekly wrap were deactivated (manual-only, no longer scheduled at all — see scheduler/cron.js);
// Heron's drop tracks 10 minutes after dailyDrop rather than having its own independent time.
const DEFAULT_TIMES = {
  morningResearch: '15:00',   // Raven — was hardcoded 3:00 PM
  dailyDrop: '15:45',         // Quill — was hardcoded 3:45 PM
}
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/

function getStatus() {
  const data = readRaw()
  return {
    enabled: data?.enabled !== false,        // default ON — Raven/Quill's shared schedule
    heronEnabled: data?.heronEnabled === true, // default OFF — new automated spend + Telegram delivery is opt-in
    times: { ...DEFAULT_TIMES, ...(data?.times || {}) },
  }
}

function setEnabled(enabled) { return writeRaw({ enabled: !!enabled }) }
function setHeronEnabled(enabled) { return writeRaw({ heronEnabled: !!enabled }) }

// patch: { morningResearch?, dailyDrop?, eveningResearch? } — "HH:mm" 24h strings. Throws on an
// invalid value so the API layer can turn it into a 400 rather than silently storing garbage.
function setTimes(patch) {
  const current = getStatus().times
  const next = { ...current }
  for (const [key, val] of Object.entries(patch || {})) {
    if (!(key in DEFAULT_TIMES)) continue
    if (!HHMM_RE.test(val)) throw new Error(`Invalid time for ${key}: "${val}" (expected HH:mm, 24h)`)
    next[key] = val
  }
  writeRaw({ times: next })
  return next
}

function isEnabled() { return getStatus().enabled }
function isHeronEnabled() { return getStatus().heronEnabled }
function getTimes() { return getStatus().times }

// Idempotency key for the daily drop — the IST date (YYYY-MM-DD) it last ran, so a scheduled fire and a
// startup catch-up can't both run the same day.
function getLastDrop() { return readRaw().lastDrop || null }
function setLastDrop(ymd) { writeRaw({ lastDrop: ymd }); return ymd }

// Same idempotency-stamp pattern, for Heron's own (independent) schedule.
function getLastHeronRun() { return readRaw().heronLastRun || null }
function setLastHeronRun(ymd) { writeRaw({ heronLastRun: ymd }); return ymd }

module.exports = {
  getStatus, setEnabled, isEnabled, getLastDrop, setLastDrop,
  setHeronEnabled, isHeronEnabled, getLastHeronRun, setLastHeronRun,
  getTimes, setTimes,
}
