const cron = require('node-cron')
const raven = require('../agents/raven')
const titto = require('../agents/titto')
const analyst = require('../agents/analyst')
const quill = require('../agents/quill')
const dailyDrop = require('./dailyDrop')
const { isEnabled, getLastDrop } = require('../state/schedulerStore')

function initScheduler(broadcast, telegramSend, telegramSendDraft = null, telegramSendArticleIdeas = null) {
  // 3:00pm IST = 09:30 UTC — research + briefing
  cron.schedule('30 9 * * *', () => runMorning(broadcast, telegramSend), { timezone: 'UTC' })

  // 3:45pm IST = 10:15 UTC — Quill daily drop: posts + reposts + article ideas (reads the 3pm research)
  cron.schedule('15 10 * * *', () => runBatch(broadcast, telegramSend, telegramSendDraft, telegramSendArticleIdeas), { timezone: 'UTC' })

  // 6:00pm IST = 12:30 UTC daily — fresh research
  cron.schedule('30 12 * * *', () => runEvening(broadcast, telegramSend), { timezone: 'UTC' })

  // Sunday 6:00am IST = 01:00 UTC Sunday — weekly wrap
  cron.schedule('0 1 * * 0', () => runWeekly(broadcast, telegramSend), { timezone: 'UTC' })

  const istHm = String(Math.floor(dailyDrop.istMinutes() / 60)).padStart(2, '0') + ':' + String(dailyDrop.istMinutes() % 60).padStart(2, '0')
  console.log('[Scheduler] Cron jobs armed — research 3:00 PM & 6:00 PM IST · drop 3:45 PM IST · weekly Sun 6 AM IST')
  console.log(`[Scheduler] IST now ${istHm} · auto-runs ${isEnabled() ? 'ON' : 'OFF'} · last drop: ${getLastDrop() || 'never'}`)

  // Catch up a missed drop. Runs at most once/day (guarded by lastDrop). Two triggers:
  //   - shortly after startup (server restarted after 3:45 PM IST), and
  //   - every 30 min (laptop woke after 3:45 PM with the server still running → auto-delivers).
  const catchUp = (why) => dailyDrop.maybeCatchUp({ broadcast, telegramSend, telegramSendDraft, telegramSendArticleIdeas })
    .then(r => { if (r && r.ran) console.log(`[Scheduler] Catch-up drop completed (${why})`) })
    .catch(() => {})
  setTimeout(() => catchUp('startup'), 8000)
  setInterval(() => catchUp('periodic'), 30 * 60 * 1000)
}

async function runMorning(broadcast, telegramSend) {
  if (!isEnabled()) { console.log('[Scheduler] Morning run SKIPPED — auto-runs disabled'); return }
  console.log('[Scheduler] Starting afternoon research run (3:00pm IST)')
  try {
    const instructions = analyst.researchInstructions() || null   // profile niche (+ /focus override) + what's landed
    const results = await raven.run({ triggeredBy: 'scheduler', triggerLabel: '⏰ Scheduled · 3:00 PM IST', instructions, broadcast })
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
  console.log('[Scheduler] Starting daily drop (3:45pm IST)')
  try {
    await dailyDrop.runDailyDrop({ broadcast, telegramSend, telegramSendDraft, telegramSendArticleIdeas, triggerLabel: '⏰ Scheduled · 3:45 PM IST' })
  } catch (err) {
    console.error('[Scheduler] Drop failed:', err.message)
    if (telegramSend) telegramSend(`⚠️ Daily drop failed: ${err.message}`).catch(() => {})
  }
}

async function runEvening(broadcast, telegramSend) {
  if (!isEnabled()) { console.log('[Scheduler] Evening run SKIPPED — auto-runs disabled'); return }
  console.log('[Scheduler] Starting evening research run (6pm IST)')
  try {
    const instructions = analyst.researchInstructions() || null   // profile niche (+ /focus override) + what's landed
    const results = await raven.run({ triggeredBy: 'scheduler', triggerLabel: '⏰ Scheduled · 6:00 PM IST', instructions, broadcast })
    if (results) {
      await titto.deliverResearch(results, telegramSend, broadcast)
      console.log(`[Scheduler] Evening research delivered — ${results.results?.length} results`)
    }
  } catch (err) {
    console.error('[Scheduler] Evening run failed:', err.message)
    if (telegramSend) telegramSend(`⚠️ Evening run failed: ${err.message}`).catch(() => {})
  }
}

async function runWeekly(broadcast, telegramSend) {
  if (!isEnabled()) { console.log('[Scheduler] Weekly run SKIPPED — auto-runs disabled'); return }
  console.log('[Scheduler] Starting weekly wrap (Sunday)')
  try {
    await quill.runWeekly({ broadcast, telegramSend, triggerLabel: '⏰ Scheduled · Sun 6 AM IST' })
    // Refresh learned insights from the week's approvals/rejections + any pasted performance,
    // then nudge Souvik to feed this week's numbers so the loop keeps sharpening.
    try { await analyst.analyze({ broadcast }) } catch (e) { console.warn('[Scheduler] weekly analyze failed:', e.message) }
    if (telegramSend) {
      await telegramSend('📊 *Weekly performance loop*\nPaste your top 3 and bottom 3 tweets from this week (text + impressions/likes/replies) with:\n`/perf <paste here>`\nThen run `/learned` to see what I picked up.').catch(() => {})
    }
    console.log('[Scheduler] Weekly wrap complete')
  } catch (err) {
    console.error('[Scheduler] Weekly run failed:', err.message)
    if (telegramSend) telegramSend(`⚠️ Weekly wrap failed: ${err.message}`).catch(() => {})
  }
}

module.exports = { initScheduler }
