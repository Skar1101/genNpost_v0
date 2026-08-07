// Parrot's own scheduled drop — LinkedIn topic generation, independent of Quill/Heron's schedules
// (own toggle, own idempotency stamp, own directly-editable time — mirrors Quill's dailyDrop pattern,
// not Heron's derived-offset one, per the explicit "auto-scheduling like Quill" ask). Generation and
// auto-posting stay two distinct moments: this only ever WRITES drafts and delivers them to Telegram
// with Approve/Reject/Edit buttons — the real LinkedIn post only happens when a human taps Approve
// (agents/parrot.js's postApprovedDraft(), wired into parrotTelegram.js and the web Queue).
const parrot = require('../agents/parrot')
const dailyDrop = require('./dailyDrop')
const contentVolume = require('../config/contentVolume')
const linkedinAuth = require('../utils/linkedinAuth')
const { isParrotEnabled, getLastParrotRun, setLastParrotRun, getTimes } = require('../state/schedulerStore')

const { istToday, istMinutes } = dailyDrop

// Reads Parrot's configured linkedinDrop time fresh each call (own slot, not derived from Quill/Heron).
function getParrotIstMin() {
  const [h, m] = getTimes().linkedinDrop.split(':').map(Number)
  return h * 60 + m
}

// Run Parrot's drop now. Records parrotLastRun on success so a scheduled fire + a catch-up can't double-run.
async function runParrotDrop({ broadcast = null, telegramSend = null, telegramSendDraft = null, triggerLabel = '⏰ Scheduled · Parrot' } = {}) {
  const research = await dailyDrop.ensureTodaysResearch({ broadcast, telegramSend, triggerLabel })
  if (!research?.results?.length) {
    console.warn('[ParrotDrop] skipped — research unavailable')
    return { ok: false, reason: 'no-research' }
  }

  // Content generation doesn't need a LinkedIn connection — drafts still land in the queue either way.
  // But warn early (not just at the moment a post fails) if the token is missing or expiring soon.
  const status = linkedinAuth.tokenStatus({ warnDays: 7 })
  if (telegramSend && (!status.connected || !status.valid)) {
    await telegramSend('⚠️ LinkedIn isn\'t connected — Parrot will keep drafting, but Approve won\'t be able to post until you connect it (/api/parrot/oauth/start).').catch(() => {})
  } else if (telegramSend && status.expiringSoon) {
    await telegramSend(`⚠️ Your LinkedIn connection expires in ~${status.daysLeft} day(s) — reconnect soon at /api/parrot/oauth/start so Approve keeps working.`).catch(() => {})
  }

  const n = contentVolume.linkedinPosts.count
  const topics = await parrot.assignDailyTopics({ count: n })

  const batch = []
  for (const { topic } of topics) {
    try {
      const result = await parrot.writePost({ topic, count: 1, triggerLabel })
      const rec = result.draftRecords?.[0]
      if (rec) batch.push({ id: rec.id, text: result.drafts[0] })
    } catch (e) { console.warn('[ParrotDrop] post write failed:', e.message) }
  }
  if (telegramSendDraft && batch.length) {
    await telegramSendDraft(batch, { header: `🦜 LinkedIn post${batch.length > 1 ? 's' : ''} — ${batch.length} draft${batch.length > 1 ? 's' : ''} (Approve posts immediately)` })
  }

  setLastParrotRun(istToday())
  return { ok: true, posts: batch.length }
}

// Startup catch-up: if it's past Parrot's slot and today's drop hasn't run, run it once now
// (mirrors dailyDrop.maybeCatchUp's exact shape).
async function maybeCatchUp(opts = {}) {
  try {
    if (!isParrotEnabled()) return { ran: false, reason: 'disabled' }
    if (istMinutes() < getParrotIstMin()) return { ran: false, reason: 'before-slot-time' }
    if (getLastParrotRun() === istToday()) return { ran: false, reason: 'already-ran' }
    console.log('[ParrotDrop] Catching up missed drop (past Parrot\'s slot, none yet today)')
    await runParrotDrop({ ...opts, triggerLabel: '⏰ Catch-up · Parrot' })
    return { ran: true }
  } catch (e) { console.warn('[ParrotDrop] catch-up failed:', e.message); return { ran: false, reason: 'error' } }
}

module.exports = { runParrotDrop, maybeCatchUp, getParrotIstMin }
