// Heron's own scheduled drop (topic search + one article + a couple of Notes), independent of
// Quill's daily drop — own toggle, own idempotency stamp. Mirrors scheduler/dailyDrop.js's shape,
// reusing its `ensureTodaysResearch()` so Heron never runs a redundant fresh search when Raven already
// ran earlier the same day. Timing: runs exactly 10 minutes after Quill's dailyDrop time (tracks it —
// change dailyDrop in Schedules and Heron's slot follows automatically), not an independent time.
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

  const topics = await heron.searchTopics({ broadcast, triggerLabel })
  if (!topics?.topics?.length) {
    console.warn('[HeronDrop] skipped — no long-form-worthy topics in today\'s research')
    return { ok: false, reason: 'no-topics' }
  }

  try {
    await heron.writeArticle({ idx: 0, broadcast, telegramSendDraft, triggerLabel })
  } catch (e) { console.warn('[HeronDrop] article write failed:', e.message) }

  try {
    const pillarTopic = topics.topics[0]?.title || 'something worth a quick take, in your own words'
    await heron.writeNote({ topic: pillarTopic, count: 2, broadcast, telegramSendDraft, triggerLabel: triggerLabel + ' · notes' })
  } catch (e) { console.warn('[HeronDrop] note write failed:', e.message) }

  setLastHeronRun(istToday())
  return { ok: true }
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
