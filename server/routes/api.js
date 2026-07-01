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
const { listPillars, setPillars } = require('../../state/quillPillarsStore')
const quillSessions = require('../../state/quillSessionsStore')
const { getStatus: getSchedulerStatus, setEnabled: setSchedulerEnabled } = require('../../state/schedulerStore')
const replyDomainsStore = require('../../state/replyDomainsStore')
const { readLatest: readRepliesLatest } = require('../../state/replyTargetsStore')
const activityStore = require('../../state/activityStore')
const memory = require('../../state/memory')
const { ensureProfile } = require('../../state/profileSeed')

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
  const { filterSources = null, triggerLabel = null } = req.body || {}
  res.json({ message: 'Research triggered. Results will arrive via WebSocket.' })
  try {
    const label = triggerLabel || (filterSources?.length ? `🖱 Manual · ${filterSources.join(', ')}` : '🖱 Manual Run')
    const results = await chitrag.run({ triggeredBy: 'user', triggerLabel: label, broadcast, filterSources })
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
  const { broadcast, telegramSend, telegramSendDraft } = req.app.locals
  try {
    const result = await titto.handleMessage({ text: message, sessionId, source: 'web', broadcast, telegramSend, telegramSendDraft })
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
    await toolsAgent.run({ broadcast, triggerLabel: '🖱 API' })
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
  const { broadcast, telegramSend, telegramSendDraft } = req.app.locals
  const research = readLatest()
  if (!research) return res.status(400).json({ error: 'No research data. Run /api/research/trigger first.' })
  res.json({ message: 'Quill triggered. Drafts will arrive via Telegram + WebSocket.' })
  try {
    await quill.runDaily({ research, broadcast, telegramSend, telegramSendDraft, triggerLabel: '🖱 API' })
  } catch (err) {
    logger.error('[API] Quill trigger failed', err)
  }
})

// ── Activity feed (Titto control tower) ───────────────────────────────────────

// GET /api/activity?limit=100  → newest-first log of every agent run
router.get('/activity', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 200)
  res.json({ activity: activityStore.list(limit) })
})

// ── Scheduler control ─────────────────────────────────────────────────────────

// GET /api/scheduler  →  { enabled: bool, updatedAt? }
router.get('/scheduler', (req, res) => {
  res.json(getSchedulerStatus())
})

