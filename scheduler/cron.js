const cron = require('node-cron')
const chitrag = require('../agents/chitrag')
const titto = require('../agents/titto')
const quill = require('../agents/quill')
const { isEnabled } = require('../state/schedulerStore')

function initScheduler(broadcast, telegramSend) {
  // 6:00am IST = 00:30 UTC daily
  cron.schedule('30 0 * * *', () => runMorning(broadcast, telegramSend), { timezone: 'UTC' })

  // 6:00pm IST = 12:30 UTC daily
  cron.schedule('30 12 * * *', () => runEvening(broadcast, telegramSend), { timezone: 'UTC' })

  // Sunday 6:00am IST = 00:30 UTC Sunday (runs after daily morning)
  cron.schedule('0 1 * * 0', () => runWeekly(broadcast, telegramSend), { timezone: 'UTC' })

  console.log('[Scheduler] Cron jobs initialized — 6am IST + 6pm IST daily, Sunday weekly wrap')
}

async function runMorning(broadcast, telegramSend) {
  if (!isEnabled()) { console.log('[Scheduler] Morning run SKIPPED — auto-runs disabled'); return }
  console.log('[Scheduler] Starting morning research run (6am IST)')
  try {
    const results = await chitrag.run({ triggeredBy: 'scheduler', triggerLabel: '⏰ Scheduled · 6:00 AM IST', broadcast })
    if (results) {
      await titto.deliverResearch(results, telegramSend, broadcast)
      console.log(`[Scheduler] Morning research delivered — ${results.results?.length} results`)

      // Quill runs after research is delivered
      await quill.runDaily({ research: results, broadcast, telegramSend })
    }
  } catch (err) {
    console.error('[Scheduler] Morning run failed:', err.message)
    if (telegramSend) telegramSend(`⚠️ Morning run failed: ${err.message}`).catch(() => {})
  }
}

async function runEvening(broadcast, telegramSend) {
  if (!isEnabled()) { console.log('[Scheduler] Evening run SKIPPED — auto-runs disabled'); return }
  console.log('[Scheduler] Starting evening research run (6pm IST)')
  try {
    const results = await chitrag.run({ triggeredBy: 'scheduler', triggerLabel: '⏰ Scheduled · 6:00 PM IST', broadcast })
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
    await quill.runWeekly({ broadcast, telegramSend })
    console.log('[Scheduler] Weekly wrap complete')
  } catch (err) {
    console.error('[Scheduler] Weekly run failed:', err.message)
    if (telegramSend) telegramSend(`⚠️ Weekly wrap failed: ${err.message}`).catch(() => {})
  }
}

module.exports = { initScheduler }
