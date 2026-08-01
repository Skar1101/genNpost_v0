// Heron's own scheduled drop (4 short Notes + 2 mid-posts, spanning self-help/achievement/AI-updates),
// independent of Quill's daily drop — own toggle, own idempotency stamp. No article in the automated
// drop (article-writing stays available on-demand on the Heron page). Mirrors scheduler/dailyDrop.js's
// shape, reusing its `ensureTodaysResearch()` so Heron never runs a redundant fresh search when Raven
// already ran earlier the same day. Timing: runs exactly 10 minutes after Quill's dailyDrop time
// (tracks it — change dailyDrop in Schedules and Heron's slot follows automatically), not an
// independent time.
const heron = require('../agents/heron')
const dailyDrop = require('./dailyDrop')
const { isHeronEnabled, getLastHeronRun, setLastHeronRun, getTimes } = require('../state/schedulerStore')

const { istToday, istMinutes } = dailyDrop

// Reads Quill's configured dailyDrop time fresh each call and adds 10 minutes — matches
// scheduler/cron.js's own dailyDrop+10 cron computation, so the cron fire and this catch-up check
// never disagree about when "Heron's slot" actually is.
function getHeronIstMin() {
  const [h, m] = getTimes().dailyDrop.split(':').map(Number)
  return h * 60 + m + 10
}

// Run Heron's drop now. Records heronLastRun on success so a scheduled fire + a catch-up can't double-run.
async function runHeronDrop({ broadcast = null, telegramSend = null, telegramSendDraft = null, triggerLabel = '⏰ Scheduled · Heron' } = {}) {
  const research = await dailyDrop.ensureTodaysResearch({ broadcast, telegramSend, triggerLabel })
  if (!research?.results?.length) {
    console.warn('[HeronDrop] skipped — research unavailable')
    return { ok: false, reason: 'no-research' }
  }

  const assignments = await heron.assignDailyTopics()

  // 4 short (Note-length) posts — each a distinct topic, so one koel.write() call per topic. Batched
  // into a single Telegram message (one header, all drafts) rather than sending per-topic, matching
  // Quill's daily-batch delivery style.
  const shortBatch = []
  for (const { topic } of assignments.short) {
    try {
      const result = await heron.writeNote({ topic, count: 1, triggerLabel: triggerLabel + ' · notes' })
      const rec = result.draftRecords?.[0]
      if (rec) shortBatch.push({ id: rec.id, text: result.drafts[0] })
    } catch (e) { console.warn('[HeronDrop] note write failed:', e.message) }
  }
  if (telegramSendDraft && shortBatch.length) {
    await telegramSendDraft(shortBatch, { header: `🦢 Substack Notes — ${shortBatch.length} drafts` })
  }

  // 2 mid-posts (~100 words each), same per-topic + batched-send pattern.
  const midBatch = []
  for (const { topic } of assignments.mid) {
    try {
      const result = await heron.writeMidPost({ topic, count: 1, triggerLabel: triggerLabel + ' · mid' })
      const rec = result.draftRecords?.[0]
      if (rec) midBatch.push({ id: rec.id, text: result.drafts[0] })
    } catch (e) { console.warn('[HeronDrop] mid-post write failed:', e.message) }
  }
  if (telegramSendDraft && midBatch.length) {
    await telegramSendDraft(midBatch, { header: `🦢 Substack mid-posts — ${midBatch.length} drafts` })
  }

  setLastHeronRun(istToday())
  return { ok: true, notes: shortBatch.length, midPosts: midBatch.length }
}

// Startup catch-up: if it's past Heron's slot and today's drop hasn't run, run it once now
// (mirrors dailyDrop.maybeCatchUp's exact shape). Runs every day now (was Tue/Fri only).
async function maybeCatchUp(opts = {}) {
  try {
    if (!isHeronEnabled()) return { ran: false, reason: 'disabled' }
    if (istMinutes() < getHeronIstMin()) return { ran: false, reason: 'before-slot-time' }
    if (getLastHeronRun() === istToday()) return { ran: false, reason: 'already-ran' }
    console.log('[HeronDrop] Catching up missed drop (past Heron\'s slot, none yet today)')
    await runHeronDrop({ ...opts, triggerLabel: '⏰ Catch-up · Heron' })
    return { ran: true }
  } catch (e) { console.warn('[HeronDrop] catch-up failed:', e.message); return { ran: false, reason: 'error' } }
}

module.exports = { runHeronDrop, maybeCatchUp, getHeronIstMin }
