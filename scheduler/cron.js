const cron = require('node-cron')
const chitrag = require('../agents/chitrag')
const titto = require('../agents/titto')

function initScheduler(broadcast, telegramSend) {
  // 6:00 AM daily
  cron.schedule('0 6 * * *', () => runScheduled('morning', broadcast, telegramSend))

  // 6:00 PM daily
  cron.schedule('0 18 * * *', () => runScheduled('evening', broadcast, telegramSend))

  console.log('[Scheduler] Cron jobs initialized — 6am + 6pm daily')
}

async function runScheduled(label, broadcast, telegramSend) {
  console.log(`[Scheduler] Starting ${label} research run`)
  try {
    const results = await chitrag.run({ triggeredBy: 'scheduler', broadcast })
    if (results) {
      await titto.deliverResearch(results, telegramSend, broadcast)
      console.log(`[Scheduler] ${label} run delivered — ${results.results?.length} results`)
    }
  } catch (err) {
    console.error(`[Scheduler] ${label} run failed:`, err.message)
    if (telegramSend) {
      telegramSend(`Research run (${label}) failed: ${err.message}`).catch(() => {})
    }
  }
}

module.exports = { initScheduler }
