const express = require('express')
const router = express.Router()
const titto = require('../../agents/titto')
const chitrag = require('../../agents/chitrag')
const logger = require('../../utils/logger')
const { readLatest, listArchive, readArchive } = require('../../state/researchStore')

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

// GET /api/research/archive/:filename
router.get('/research/archive/:filename', (req, res) => {
  const data = readArchive(req.params.filename)
  if (!data) return res.status(404).json({ error: 'Not found' })
  res.json(data)
})

// POST /api/research/trigger
router.post('/research/trigger', async (req, res) => {
  const { broadcast } = req.app.locals
  res.json({ message: 'Research triggered. Results will arrive via WebSocket.' })
  try {
    const results = await chitrag.run({ triggeredBy: 'user', broadcast })
    if (results) await titto.deliverResearch(results, null, broadcast)
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
