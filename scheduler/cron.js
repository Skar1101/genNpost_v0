const cron = require('node-cron')
const raven = require('../agents/raven')
const titto = require('../agents/titto')
const analyst = require('../agents/analyst')
const dailyDrop = require('./dailyDrop')
const heronDrop = require('./heronDrop')
const parrotDrop = require('./parrotDrop')
const { isEnabled, getLastDrop, isHeronEnabled, getLastHeronRun, isParrotEnabled, getLastParrotRun, getTimes } = require('../state/schedulerStore')

// IST "HH:mm" -> a UTC node-cron expression ("m h * * *"), correctly rolling the UTC day back one
// when the IST time falls before 05:30 (i.e. subtracting the 5:30 offset crosses midnight).
function istTimeToUtcCron(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  const istTotalMin = h * 60 + m
  const utcTotalMin = ((istTotalMin - 330) % 1440 + 1440) % 1440
  const utcH = Math.floor(utcTotalMin / 60)
  const utcM = utcTotalMin % 60
  return `${utcM} ${utcH} * * *`
}

// "HH:mm" + N minutes -> "HH:mm", wrapping past midnight if needed.
function addMinutesToHHMM(hhmm, minutes) {
  const [h, m] = hhmm.split(':').map(Number)
  const total = ((h * 60 + m + minutes) % 1440 + 1440) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

// Dynamically-timed jobs keep their live node-cron ScheduledTask references here so a time change
// can stop + re-create just these. Morning research and the daily drop are directly user-editable
// (Schedules page); Heron tracks 10 minutes after the daily drop rather than having its own time —
// change dailyDrop and Heron's slot follows automatically on the next reschedule.
// Weekly wrap and evening research are deactivated (manual-only, see runWeekly/analyst.researchInstructions
// usage moved into agents/quill.js and the existing /research trigger route) — no longer scheduled at all.
const dynamicTasks = {}
let _ctx = null   // closure args captured at initScheduler() time, reused by rescheduleDynamic()

function registerDynamicJobs() {
  for (const task of Object.values(dynamicTasks)) task?.stop()
  const times = getTimes()
  const { broadcast, telegramSend, telegramSendDraft, telegramSendArticleIdeas, telegramSendHeronDraft, telegramSendParrotDraft } = _ctx
  dynamicTasks.morningResearch = cron.schedule(istTimeToUtcCron(times.morningResearch), () => runMorning(broadcast, telegramSend), { timezone: 'UTC' })
  dynamicTasks.dailyDrop = cron.schedule(istTimeToUtcCron(times.dailyDrop), () => runBatch(broadcast, telegramSend, telegramSendDraft, telegramSendArticleIdeas), { timezone: 'UTC' })
  const heronTime = addMinutesToHHMM(times.dailyDrop, 10)
  dynamicTasks.heronDrop = cron.schedule(istTimeToUtcCron(heronTime), () => runHeronBatch(broadcast, telegramSend, telegramSendHeronDraft), { timezone: 'UTC' })
  dynamicTasks.linkedinDrop = cron.schedule(istTimeToUtcCron(times.linkedinDrop), () => runParrotBatch(broadcast, telegramSend, telegramSendParrotDraft), { timezone: 'UTC' })
  console.log(`[Scheduler] Daily jobs (re)armed — research ${times.morningResearch} IST · drop ${times.dailyDrop} IST · Heron ${heronTime} IST (10 min after drop) · Parrot ${times.linkedinDrop} IST`)
}

// Called by PUT /api/scheduler after a time change — stops and re-creates the dynamic cron tasks
// with the new times (Heron's recomputed too, since it tracks dailyDrop). No server restart needed.
function rescheduleDynamic() {
  if (!_ctx) return   // Telegram/scheduler never initialized (shouldn't happen once the server is up)
  registerDynamicJobs()
}

function initScheduler(broadcast, telegramSend, telegramSendDraft = null, telegramSendArticleIdeas = null, telegramSendHeronDraft = null, telegramSendParrotDraft = null) {
  _ctx = { broadcast, telegramSend, telegramSendDraft, telegramSendArticleIdeas, telegramSendHeronDraft, telegramSendParrotDraft }
  registerDynamicJobs()

  const istHm = String(Math.floor(dailyDrop.istMinutes() / 60)).padStart(2, '0') + ':' + String(dailyDrop.istMinutes() % 60).padStart(2, '0')
  console.log('[Scheduler] Weekly wrap + evening research are deactivated — manual only (/perf, /research, or the dashboard)')
  console.log(`[Scheduler] IST now ${istHm} · auto-runs ${isEnabled() ? 'ON' : 'OFF'} · last drop: ${getLastDrop() || 'never'} · Heron auto-runs ${isHeronEnabled() ? 'ON' : 'OFF'} · last Heron run: ${getLastHeronRun() || 'never'} · Parrot auto-runs ${isParrotEnabled() ? 'ON' : 'OFF'} · last Parrot run: ${getLastParrotRun() || 'never'}`)

  // Catch up a missed drop. Runs at most once/day (guarded by lastDrop). Two triggers:
  //   - shortly after startup (server restarted after drop time), and
  //   - every 30 min (laptop woke after drop time with the server still running → auto-delivers).
  const catchUp = (why) => dailyDrop.maybeCatchUp({ broadcast, telegramSend, telegramSendDraft, telegramSendArticleIdeas })
    .then(r => { if (r && r.ran) console.log(`[Scheduler] Catch-up drop completed (${why})`) })
    .catch(() => {})
  const heronCatchUp = (why) => heronDrop.maybeCatchUp({ broadcast, telegramSend, telegramSendDraft: telegramSendHeronDraft })
    .then(r => { if (r && r.ran) console.log(`[Scheduler] Catch-up Heron drop completed (${why})`) })
    .catch(() => {})
  const parrotCatchUp = (why) => parrotDrop.maybeCatchUp({ broadcast, telegramSend, telegramSendDraft: telegramSendParrotDraft })
    .then(r => { if (r && r.ran) console.log(`[Scheduler] Catch-up Parrot drop completed (${why})`) })
    .catch(() => {})
  setTimeout(() => { catchUp('startup'); heronCatchUp('startup'); parrotCatchUp('startup') }, 8000)
  setInterval(() => { catchUp('periodic'); heronCatchUp('periodic'); parrotCatchUp('periodic') }, 30 * 60 * 1000)
}

async function runHeronBatch(broadcast, telegramSend, telegramSendHeronDraft) {
  if (!isHeronEnabled()) { console.log('[Scheduler] Heron drop SKIPPED — Heron auto-runs disabled'); return }
  const t = addMinutesToHHMM(getTimes().dailyDrop, 10)
  console.log(`[Scheduler] Starting Heron drop (${t} IST)`)
  try {
    await heronDrop.runHeronDrop({ broadcast, telegramSend, telegramSendDraft: telegramSendHeronDraft, triggerLabel: `⏰ Scheduled · Heron ${t} IST` })
  } catch (err) {
    console.error('[Scheduler] Heron drop failed:', err.message)
  }
}

async function runParrotBatch(broadcast, telegramSend, telegramSendParrotDraft) {
  if (!isParrotEnabled()) { console.log('[Scheduler] Parrot drop SKIPPED — Parrot auto-runs disabled'); return }
  const t = getTimes().linkedinDrop
  console.log(`[Scheduler] Starting Parrot drop (${t} IST)`)
  try {
    await parrotDrop.runParrotDrop({ broadcast, telegramSend, telegramSendDraft: telegramSendParrotDraft, triggerLabel: `⏰ Scheduled · Parrot ${t} IST` })
  } catch (err) {
    console.error('[Scheduler] Parrot drop failed:', err.message)
  }
}

async function runMorning(broadcast, telegramSend) {
  if (!isEnabled()) { console.log('[Scheduler] Morning run SKIPPED — auto-runs disabled'); return }
  const t = getTimes().morningResearch
  console.log(`[Scheduler] Starting afternoon research run (${t} IST)`)
  try {
    const instructions = analyst.researchInstructions() || null   // profile niche (+ /focus override) + what's landed
    const results = await raven.run({ triggeredBy: 'scheduler', triggerLabel: `⏰ Scheduled · ${t} IST`, instructions, broadcast })
    if (results) {
      await titto.deliverResearch(results, telegramSend, broadcast)
      console.log(`[Scheduler] Morning briefing delivered — ${results.results?.length} results`)
    }
  } catch (err) {
    console.error('[Scheduler] Morning run failed:', err.message)
    if (telegramSend) telegramSend(`⚠️ Morning run failed: ${err.message}`).catch(() => {})
  }
}

async function runBatch(broadcast, telegramSend, telegramSendDraft = null, telegramSendArticleIdeas = null) {
  if (!isEnabled()) { console.log('[Scheduler] Drop SKIPPED — auto-runs disabled'); return }
  const t = getTimes().dailyDrop
  console.log(`[Scheduler] Starting daily drop (${t} IST)`)
  try {
    await dailyDrop.runDailyDrop({ broadcast, telegramSend, telegramSendDraft, telegramSendArticleIdeas, triggerLabel: `⏰ Scheduled · ${t} IST` })
  } catch (err) {
    console.error('[Scheduler] Drop failed:', err.message)
    if (telegramSend) telegramSend(`⚠️ Daily drop failed: ${err.message}`).catch(() => {})
  }
}

// Evening research + the weekly wrap are deactivated as automatic schedules (deliberately — user
// call). Both stay manually triggerable exactly as before: evening-equivalent research via the
// existing `/research` command / `POST /api/research/trigger`, and the full weekly wrap (now
// including the analyst.analyze() + perf-nudge follow-up, moved into agents/quill.js's runWeekly()
// itself so the existing `POST /api/quill/weekly` route gets the complete behavior too) via
// `quill.runWeekly()` directly.

module.exports = { initScheduler, rescheduleDynamic }
