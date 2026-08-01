const express = require('express')
const router = express.Router()
const titto = require('../../agents/titto')
const raven = require('../../agents/raven')
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
const { getStatus: getSchedulerStatus, setEnabled: setSchedulerEnabled, setHeronEnabled, setTimes: setSchedulerTimes } = require('../../state/schedulerStore')
const replyDomainsStore = require('../../state/replyDomainsStore')
const { readLatest: readRepliesLatest } = require('../../state/replyTargetsStore')
const activityStore = require('../../state/activityStore')
const articleWriter = require('../../agents/articleWriter')
const articlesStore = require('../../state/articlesStore')
const heron = require('../../agents/heron')
const heronTopicsStore = require('../../state/heronTopicsStore')
const analyst = require('../../agents/analyst')
const costStore = require('../../state/costStore')
const modelsConfig = require('../../config/models')
const memory = require('../../state/memory')
const { ensureProfile } = require('../../state/profileSeed')
const dailyDrop = require('../../scheduler/dailyDrop')
const heronDrop = require('../../scheduler/heronDrop')
const cron = require('../../scheduler/cron')

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
    const results = await raven.run({ triggeredBy: 'user', triggerLabel: label, broadcast, filterSources })
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
  const { broadcast, telegramSend, telegramSendDraft, telegramSendReplyTargets, telegramSendArticleIdeas } = req.app.locals
  try {
    const result = await titto.handleMessage({ text: message, sessionId, source: 'web', broadcast, telegramSend, telegramSendDraft, telegramSendReplyTargets, telegramSendArticleIdeas })
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

// ── Article Writer ────────────────────────────────────────────────────────────

// GET /api/models  → selectable writing models + pricing (+ whether OpenRouter is active)
router.get('/models', (req, res) => {
  const llm = require('../../utils/llm')
  res.json({ models: modelsConfig.MODELS, default: modelsConfig.DEFAULT_MODEL_ID, openrouter: llm.usingOpenRouter() })
})

// GET /api/article  → list (newest first, lightweight)
router.get('/article', (req, res) => {
  res.json({ articles: articlesStore.list(50) })
})

// GET /api/article/:id  → full record with all versions
router.get('/article/:id', (req, res) => {
  const r = articlesStore.get(req.params.id)
  if (!r) return res.status(404).json({ error: 'article not found' })
  res.json(r)
})

// POST /api/article/:id/revert  { version }  → re-append an earlier version's text as the new latest
router.post('/article/:id/revert', (req, res) => {
  const record = articlesStore.get(req.params.id)
  if (!record) return res.status(404).json({ error: 'article not found' })
  const v = parseInt(req.body?.version)
  const src = (record.versions || []).find(x => x.v === v)
  if (!src) return res.status(400).json({ error: 'version not found' })
  const updated = articlesStore.addVersion(req.params.id, { text: src.text, instruction: `revert to v${v}`, model: src.model })
  res.json(updated)
})

// GET /api/article/:id/export  → download the latest version as a frontmattered .md
router.get('/article/:id/export', (req, res) => {
  const out = articlesStore.exportMarkdown(req.params.id)
  if (!out) return res.status(404).json({ error: 'article not found' })
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`)
  res.send(out.markdown)
})

// POST /api/article/generate  { topic, model }  → creates a record, streams tokens over WS, finalizes.
// Returns { id } immediately; the draft arrives via `article_*` WS events.
router.post('/article/generate', async (req, res) => {
  const { topic, model } = req.body || {}
  if (!topic?.trim()) return res.status(400).json({ error: 'topic required' })
  const { broadcast } = req.app.locals
  const modelId = modelsConfig.byId(model) ? model : modelsConfig.DEFAULT_MODEL_ID

  // Pre-create a placeholder so the client has an id to bind the stream to.
  const record = articlesStore.create({ topic, title: topic, text: '', model: modelId })
  res.json({ id: record.id, model: modelId })

  if (broadcast) broadcast({ type: 'article_start', data: { id: record.id, title: topic, mode: 'generate' } })
  try {
    const result = await articleWriter.generate({
      topic, model: modelId,
      onToken: broadcast ? (delta) => broadcast({ type: 'article_token', data: { id: record.id, delta } }) : null,
    })
    articlesStore.updateLatestVersion(record.id, {
      text: result.text, usage: result.usage, cost: result.cost, sources: result.sources,
      model: result.modelId, title: result.title,
    })
    if (broadcast) broadcast({ type: 'article_done', data: {
      id: record.id, version: 1, title: result.title, text: result.text,
      sources: result.sources, usage: result.usage, cost: result.cost, model: result.modelId,
    } })
    const words = result.text.split(/\s+/).filter(Boolean).length
    activityStore.recordAndBroadcast(broadcast, {
      agent: 'article', action: 'write', triggerLabel: '🖱 Article',
      summary: `${words} words · ${result.sources.length} sources${result.cost != null ? ' · $' + result.cost.toFixed(4) : ''}`,
      ref: { kind: 'article', id: record.id },
    })
  } catch (err) {
    logger.error('[API] Article generate failed', err)
    if (broadcast) broadcast({ type: 'article_error', data: { id: record.id, message: err.message } })
  }
})

// POST /api/article/refine  { id, instruction, model }  → streams a new version over WS.
router.post('/article/refine', async (req, res) => {
  const { id, instruction, model } = req.body || {}
  const record = articlesStore.get(id)
  if (!record) return res.status(404).json({ error: 'article not found' })
  if (!instruction?.trim()) return res.status(400).json({ error: 'instruction required' })
  const { broadcast } = req.app.locals
  const modelId = modelsConfig.byId(model) ? model : (record.model || modelsConfig.DEFAULT_MODEL_ID)
  const currentText = articlesStore.latestText(record)

  // Append a placeholder version so streamed tokens have a target.
  const withPlaceholder = articlesStore.addVersion(id, { text: '', instruction, model: modelId })
  const newVersion = withPlaceholder.versions.length
  res.json({ id, version: newVersion, model: modelId })

  if (broadcast) broadcast({ type: 'article_start', data: { id, version: newVersion, mode: 'refine' } })
  try {
    const result = await articleWriter.refine({
      currentText, instruction, model: modelId, sources: record.sources,
      onToken: broadcast ? (delta) => broadcast({ type: 'article_token', data: { id, delta } }) : null,
    })
    articlesStore.updateLatestVersion(id, {
      text: result.text, usage: result.usage, cost: result.cost, sources: result.sources, model: result.modelId,
    })
    if (broadcast) broadcast({ type: 'article_done', data: {
      id, version: newVersion, text: result.text, sources: result.sources,
      usage: result.usage, cost: result.cost, model: result.modelId,
    } })
    const words = result.text.split(/\s+/).filter(Boolean).length
    activityStore.recordAndBroadcast(broadcast, {
      agent: 'article', action: 'refine', triggerLabel: '🖱 Article',
      summary: `v${newVersion} · ${words} words${result.cost != null ? ' · $' + result.cost.toFixed(4) : ''}`,
      ref: { kind: 'article', id },
    })
  } catch (err) {
    logger.error('[API] Article refine failed', err)
    if (broadcast) broadcast({ type: 'article_error', data: { id, message: err.message } })
  }
})

// ── Heron · Substack ──────────────────────────────────────────────────────────
// Article list/detail/revert/export are reused as-is from the routes above (already
// platform-agnostic). Only generation/refine/topics/notes need Substack-specific handling.

// GET /api/heron/topics → latest saved article-topic candidates
router.get('/heron/topics', (req, res) => {
  const account = memory.accounts.getActiveAccount()
  const data = heronTopicsStore.readLatest(account)
  res.json(data || { topics: [], message: 'No topics yet. Use POST /api/heron/topics/search.' })
})

// POST /api/heron/topics/search  body: { query?, count? } — targeted search if query given, else
// reuses the latest research (filtered to long-form-worthy items).
router.post('/heron/topics/search', async (req, res) => {
  const { query = null, count } = req.body || {}
  const { broadcast } = req.app.locals
  const account = memory.accounts.getActiveAccount()
  try {
    const result = await heron.searchTopics({ query, count, account, broadcast, triggerLabel: '🖱 Heron' })
    res.json(result)
  } catch (err) {
    logger.error('[API] Heron topic search failed', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/heron/article/generate  { idx?, topic?, model }  → creates a Substack article record,
// streams tokens over the SAME article_* WS events the X Article Writer uses, then registers a
// short-preview draft and fires the normal Telegram approve/reject/edit card.
router.post('/heron/article/generate', async (req, res) => {
  const { idx = null, topic: topicBody = null, model } = req.body || {}
  const { broadcast, telegramSendHeronDraft: telegramSendDraft } = req.app.locals
  const account = memory.accounts.getActiveAccount()

  let topic = topicBody
  if (!topic?.trim() && idx != null) {
    const t = heronTopicsStore.getTopic(account, idx)
    if (!t) return res.status(400).json({ error: 'No topic at that index — run /api/heron/topics/search first.' })
    topic = t.title || t.angle || t.snippet
  }
  if (!topic?.trim()) return res.status(400).json({ error: 'topic or idx required' })

  const modelId = modelsConfig.byId(model) ? model : modelsConfig.DEFAULT_MODEL_ID
  const record = articlesStore.create({ topic, title: topic, text: '', model: modelId, platform: 'substack' })
  res.json({ id: record.id, model: modelId })

  if (broadcast) broadcast({ type: 'article_start', data: { id: record.id, title: topic, mode: 'generate' } })
  try {
    const result = await articleWriter.generate({
      topic, model: modelId, platform: 'substack',
      onToken: broadcast ? (delta) => broadcast({ type: 'article_token', data: { id: record.id, delta } }) : null,
    })
    articlesStore.updateLatestVersion(record.id, {
      text: result.text, usage: result.usage, cost: result.cost, sources: result.sources, model: result.modelId, title: result.title,
      subtitle: result.subtitle, subject: result.subject, previewText: result.previewText, imagePrompt: result.imagePrompt,
    })
    if (broadcast) broadcast({ type: 'article_done', data: {
      id: record.id, version: 1, title: result.title, text: result.text,
      sources: result.sources, usage: result.usage, cost: result.cost, model: result.modelId,
      subtitle: result.subtitle, subject: result.subject, previewText: result.previewText, imagePrompt: result.imagePrompt,
    } })
    const updatedRecord = articlesStore.get(record.id)
    await heron.registerArticleDraft({ record: updatedRecord, account, broadcast, telegramSendDraft, triggerLabel: '🖱 Heron' })
  } catch (err) {
    logger.error('[API] Heron article generate failed', err)
    if (broadcast) broadcast({ type: 'article_error', data: { id: record.id, message: err.message } })
  }
})

// POST /api/heron/article/refine  { id, instruction, model }  → streams a new version over WS.
// Does not re-register a draft — the approve card already went out on the initial generate.
router.post('/heron/article/refine', async (req, res) => {
  const { id, instruction, model } = req.body || {}
  const record = articlesStore.get(id)
  if (!record) return res.status(404).json({ error: 'article not found' })
  if (record.platform !== 'substack') return res.status(400).json({ error: 'not a Substack article' })
  if (!instruction?.trim()) return res.status(400).json({ error: 'instruction required' })
  const { broadcast } = req.app.locals
  const modelId = modelsConfig.byId(model) ? model : (record.model || modelsConfig.DEFAULT_MODEL_ID)
  const currentText = articlesStore.latestText(record)

  const withPlaceholder = articlesStore.addVersion(id, { text: '', instruction, model: modelId })
  const newVersion = withPlaceholder.versions.length
  res.json({ id, version: newVersion, model: modelId })

  if (broadcast) broadcast({ type: 'article_start', data: { id, version: newVersion, mode: 'refine' } })
  try {
    const result = await articleWriter.refine({
      currentText, instruction, model: modelId, sources: record.sources, platform: 'substack',
      onToken: broadcast ? (delta) => broadcast({ type: 'article_token', data: { id, delta } }) : null,
    })
    articlesStore.updateLatestVersion(id, {
      text: result.text, usage: result.usage, cost: result.cost, sources: result.sources, model: result.modelId,
      subtitle: result.subtitle, subject: result.subject, previewText: result.previewText, imagePrompt: result.imagePrompt,
    })
    if (broadcast) broadcast({ type: 'article_done', data: {
      id, version: newVersion, text: result.text, sources: result.sources,
      usage: result.usage, cost: result.cost, model: result.modelId,
      subtitle: result.subtitle, subject: result.subject, previewText: result.previewText, imagePrompt: result.imagePrompt,
    } })
    const words = result.text.split(/\s+/).filter(Boolean).length
    activityStore.recordAndBroadcast(broadcast, {
      agent: 'heron', action: 'refine', triggerLabel: '🖱 Heron',
      summary: `v${newVersion} · ${words} words${result.cost != null ? ' · $' + result.cost.toFixed(4) : ''}`,
      ref: { kind: 'article', id },
    })
  } catch (err) {
    logger.error('[API] Heron article refine failed', err)
    if (broadcast) broadcast({ type: 'article_error', data: { id, message: err.message } })
  }
})

// POST /api/heron/note/write  body: { topic, count? }  → Substack Notes, registered + sent to
// Telegram exactly like every other draft (approve/reject/edit card).
router.post('/heron/note/write', async (req, res) => {
  const { topic, count = 1 } = req.body || {}
  if (!topic?.trim()) return res.status(400).json({ error: 'topic required' })
  const { broadcast, telegramSendHeronDraft: telegramSendDraft } = req.app.locals
  const account = memory.accounts.getActiveAccount()
  try {
    const result = await heron.writeNote({ topic, count, account, broadcast, telegramSendDraft, triggerLabel: '🖱 Heron' })
    res.json(result)
  } catch (err) {
    logger.error('[API] Heron note write failed', err)
    res.status(500).json({ error: 'Heron hit an error: ' + err.message })
  }
})

// ── Activity feed (Titto control tower) ───────────────────────────────────────

// GET /api/activity?limit=100  → newest-first log of every agent run
router.get('/activity', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 200)
  res.json({ activity: activityStore.list(limit) })
})

// GET /api/insights → the Analyst's learned "what's working" summary (today only reachable via /learned in chat)
router.get('/insights', (req, res) => {
  const account = memory.accounts.getActiveAccount()
  res.json({ account, insights: analyst.getInsights(account) })
})

// GET /api/expenses?days=N → LLM spend, bucketed by IST calendar day and by agent. Merges the
// cost log (every agent except Article Writer) with articlesStore's own per-version costs (Article
// Writer already persists its cost where it is — not duplicated into the cost log).
function istDateKey(iso) {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) // → 'YYYY-MM-DD'
}
router.get('/expenses', (req, res) => {
  const days = Math.min(parseInt(req.query.days) || 30, 90)
  const cutoff = Date.now() - days * 86400000
  const entries = [...costStore.list(), ...articlesStore.listCostEntries()]
    .filter(e => e.cost != null && new Date(e.ts).getTime() >= cutoff)

  const byDay = {}
  for (const e of entries) {
    const key = istDateKey(e.ts)
    if (!byDay[key]) byDay[key] = { date: key, total: 0, byAgent: {} }
    byDay[key].total += e.cost
    byDay[key].byAgent[e.agent] = (byDay[key].byAgent[e.agent] || 0) + e.cost
  }
  const daysArr = Object.values(byDay)
    .map(d => ({
      ...d,
      total: +d.total.toFixed(6),
      byAgent: Object.fromEntries(Object.entries(d.byAgent).map(([k, v]) => [k, +v.toFixed(6)])),
    }))
    .sort((a, b) => b.date.localeCompare(a.date))

  const byAgent = {}
  let grandTotal = 0
  for (const d of daysArr) {
    grandTotal += d.total
    for (const [k, v] of Object.entries(d.byAgent)) byAgent[k] = +((byAgent[k] || 0) + v).toFixed(6)
  }

  res.json({ days: daysArr, byAgent, grandTotal: +grandTotal.toFixed(6) })
})

// ── Control Center roster ───────────────────────────────────────────────────────
// Pure read-only aggregator over existing stores — no new agent logic, no new state.
// 'raven' and legacy 'chitrag' activity entries are treated as the same agent (pre-rename history).

// "HH:mm" (24h) -> "3:45 PM" style label + minutes-since-midnight, for the roster's nextRun display.
function hhmmToLabel(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return minutesToLabel(h * 60 + m)
}
// minutes-since-midnight -> "3:45 PM" style label + the (wrapped) minutes value.
function minutesToLabel(totalMin) {
  const wrapped = ((totalMin % 1440) + 1440) % 1440
  const h = Math.floor(wrapped / 60), m = wrapped % 60
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return { label: `${h12}:${String(m).padStart(2, '0')} ${period}`, minutes: wrapped }
}

// Raven/Quill's slots are user-editable (state/schedulerStore.js); Heron tracks 10 min after the
// daily drop (scheduler/heronDrop.js's getHeronIstMin()), not independently editable. Evening
// research + the weekly wrap are deactivated (manual-only) — no nextRun slot for either.
function getDailySlotMinutes() {
  const t = getSchedulerStatus().times
  return {
    raven: [hhmmToLabel(t.morningResearch)],
    'quill-x': [hhmmToLabel(t.dailyDrop)],
    heron: [minutesToLabel(heronDrop.getHeronIstMin())],
  }
}

function nextDailyLabel(agentId) {
  const slots = getDailySlotMinutes()[agentId]
  if (!slots) return null
  const nowMin = dailyDrop.istMinutes()
  const upcoming = slots.filter(s => s.minutes > nowMin).sort((a, b) => a.minutes - b.minutes)
  return (upcoming[0] || [...slots].sort((a, b) => a.minutes - b.minutes)[0]).label
}

// Most recent activity entry for any of the given agent ids (newest first list already).
function latestActivity(ids) {
  return activityStore.list(200).find(a => ids.includes(a.agent)) || null
}

router.get('/agents', (req, res) => {
  const account = memory.accounts.getActiveAccount()

  const research = readLatest()
  const ravenActivity = latestActivity(['raven', 'chitrag'])
  const raven = {
    id: 'raven', name: 'Raven', role: 'central search', kind: 'shared',
    status: 'idle',
    lastRun: research?.rankedAt || ravenActivity?.ts || null,
    summary: research ? `${research.results?.length || 0} items ranked` : (ravenActivity?.summary || 'No runs yet'),
    nextRun: nextDailyLabel('raven'),
  }

  const quillLatest = readQuillLatest()
  const quillActivity = latestActivity(['quill'])
  const quillX = {
    id: 'quill-x', name: 'Quill', role: 'manager · X', kind: 'platform', platform: 'x',
    status: 'idle',
    lastRun: quillLatest?.generatedAt || quillActivity?.ts || null,
    summary: quillLatest ? `${quillLatest.totalDrafts ?? quillLatest.drafts?.length ?? 0} drafts` : (quillActivity?.summary || 'No runs yet'),
    nextRun: nextDailyLabel('quill-x'),
  }

  const koelActivity = latestActivity(['koel'])
  const koel = {
    id: 'koel', name: 'Koel', role: 'writer', kind: 'shared',
    status: 'idle', mode: 'on demand',
    lastRun: koelActivity?.ts || null,
    summary: koelActivity?.summary || 'No drafts yet',
  }

  const articleActivity = latestActivity(['article'])
  const articles = articlesStore.list(1)
  const article = {
    id: 'article', name: 'Article Writer', role: 'long-form', kind: 'shared',
    status: 'idle', mode: 'on demand',
    lastRun: articleActivity?.ts || null,
    summary: articles[0] ? `Last: "${articles[0].title || articles[0].topic}"` : (articleActivity?.summary || 'No articles yet'),
  }

  const insights = analyst.getInsights(account)
  const analystActivity = latestActivity(['analyst'])
  const analystCard = {
    id: 'analyst', name: 'Analyst', role: 'learning', kind: 'shared',
    status: 'idle',
    lastRun: insights?.updatedAt || analystActivity?.ts || null,
    summary: insights?.summary || 'Not enough data yet',
    nextRun: 'Sun 6:00 AM',
  }

  // Not built yet (v2) — always present so the Control Center can show it, never with fake data.
  const parrot = { id: 'parrot', name: 'Parrot', role: 'manager · LinkedIn', kind: 'platform', platform: 'linkedin', status: 'not-built', summary: 'No trend source connected yet.' }

  const heronArticles = articlesStore.list(50).filter(a => a.platform === 'substack')
  const heronActivity = latestActivity(['heron'])
  const heronTopicsLatest = heronTopicsStore.readLatest(account)
  const heronCard = {
    id: 'heron', name: 'Heron', role: 'manager · Substack', kind: 'platform', platform: 'substack',
    status: 'idle',
    lastRun: heronArticles[0]?.updatedAt || heronActivity?.ts || null,
    summary: heronArticles[0]
      ? `Last: "${heronArticles[0].title || heronArticles[0].topic}"`
      : (heronActivity?.summary || (heronTopicsLatest?.topics?.length ? `${heronTopicsLatest.topics.length} topics found` : 'No runs yet')),
    nextRun: getSchedulerStatus().heronEnabled ? nextDailyLabel('heron') : null,
  }

  res.json({ agents: [raven, quillX, parrot, heronCard, koel, article, analystCard] })
})

// ── Scheduler control ─────────────────────────────────────────────────────────

// IST cron slots (scheduler/cron.js). Display-only here (no scheduling logic in this file) — the
// first 2 read live from schedulerStore (user-editable, see PUT below); Heron tracks 10 min after the
// daily drop (not independently editable). Evening research + the weekly wrap are deactivated —
// listed as manual-only so they don't just silently disappear from the page.
function getScheduleSlots() {
  const t = getSchedulerStatus().times
  return [
    { id: 'morning-research', time: hhmmToLabel(t.morningResearch).label, what: 'Research + briefing', agent: 'raven', editable: true, hhmm: t.morningResearch },
    { id: 'daily-drop', time: hhmmToLabel(t.dailyDrop).label, what: 'Daily drop', agent: 'quill-x', editable: true, hhmm: t.dailyDrop },
    { id: 'heron-drop', time: minutesToLabel(heronDrop.getHeronIstMin()).label, what: 'Heron drop — article + Notes (10 min after the daily drop)', agent: 'heron', editable: false },
    { id: 'evening-research', time: 'Manual only', what: 'Fresh research — deactivated; use /research or the dashboard', agent: 'raven', editable: false },
    { id: 'weekly-wrap', time: 'Manual only', what: 'Weekly wrap + perf nudge — deactivated; use the Quill page', agent: 'quill-x', editable: false },
  ]
}

// GET /api/scheduler  →  { enabled: bool, heronEnabled: bool, times: {...}, updatedAt?, slots: [...] }
router.get('/scheduler', (req, res) => {
  res.json({ ...getSchedulerStatus(), slots: getScheduleSlots() })
})

// PUT /api/scheduler  body: { enabled?, heronEnabled?, times?: { morningResearch?, dailyDrop?, eveningResearch? } }
// Any subset — each field is independent. `times` values are "HH:mm" 24h IST; a change re-arms the
// live cron jobs immediately, no server restart needed.
router.put('/scheduler', (req, res) => {
  try {
    if (req.body?.enabled !== undefined) {
      const enabled = !!req.body.enabled
      setSchedulerEnabled(enabled)
      logger.info(`[API] Scheduler ${enabled ? 'ENABLED' : 'DISABLED'} by user`)
    }
    if (req.body?.heronEnabled !== undefined) {
      const heronEnabled = !!req.body.heronEnabled
      setHeronEnabled(heronEnabled)
      logger.info(`[API] Heron auto-runs ${heronEnabled ? 'ENABLED' : 'DISABLED'} by user`)
    }
    if (req.body?.times && typeof req.body.times === 'object') {
      const updated = setSchedulerTimes(req.body.times)
      cron.rescheduleDynamic()
      logger.info(`[API] Schedule times updated by user: ${JSON.stringify(req.body.times)}`)
      return res.json({ ...getSchedulerStatus(), times: updated, slots: getScheduleSlots() })
    }
    res.json({ ...getSchedulerStatus(), slots: getScheduleSlots() })
  } catch (err) {
    logger.error('[API] Scheduler update failed', err)
    res.status(400).json({ error: err.message })
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
    await raven.findReplyTargets({ domains, extraKeywords: keywords, broadcast })
  } catch (err) {
    logger.error('[API] Reply-target trigger failed', err)
    if (broadcast) broadcast({ type: 'error', data: { message: 'Reply-target search failed: ' + err.message } })
  }
})

// POST /api/replies/draft  body: { url } — draft a reply for one saved reply target (on demand)
router.post('/replies/draft', async (req, res) => {
  const { url, index } = req.body || {}
  const data = readRepliesLatest()
  if (!data?.results?.length) return res.status(400).json({ error: 'No reply targets loaded. Run /replies first.' })
  let target = null
  if (url) target = data.results.find(r => r.url === url)
  else if (index != null) target = (data.qualified || data.results)[index]
  if (!target) return res.status(404).json({ error: 'Reply target not found — re-run /replies.' })
  const { broadcast } = req.app.locals
  try {
    const result = await koel.draftReply({
      sourceText: target.fullText || target.title,
      author: target.author || target.publisher,
      broadcast, triggerLabel: '🖱 Reply (web)',
    })
    const rec = (result.draftRecords && result.draftRecords[0]) || {}
    res.json({ id: rec.id || null, text: rec.text || result.drafts[0] || '', sourceUrl: target.url, author: target.author || target.publisher, headline: target.title })
  } catch (err) {
    logger.error('[API] Reply draft failed', err)
    res.status(500).json({ error: err.message })
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
router.post('/draft/:id/transition', async (req, res) => {
  const { state, reason, editedText, performance } = req.body || {}
  if (!memory.STATES.includes(state)) return res.status(400).json({ error: `state must be one of ${memory.STATES.join(', ')}` })
  const account = memory.accounts.getActiveAccount()
  const updated = memory.transition(account, req.params.id, state, { reason, editedText, performance })
  if (!updated) return res.status(404).json({ error: 'draft not found' })
  res.json({ account, draft: updated })
  // Approving a Substack draft from the web Queue page hands it off to Telegram too — same moment
  // as tapping Approve there, just triggered from the other client.
  if (state === 'queued' && updated.platform === 'substack') {
    const { telegramSendHeronHandoff } = req.app.locals
    if (telegramSendHeronHandoff) {
      try { await telegramSendHeronHandoff(updated) } catch (err) { logger.error('[API] Heron hand-off failed', err) }
    }
  }
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
