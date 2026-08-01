// The daily content drop (posts + reposts + article ideas) in one place, reused by the 3:45 PM cron,
// the /drop command, and the catch-up. All draft-only. Guarantees TODAY's research: if the latest research
// isn't from today (e.g. the laptop was asleep at 3 PM), it runs a fresh search first, then builds the drop.
const quill = require('../agents/quill')
const raven = require('../agents/raven')
const analyst = require('../agents/analyst')
const { readLatest } = require('../state/researchStore')
const { isEnabled, getLastDrop, setLastDrop, getTimes } = require('../state/schedulerStore')

// IST wall-clock helpers (shift UTC by +5:30, then read UTC fields).
function istNow() { return new Date(Date.now() + (5 * 60 + 30) * 60 * 1000) }
function istToday() { return istNow().toISOString().slice(0, 10) }
function istMinutes() { const d = istNow(); return d.getUTCHours() * 60 + d.getUTCMinutes() }
function istDateOf(ts) { return ts ? new Date(new Date(ts).getTime() + (5 * 60 + 30) * 60 * 1000).toISOString().slice(0, 10) : null }

// Reads the user-configured drop time fresh each call (Schedules page can change this without a
// server restart) instead of a fixed constant.
function getDropIstMin() {
  const [h, m] = getTimes().dailyDrop.split(':').map(Number)
  return h * 60 + m
}

// Return today's research, running ONE fresh Raven search if the latest run isn't from today (IST).
async function ensureTodaysResearch({ broadcast = null, telegramSend = null, triggerLabel = '' } = {}) {
  const latest = readLatest()
  if (latest?.results?.length && istDateOf(latest.rankedAt) === istToday()) return latest   // already fresh today — no new search
  console.log('[Drop] No research for today yet — running a fresh Raven search first')
  if (telegramSend) await telegramSend('🔎 No fresh research for today yet — searching now, then building your drop…').catch(() => {})
  try {
    const instructions = analyst.researchInstructions() || null
    return await raven.run({ triggeredBy: 'drop', triggerLabel: (triggerLabel || 'drop') + ' · research', instructions, broadcast })
  } catch (e) { console.warn('[Drop] fresh research failed:', e.message); return latest }   // fall back to whatever we have
}

// Run the full drop now. Records lastDrop on success so a scheduled fire + a catch-up can't double-run.
async function runDailyDrop({ broadcast = null, telegramSend = null, telegramSendDraft = null, telegramSendArticleIdeas = null, triggerLabel = '⏰ Scheduled · 3:45 PM IST' } = {}) {
  const research = await ensureTodaysResearch({ broadcast, telegramSend, triggerLabel })
  if (!research?.results?.length) {
    console.warn('[Drop] skipped — research unavailable')
    if (telegramSend) await telegramSend('⚠️ Drop skipped — research is unavailable right now. Try /research, then /drop.').catch(() => {})
    return { ok: false, reason: 'no-research' }
  }
  // 1) Daily posts (3 buckets × N)
  await quill.runDaily({ research, broadcast, telegramSend, telegramSendDraft, triggerLabel })
  // 2) Value-add quote-reposts (same research — no new search)
  try {
    await quill.runReposts({ research, broadcast, telegramSend, telegramSendDraft, triggerLabel: triggerLabel + ' · reposts' })
  } catch (e) { console.warn('[Drop] reposts failed:', e.message) }
  // 3) Article ideas — tap a number in Telegram to auto-write
  try {
    const ideas = await quill.suggestArticleIdeas({ research, broadcast })
    if (ideas.length && telegramSendArticleIdeas) await telegramSendArticleIdeas(ideas)
    else if (ideas.length && telegramSend) await telegramSend('📝 Article ideas ready — open the dashboard to write one.').catch(() => {})
  } catch (e) { console.warn('[Drop] article ideas failed:', e.message) }

  setLastDrop(istToday())
  return { ok: true }
}

// Startup catch-up: if it's past 3:45 PM IST and today's drop hasn't run, run it once now.
async function maybeCatchUp(opts = {}) {
  try {
    if (!isEnabled()) return { ran: false, reason: 'disabled' }
    if (istMinutes() < getDropIstMin()) return { ran: false, reason: 'before-drop-time' }   // let the scheduled fire handle it
    if (getLastDrop() === istToday()) return { ran: false, reason: 'already-ran' }
    console.log('[Drop] Catching up missed daily drop (past 3:45 PM IST, none yet today)')
    await runDailyDrop({ ...opts, triggerLabel: '⏰ Catch-up drop' })
    return { ran: true }
  } catch (e) { console.warn('[Drop] catch-up failed:', e.message); return { ran: false, reason: 'error' } }
}

module.exports = { runDailyDrop, maybeCatchUp, ensureTodaysResearch, istToday, istMinutes, istDateOf, getDropIstMin }