// PUT /api/scheduler  body: { enabled: bool }
router.put('/scheduler', (req, res) => {
  const enabled = !!req.body?.enabled
  try {
    const saved = setSchedulerEnabled(enabled)
    logger.info(`[API] Scheduler ${enabled ? 'ENABLED' : 'DISABLED'} by user`)
    res.json(saved)
  } catch (err) {
    logger.error('[API] Scheduler toggle failed', err)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/quill/pillars
router.get('/quill/pillars', (req, res) => {
  res.json({ pillars: listPillars() })
})

// PUT /api/quill/pillars  body: { pillars: [{ id?, label, notes? }] }
router.put('/quill/pillars', (req, res) => {
  const { pillars } = req.body || {}
  if (!Array.isArray(pillars)) return res.status(400).json({ error: 'pillars must be an array' })
  try {
    const saved = setPillars(pillars)
    res.json({ pillars: saved })
  } catch (err) {
    logger.error('[API] Pillars save failed', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/quill/plan  body: { forceFresh?, triggerLabel? }
router.post('/quill/plan', async (req, res) => {
  const { forceFresh = false, triggerLabel } = req.body || {}
  const { broadcast } = req.app.locals
  try {
    const result = await quill.planSuggestions({ broadcast, forceFresh: !!forceFresh, triggerLabel })
    res.json(result)
  } catch (err) {
    logger.error('[API] Quill plan failed', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/quill/draft  body: { suggestion, format, sessionId?, sid? }
router.post('/quill/draft', async (req, res) => {
  const { suggestion, format, sessionId, sid } = req.body || {}
  if (!suggestion?.title) return res.status(400).json({ error: 'suggestion with title required' })
  if (!format) return res.status(400).json({ error: 'format required' })
  const { broadcast } = req.app.locals
  try {
    const result = await quill.draftFromSuggestion({ suggestion, format, broadcast, sessionId, sid })
    res.json(result)
  } catch (err) {
    logger.error('[API] Quill draft failed', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/quill/refine  body: { draftText, instruction, format, sessionId?, draftUid? }
router.post('/quill/refine', async (req, res) => {
  const { draftText, instruction, format, sessionId, draftUid } = req.body || {}
  if (!draftText?.trim()) return res.status(400).json({ error: 'draftText required' })
  if (!instruction?.trim()) return res.status(400).json({ error: 'instruction required' })
  const { broadcast } = req.app.locals
  try {
    const result = await quill.refineDraft({ draftText, instruction, format, broadcast, sessionId, draftUid })
    res.json(result)
  } catch (err) {
    logger.error('[API] Quill refine failed', err)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/quill/sessions  → list all (newest first)
router.get('/quill/sessions', (req, res) => {
  res.json({ sessions: quillSessions.listSessions() })
})

// GET /api/quill/sessions/:id  → single session
router.get('/quill/sessions/:id', (req, res) => {
  const s = quillSessions.readSession(req.params.id)
  if (!s) return res.status(404).json({ error: 'session not found' })
  res.json(s)
})

// PUT /api/quill/sessions/:id/draft/:uid  body: { text }  → manual save of edited draft
router.put('/quill/sessions/:id/draft/:uid', (req, res) => {
  const { text } = req.body || {}
  if (typeof text !== 'string') return res.status(400).json({ error: 'text (string) required' })
  const updated = quillSessions.updateDraft(req.params.id, req.params.uid, { text, edited: true })
  if (!updated) return res.status(404).json({ error: 'session or draft not found' })
  res.json(updated)
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

// ── Reply-target domain settings ──────────────────────────────────
// GET /api/replies/domains → { domains: [{ id, label, core, enabled }] }
router.get('/replies/domains', (req, res) => {
  res.json({ domains: replyDomainsStore.listDomainsWithState() })
})

// GET /api/replies/latest → last reply-target run (its own store, separate from research)
router.get('/replies/latest', (req, res) => {
  const data = readRepliesLatest()
  if (!data) return res.json({ results: [], message: 'No reply-target run yet. Use /replies or the Find button.' })
  res.json(data)
})

// POST /api/replies/trigger  body: { domains?, keywords? } — run the I2C reply-target search
router.post('/replies/trigger', async (req, res) => {
  const { broadcast } = req.app.locals
  const { domains = null, keywords = null } = req.body || {}
  res.json({ message: 'Reply-target search triggered. Results arrive via WebSocket.' })
  try {
    await chitrag.findReplyTargets({ domains, extraKeywords: keywords, broadcast })
  } catch (err) {
    logger.error('[API] Reply-target trigger failed', err)
    if (broadcast) broadcast({ type: 'error', data: { message: 'Reply-target search failed: ' + err.message } })
  }
})

// PUT /api/replies/domains  body: { enabled: [domainIds] } — set which OPTIONAL domains are on
router.put('/replies/domains', (req, res) => {
  const { enabled } = req.body || {}
  if (!Array.isArray(enabled)) return res.status(400).json({ error: 'enabled must be an array of domain ids' })
  try {
    const savedExtras = replyDomainsStore.setEnabledExtras(enabled)
    res.json({ enabledExtras: savedExtras, domains: replyDomainsStore.listDomainsWithState() })
  } catch (err) {
    logger.error('[API] Reply domains save failed', err)
    res.status(500).json({ error: err.message })
  }
})

// ── Content-engine: profile / memory / draft queue (account-keyed) ─────────────

// GET /api/profile → seeded-if-missing creator profile for the active account
router.get('/profile', (req, res) => {
  const account = memory.accounts.getActiveAccount()
  res.json({ account, profile: ensureProfile(account) })
})

// PUT /api/profile  body: { profile } — save the full profile object (dashboard editor / onboarding)
router.put('/profile', (req, res) => {
  const { profile } = req.body || {}
  if (!profile || typeof profile !== 'object') return res.status(400).json({ error: 'profile object required' })
  const account = memory.accounts.getActiveAccount()
  try {
    const saved = memory.saveProfile(account, profile)
    res.json({ account, profile: saved })
  } catch (err) {
    logger.error('[API] Profile save failed', err)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/queue?state=  → the draft-lifecycle queue (optionally filtered by state)
router.get('/queue', (req, res) => {
  const account = memory.accounts.getActiveAccount()
  res.json({ account, drafts: memory.listQueue(account, req.query.state || null) })
})

// POST /api/draft/:id/transition  body: { state, reason?, editedText?, performance? }
// Drives the lifecycle; mirrors the meaningful transitions into memory (approve/reject/edit/measure).
router.post('/draft/:id/transition', (req, res) => {
  const { state, reason, editedText, performance } = req.body || {}
  if (!memory.STATES.includes(state)) return res.status(400).json({ error: `state must be one of ${memory.STATES.join(', ')}` })
  const account = memory.accounts.getActiveAccount()
  const updated = memory.transition(account, req.params.id, state, { reason, editedText, performance })
  if (!updated) return res.status(404).json({ error: 'draft not found' })
  res.json({ account, draft: updated })
})

// GET /api/memory → summary of what the loop has learned (for the dashboard)
router.get('/memory', (req, res) => {
  const account = memory.accounts.getActiveAccount()
  res.json({
    account,
    counts: {
      approved: memory.approvedDrafts.read(account).length,
      rejected: memory.rejectedDrafts.read(account).length,
      voiceExamples: memory.voiceExamples.read(account).length,
      performance: memory.performanceLog.read(account).length,
      trends: memory.trendLog.read(account).length,
      queue: memory.readQueue(account).length,
    },
    recentApproved: memory.approvedDrafts.read(account).slice(-5),
    recentRejected: memory.rejectedDrafts.read(account).slice(-5),
  })
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
