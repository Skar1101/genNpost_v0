// Posting slots. Times are IST wall-clock strings ("09:00"); everything downstream works in real
// ISO instants, so the conversion happens here once rather than being re-derived per caller.
//
// The asset itself owns `scheduledFor` (state/assetsStore.js) — this store owns the GRID: which
// times of day are slots, and which of them are free. That split means dragging an asset to an
// arbitrary time works fine; the grid is a convenience, not a constraint.
const fs = require('fs')
const path = require('path')
const assetsStore = require('./assetsStore')

const DATA_DIR = path.join(__dirname, 'data')
const FILE = path.join(DATA_DIR, 'slots.json')

const DEFAULT_SLOTS = ['09:00', '13:00', '17:30', '21:00']
const IST_OFFSET_MIN = 5 * 60 + 30

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

function readRaw() {
  try { if (fs.existsSync(FILE)) return JSON.parse(fs.readFileSync(FILE, 'utf8')) || {} } catch (_) { /* ignore */ }
  return {}
}
function writeRaw(patch) {
  ensureDir()
  const next = { ...readRaw(), ...patch, updatedAt: new Date().toISOString() }
  const tmp = FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2))
  fs.renameSync(tmp, FILE)
  return next
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/

function getSlots() {
  const saved = readRaw().slots
  if (!Array.isArray(saved) || !saved.length) return DEFAULT_SLOTS
  const valid = saved.filter(s => HHMM.test(String(s)))
  return valid.length ? [...new Set(valid)].sort() : DEFAULT_SLOTS
}

function setSlots(list) {
  const valid = (Array.isArray(list) ? list : []).map(String).filter(s => HHMM.test(s))
  if (!valid.length) throw new Error('Provide at least one slot time as "HH:mm"')
  writeRaw({ slots: [...new Set(valid)].sort() })
  return getSlots()
}

// ── IST ↔ UTC ────────────────────────────────────────────────────────────────
// An IST calendar date + wall-clock time is a single real instant. Building it by hand (rather than
// via a timezone library) keeps this dependency-free and matches how scheduler/cron.js already does
// its IST maths.
function istDateTimeToISO(ymd, hhmm) {
  const [y, mo, d] = String(ymd).split('-').map(Number)
  const [h, mi] = String(hhmm).split(':').map(Number)
  return new Date(Date.UTC(y, mo - 1, d, h, mi) - IST_OFFSET_MIN * 60 * 1000).toISOString()
}

function istNow() { return new Date(Date.now() + IST_OFFSET_MIN * 60 * 1000) }
function istToday() { return istNow().toISOString().slice(0, 10) }

// The IST calendar date an instant falls on.
function istDateOf(iso) {
  return new Date(new Date(iso).getTime() + IST_OFFSET_MIN * 60 * 1000).toISOString().slice(0, 10)
}
function istTimeOf(iso) {
  return new Date(new Date(iso).getTime() + IST_OFFSET_MIN * 60 * 1000).toISOString().slice(11, 16)
}

function addDaysIST(ymd, n) {
  const [y, mo, d] = String(ymd).split('-').map(Number)
  const dt = new Date(Date.UTC(y, mo - 1, d))
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().slice(0, 10)
}

/**
 * The calendar grid: `days` IST days starting at `startYmd`, as HOUR rows — the way a normal
 * calendar works.
 *
 * It used to render only four fixed slot times, which meant a post could sit at 13:00 or 17:30 and
 * nowhere in between, one platform's post blocked the same cell for every other platform, and
 * anything at a custom time fell off the grid into a separate list. Hours fix all three: every
 * instant belongs in exactly one bucket, and a bucket holds as many posts as you put in it.
 *
 * `fromHour`/`toHour` just bound what's DRAWN. Anything scheduled outside that window still comes
 * back — the window widens to include it rather than hiding it.
 */
function grid(account, { startYmd = null, days = 7, fromHour = 6, toHour = 23 } = {}) {
  const start = startYmd || istToday()
  const booked = assetsStore.scheduled(account)
  const endYmd = addDaysIST(start, days - 1)

  // Everything scheduled inside the visible date range, bucketed by the hour it falls in.
  const inRange = booked.filter(a => {
    const d = istDateOf(a.scheduledFor)
    return d >= start && d <= endYmd
  })

  const byBucket = {}
  for (const a of inRange) {
    const key = `${istDateOf(a.scheduledFor)} ${istTimeOf(a.scheduledFor).slice(0, 2)}`
    ;(byBucket[key] ||= []).push(a)
  }

  // Never hide a post just because it sits outside the default window.
  let lo = Math.max(0, Math.min(23, fromHour))
  let hi = Math.max(0, Math.min(23, toHour))
  for (const a of inRange) {
    const h = Number(istTimeOf(a.scheduledFor).slice(0, 2))
    if (h < lo) lo = h
    if (h > hi) hi = h
  }

  const hours = []
  for (let h = lo; h <= hi; h++) hours.push(String(h).padStart(2, '0') + ':00')

  const now = new Date()
  const out = []
  for (let i = 0; i < days; i++) {
    const ymd = addDaysIST(start, i)
    const cells = hours.map(hhmm => {
      const iso = istDateTimeToISO(ymd, hhmm)
      const here = (byBucket[`${ymd} ${hhmm.slice(0, 2)}`] || [])
        .sort((x, y) => new Date(x.scheduledFor) - new Date(y.scheduledFor))
      return {
        iso,
        time: hhmm,
        // `asset` is kept for older callers; `assets` is the real answer — a bucket holds any number.
        asset: here.length ? summarize(here[0]) : null,
        assets: here.map(summarize),
        past: new Date(iso) < now,
      }
    })
    out.push({ date: ymd, cells })
  }

  // Kept for API shape compatibility. Nothing can be off-grid now: every instant lands in an hour.
  return { start, days, slots: hours, hours, grid: out, offGrid: [] }
}

function summarize(a) {
  return {
    id: a.id, title: a.title, platform: a.platform, state: a.state, origin: a.origin,
    segments: a.segments.length, imageId: a.segments?.[0]?.imageId || null,
    scheduledFor: a.scheduledFor,
  }
}

// The next slot in the future with nothing in it. Used when something is approved and just needs
// to go out "next".
function nextFreeSlot(account, { fromIso = null, horizonDays = 14 } = {}) {
  const from = fromIso ? new Date(fromIso) : new Date()
  const taken = new Set(assetsStore.scheduled(account).map(a => a.scheduledFor))
  let ymd = istDateOf(from.toISOString())
  for (let i = 0; i < horizonDays; i++) {
    for (const hhmm of getSlots()) {
      const iso = istDateTimeToISO(ymd, hhmm)
      if (new Date(iso) > from && !taken.has(iso)) return iso
    }
    ymd = addDaysIST(ymd, 1)
  }
  return null
}

module.exports = {
  getSlots, setSlots, grid, nextFreeSlot,
  istDateTimeToISO, istDateOf, istTimeOf, istToday, addDaysIST, DEFAULT_SLOTS,
}
