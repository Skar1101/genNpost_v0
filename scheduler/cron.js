const cron = require('node-cron')
const chitrag = require('../agents/chitrag')
const titto = require('../agents/titto')
const quill = require('../agents/quill')
const analyst = require('../agents/analyst')
const { readLatest } = require('../state/researchStore')
const { isEnabled } = require('../state/schedulerStore')

function initScheduler(broadcast, telegramSend, telegramSendDraft = null) {
  // 3:00pm IST = 09:30 UTC — research + briefing
  cron.schedule('30 9 * * *', () => runMorning(broadcast, telegramSend), { timezone: 'UTC' })

  // 3:45pm IST = 10:15 UTC — Quill daily batch (reads the afternoon research)
  cron.schedule('15 10 * * *', () => runBatch(broadcast, telegramSend, telegramSendDraft), { timezone: 'UTC' })

  // 6:00pm IST = 12:30 UTC daily — fresh research
  cron.schedule('30 12 * * *', () => runEvening(broadcast, telegramSend), { timezone: 'UTC' })

  // Sunday 6:00am IST = 01:00 UTC Sunday — weekly wrap
  cron.schedule('0 1 * * 0', () => runWeekly(broadcast, telegramSend), { timezone: 'UTC' })

  console.log('[Scheduler] Cron jobs initialized — 3:00pm research, 3:45pm batch, 6pm research, Sunday weekly')
}

async function runMorning(broadcast, telegramSend) {
  if (!isEnabled()) { console.log('[Scheduler] Morning run SKIPPED — auto-runs disabled'); return }
  console.log('[Scheduler] Starting afternoon research run (3:00pm IST)')
  try {
    const instructions = analyst.learnedInstructions() || null   // bias ranking toward what's landed
    const results = await chitrag.run({ triggeredBy: 'scheduler', triggerLabel: '⏰ Scheduled · 3:00 PM IST', instructions, broadcast })
    if (results) {
      await titto.deliverResearch(results, telegramSend, broadcast)
      console.log(`[Scheduler] Morning briefing delivered — ${results.results?.length} results`)
    }
  } catch (err) {
    console.error('[Scheduler] Morning run failed:', err.message)
    if (telegramSend) telegramSend(`⚠️ Morning run failed: ${err.message}`).catch(() => {})
  }
}

async function runBatch(broadcast, telegramSend, telegramSendDraft = null) {
  if (!isEnabled()) { console.log('[Scheduler] Batch run SKIPPED — auto-runs disabled'); return }
  console.log('[Scheduler] Starting Quill daily batch (3:45pm IST)')
  try {
    const research = readLatest()
    if (!research?.results?.length) {
      console.warn('[Scheduler] Batch skipped — no research available yet')
      if (telegramSend) telegramSend('⚠️ Batch skipped — morning research not ready.').catch(() => {})
      return
    }
    await quill.runDaily({ research, broadcast, telegramSend, telegramSendDraft, triggerLabel: '⏰ Scheduled · 3:45 PM IST' })
  } catch (err) {
    console.error('[Scheduler] Batch run failed:', err.message)
    if (telegramSend) telegramSend(`⚠️ Batch failed: ${err.message}`).catch(() => {})
  }
}

async function runEvening(broadcast, telegramSend) {
  if (!isEnabled()) { console.log('[Scheduler] Evening run SKIPPED — auto-runs disabled'); return }
  console.log('[Scheduler] Starting evening research run (6pm IST)')
  try {
    const instructions = analyst.learnedInstructions() || null   // bias ranking toward what's landed
    const results = await chitrag.run({ triggeredBy: 'scheduler', triggerLabel: '⏰ Scheduled · 6:00 PM IST', instructions, broadcast })
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
