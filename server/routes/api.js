const express = require('express')
const router = express.Router()
const titto = require('../../agents/titto')
const chitrag = require('../../agents/chitrag')
const toolsAgent = require('../../agents/toolsAgent')
const koel = require('../../agents/koel')
const quill = require('../../agents/quill')
const logger = require('../../utils/logger')
const { readLatest, listArchive, readArchive } = require('../../state/researchStore')
const { readLatest: readToolsLatest } = require('../../state/toolsStore')
const { readHistory: readKoelHistory } = require('../../state/koelStore')
const { readLatest: readQuillLatest, readHistory: readQuillHistory } = require('../../state/quillStore')

// GET /api/research/latest
router.get('/research/latest', (req, res) => {
  const data = readLatest()
  if (!data) return res.json({ results: [], message: 'No research run yet. Use /research to start.' })
  res.json(data)
})

// GET /api/research/history
router.get('/research/history', (req, res) => {
  res.json(listArchive())
})

// GET /api/research/runs — full run objects, newest first (for multi-run history view)
router.get('/research/runs', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 30, 50)
  const archive = listArchive()
  const runs = archive.slice(0, limit).map(a => readArchive(a.file)).filter(Boolean)
  res.json(runs)
})

// GET /api/research/archive/:filename
router.get('/research/archive/:filename', (req, res) => {
  const data = readArchive(req.params.filename)
  if (!data) return res.status(404).json({ error: 'Not found' })
  res.json(data)
})

// POST /api/research/trigger
// Manual trigger — updates web UI only, does NOT send to Telegram or run Quill
// Body: { filterSources: ['reddit'] } to restrict to specific sources
router.post('/research/trigger', async (req, res) => {
  const { broadcast } = req.app.locals
  const { filterSources = null } = req.body || {}
  res.json({ message: 'Research triggered. Results will arrive via WebSocket.' })
  try {
    const results = await chitrag.run({ triggeredBy: 'user', broadcast, filterSources })
    if (results) await titto.deliverResearch(results, null, broadcast)  // null = no Telegram
  } catch (err) {
    logger.error('[API] Research trigger failed', err)
    if (broadcast) broadcast({ type: 'error', data: { message: 'Research run failed: ' + err.message } })
  }
})

// POST /api/chat
router.post('/chat', async (req, res) => {
  const { message, sessionId = 'web-default' } = req.body
  if (!message) return res.status(400).json({ error: 'message required' })
  const { broadcast } = req.app.locals
  try {
    const result = await titto.handleMessage({ text: message, sessionId, source: 'web', broadcast })
    res.json({ reply: result.reply, action: result.action, data: result.data || null })
  } catch (err) {
    logger.error('[API] Chat error', err)
    res.status(500).json({ error: 'Titto hit an error. Check logs.' })
  }
})

// ── Tools endpoints ───────────────────────────────────────────────

// GET /api/tools/latest
router.get('/tools/latest', (req, res) => {
  const data = readToolsLatest()
  if (!data) return res.json({ tools: [], message: 'No tools run yet. Use /api/tools/trigger.' })
  res.json(data)
})

// POST /api/tools/trigger
router.post('/tools/trigger', async (req, res) => {
  const { broadcast } = req.app.locals
  res.json({ message: 'Tools fetch triggered. Results will arrive via WebSocket.' })
  try {
    await toolsAgent.run({ broadcast })
  } catch (err) {
    logger.error('[API] Tools trigger failed', err)
    if (broadcast) broadcast({ type: 'error', data: { message: 'Tools run failed: ' + err.message } })
  }
})

// ── Quill endpoints ───────────────────────────────────────────────

// GET /api/quill/latest
router.get('/quill/latest', (req, res) => {
  const data = readQuillLatest()
  if (!data) return res.json({ drafts: [], message: 'No drafts generated yet. Use /api/quill/trigger.' })
  res.json(data)
})

// GET /api/quill/history
router.get('/quill/history', (req, res) => {
  res.json(readQuillHistory())
})

// POST /api/quill/trigger — manual daily run
router.post('/quill/trigger', async (req, res) => {
  const { broadcast, telegramSend } = req.app.locals
  const research = readLatest()
  if (!research) return res.status(400).json({ error: 'No research data. Run /api/research/trigger first.' })
  res.json({ message: 'Quill triggered. Drafts will arrive via Telegram + WebSocket.' })
  try {
    await quill.runDaily({ research, broadcast, telegramSend })
  } catch (err) {
    logger.error('[API] Quill trigger failed', err)
  }
})

// POST /api/quill/weekly — manual weekly run
router.post('/quill/weekly', async (req, res) => {
  const { broadcast, telegramSend } = req.app.locals
  res.json({ message: 'Quill weekly triggered. Results will arrive via Telegram + WebSocket.' })
  try {
    await quill.runWeekly({ broadcast, telegramSend })
  } catch (err) {
    logger.error('[API] Quill weekly failed', err)
  }
})

// ── Koel endpoints ────────────────────────────────────────────────

// GET /api/koel/history
router.get('/koel/history', (req, res) => {
  res.json(readKoelHistory())
})

// POST /api/koel/reload — reload knowledge files without restart
router.post('/koel/reload', (req, res) => {
  try {
    koel.reload()
    res.json({ message: 'Koel knowledge files reloaded.' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/koel/write
// Body: { format, input, inputType, count, extraInstructions }
router.post('/koel/write', async (req, res) => {
  const { format = 'short', input, inputType = 'freetext', count = 3, extraInstructions = '' } = req.body
  if (!input?.trim()) return res.status(400).json({ error: 'input is required' })
  const { broadcast } = req.app.locals
  // Respond immediately, result comes via WebSocket AND in response body
  try {
    const result = await koel.write({ format, input, inputType, count, extraInstructions, broadcast })
    res.json(result)
  } catch (err) {
    logger.error('[API] Koel write failed', err)
    res.status(500).json({ error: 'Koel hit an error: ' + err.message })
  }
})

// ── Log endpoints ─────────────────────────────────────────────────

// GET /api/logs — list available log files
router.get('/logs', (req, res) => {
  res.json(logger.listLogFiles())
})

// GET /api/logs/today — today's full log
router.get('/logs/today', (req, res) => {
  const content = logger.readLogFile(`${new Date().toISOString().slice(0,10)}.log`) || ''
  res.type('text/plain').send(content)
})

// GET /api/logs/errors — today's error log
router.get('/logs/errors', (req, res) => {
  const content = logger.readErrorLog() || '(no errors today)'
  res.type('text/plain').send(content)
})

// GET /api/logs/file/:filename — specific log file
router.get('/logs/file/:filename', (req, res) => {
  const content = logger.readLogFile(req.params.filename)
  if (content === null) return res.status(404).send('Log file not found')
  res.type('text/plain').send(content)
})

// GET /api/logs/scrape/:source — scrape log for a specific source (today)
router.get('/logs/scrape/:source', (req, res) => {
  const filename = `scrape/${new Date().toISOString().slice(0,10)}-${req.params.source}.log`
  const content = logger.readLogFile(filename) || `(no scrape log for source: ${req.params.source} today)`
  res.type('text/plain').send(content)
})

module.exports = router
