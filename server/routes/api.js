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
const { getStatus: getSchedulerStatus, setEnabled: setSchedulerEnabled, setHeronEnabled, setParrotEnabled, setTimes: setSchedulerTimes } = require('../../state/schedulerStore')
const replyDomainsStore = require('../../state/replyDomainsStore')
const { readLatest: readRepliesLatest } = require('../../state/replyTargetsStore')
const activityStore = require('../../state/activityStore')
const articleWriter = require('../../agents/articleWriter')
const articlesStore = require('../../state/articlesStore')
const inflight = require('../../utils/inflight')
const videosStore = require('../../state/videosStore')
const { readLinkCard } = require('../../tools/readUrl')
const heron = require('../../agents/heron')
const heronTopicsStore = require('../../state/heronTopicsStore')
const parrot = require('../../agents/parrot')
const parrotSessions = require('../../state/parrotSessionsStore')
const brandAuditStore = require('../../state/brandAuditStore')
const keywordsStore = require('../../state/keywordsStore')
const keywordSearch = require('../../tools/keywordSearch')
const strategyStore = require('../../state/strategyStore')
const imagesStore = require('../../state/imagesStore')
const imageClient = require('../../utils/imageClient')
const generateImage = require('../../tools/generateImage')
const assetsStore = require('../../state/assetsStore')
const finishDraft = require('../../utils/finishDraft')
const scheduleStore = require('../../state/scheduleStore')
const slotDelivery = require('../../scheduler/slotDelivery')
const articleTemplateStore = require('../../state/articleTemplateStore')
const articleLessonsStore = require('../../state/articleLessonsStore')
const bootstrap = require('../../agents/bootstrap')
const linkedinAuth = require('../../utils/linkedinAuth')
const analyst = require('../../agents/analyst')
const costStore = require('../../state/costStore')
const modelsConfig = require('../../config/models')
const memory = require('../../state/memory')
const { ensureProfile } = require('../../state/profileSeed')
const dailyDrop = require('../../scheduler/dailyDrop')
const heronDrop = require('../../scheduler/heronDrop')
const parrotDrop = require('../../scheduler/parrotDrop')
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
  const { broadcast, telegramSend, telegramSendDraft, telegramSendReplyTargets, telegramSendArticleIdeas, telegramSendParrotDraft } = req.app.locals
  try {
    const result = await titto.handleMessage({ text: message, sessionId, source: 'web', broadcast, telegramSend, telegramSendDraft, telegramSendReplyTargets, telegramSendArticleIdeas, telegramSendParrotDraft })
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

// The Writer's input is a BRIEF, not just a topic. It used to be dropped into `suggestion.title`, so
// "600 words, second person, as a checklist, on morning routines" became the article's working title
// and its GitHub/arXiv search query — which is why typed requirements were ignored.
//
// Short input is a plain topic. Anything longer is kept whole as a binding instruction, and the first
// clause (or the "on/about X" tail) is used as the topic so research still gets something searchable.
const SPEC_MARKERS = /\b(\d{2,5}\s*words?|second person|first person|checklist|bullet|structure|section|tone|no citations|no links|paragraph|style|format|steps?|listicle|casual|formal|short|long)\b/i

function splitBrief(raw) {
  const text = String(raw || '').trim()
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length <= 10 && !SPEC_MARKERS.test(text)) return { topic: text, instructions: '' }

  let topic = ''
  const about = text.match(/\b(?:about|on|regarding|covering)\s+([^,.;\n]{3,80})/i)
  if (about) topic = about[1].trim()
  if (!topic) topic = text.split(/[,.;\n]/).map((s) => s.trim()).find((s) => s && !SPEC_MARKERS.test(s)) || ''
  if (!topic) topic = words.slice(0, 8).join(' ')

  return { topic: topic.replace(/^(write|draft|create|make)\s+(an?|the)?\s*/i, '').trim() || text.slice(0, 80), instructions: text }
}

// POST /api/article/generate  { brief | topic, model }  → creates a record, streams tokens over WS, finalizes.
// Returns { id } immediately; the draft arrives via `article_*` WS events.
router.post('/article/generate', async (req, res) => {
  // `brief` is the new field: whatever you typed in the Writer box, treated as a real instruction.
  // `topic` is still accepted so Telegram /ideas and other existing callers keep working unchanged.
  const { brief, topic: topicBody, model } = req.body || {}
  const rawBrief = String(brief || topicBody || '').trim()
  if (!rawBrief) return res.status(400).json({ error: 'topic required' })
  const { topic, instructions } = splitBrief(rawBrief)
  const { broadcast } = req.app.locals
  const modelId = modelsConfig.byId(model) ? model : modelsConfig.DEFAULT_MODEL_ID

  // Reserve an id WITHOUT persisting anything — the client only needs an id to bind the stream to,
  // and an empty record written now is stranded forever if the process is killed mid-generation
  // (node --watch restarts on any file save, and a killed process never runs a catch block).
  // The record is created once, below, when there is real text.
  const articleId = articlesStore.newId()
  res.json({ id: articleId, model: modelId })

  const ctrl = inflight.start(articleId)
  if (broadcast) broadcast({ type: 'article_start', data: { id: articleId, title: topic, mode: 'generate' } })
  try {
    const result = await articleWriter.generate({
      topic, model: modelId, instructions, searchQuery: topic, signal: ctrl.signal,
      onToken: broadcast ? (delta) => broadcast({ type: 'article_token', data: { id: articleId, delta } }) : null,
    })
    const wasCancelled = ctrl.signal.aborted
    // On Stop we keep whatever was written (your choice), so a half-finished piece is still openable
    // and refinable rather than thrown away. Empty output is still an error.
    if (!result.text?.trim()) throw new Error(wasCancelled ? 'stopped before any text was written' : 'generate returned empty text')
    const record = articlesStore.create({
      id: articleId, topic, title: result.title || topic, text: result.text, model: result.modelId,
      sources: result.sources, usage: result.usage, cost: result.cost,
    })
    if (broadcast) broadcast({ type: 'article_done', data: {
      id: record.id, version: 1, title: result.title, text: result.text,
      sources: result.sources, usage: result.usage, cost: result.cost, model: result.modelId,
      cancelled: wasCancelled,
    } })
    const words = result.text.split(/\s+/).filter(Boolean).length
    activityStore.recordAndBroadcast(broadcast, {
      agent: 'article', action: 'write', triggerLabel: wasCancelled ? '🛑 Article (stopped)' : '🖱 Article',
      summary: `${words} words · ${result.sources.length} sources${result.cost != null ? ' · $' + result.cost.toFixed(4) : ''}${wasCancelled ? ' · stopped early' : ''}`,
      ref: { kind: 'article', id: record.id },
    })
  } catch (err) {
    // Nothing was ever written, so there is nothing to clean up — even if this process dies here.
    logger.error('[API] Article generate failed — nothing written', err)
    if (broadcast) broadcast({ type: 'article_error', data: { id: articleId, message: err.message } })
  } finally {
    inflight.finish(articleId)
  }
})

// POST /api/article/:id/cancel — stop a running generation.
// Must be HTTP: the WebSocket is one-way (server/websocket.js registers no 'message' listener).
router.post('/article/:id/cancel', (req, res) => {
  const stopped = inflight.cancel(req.params.id)
  res.json({ ok: true, stopped })
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

  // NO placeholder version. The client streams into local state keyed by the ARTICLE id (see
  // ArticleWriterPage's article_token handler) — it never reads a persisted empty version, so the
  // placeholder only ever existed as a write target.
  //
  // It also made every failure destructive: a throw, a hang, or the process being restarted
  // mid-stream (node --watch does this on any file save) left a 0-char latest version and the
  // article read as destroyed. A try/catch cannot save you from a killed process; not writing the
  // empty version in the first place can. The version is appended below, once, only on success.
  const newVersion = record.versions.length + 1
  res.json({ id, version: newVersion, model: modelId })

  const ctrl = inflight.start(id)
  if (broadcast) broadcast({ type: 'article_start', data: { id, version: newVersion, mode: 'refine' } })
  try {
    const result = await articleWriter.refine({
      currentText, instruction, model: modelId, sources: record.sources,
      // Was missing: Substack refines ran under X's rules and lost the SUBJECT/PREVIEW/SUBTITLE block.
      platform: record.platform || 'x',
      signal: ctrl.signal,
      onToken: broadcast ? (delta) => broadcast({ type: 'article_token', data: { id, delta } }) : null,
    })
    if (!result.text?.trim()) throw new Error('refine returned empty text')
    // One atomic append, only now that there is real text.
    articlesStore.addVersion(id, {
      text: result.text, instruction, model: result.modelId,
      usage: result.usage, cost: result.cost, sources: result.sources,
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
    // Nothing to roll back — no version was written. The article still holds its previous text.
    logger.error('[API] Article refine failed — article left unchanged', err)
    if (broadcast) broadcast({ type: 'article_error', data: { id, message: err.message, unchanged: true } })
  } finally {
    inflight.finish(id)
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
  const { idx = null, brief = null, topic: rawTopicBody = null, model } = req.body || {}
  const { broadcast, telegramSendHeronDraft: telegramSendDraft } = req.app.locals
  const account = memory.accounts.getActiveAccount()

  const topicBody = String(brief || rawTopicBody || '').trim() || null
  let topic = topicBody
  if (!topic?.trim() && idx != null) {
    const t = heronTopicsStore.getTopic(account, idx)
    if (!t) return res.status(400).json({ error: 'No topic at that index — run /api/heron/topics/search first.' })
    topic = t.title || t.angle || t.snippet
  }
  if (!topic?.trim()) return res.status(400).json({ error: 'topic or idx required' })

  const modelId = modelsConfig.byId(model) ? model : modelsConfig.DEFAULT_MODEL_ID
  // Reserve an id without persisting — see the X generate route. Nothing hits disk until success.
  const articleId = articlesStore.newId()
  res.json({ id: articleId, model: modelId })

  const split = splitBrief(topic)
  const ctrl = inflight.start(articleId)
  if (broadcast) broadcast({ type: 'article_start', data: { id: articleId, title: split.topic, mode: 'generate' } })
  try {
    const result = await articleWriter.generate({
      topic: split.topic, model: modelId, platform: 'substack',
      instructions: split.instructions, searchQuery: split.topic, signal: ctrl.signal,
      onToken: broadcast ? (delta) => broadcast({ type: 'article_token', data: { id: articleId, delta } }) : null,
    })
    const wasCancelled = ctrl.signal.aborted
    if (!result.text?.trim()) throw new Error(wasCancelled ? 'stopped before any text was written' : 'generate returned empty text')
    const record = articlesStore.create({
      id: articleId, topic, title: result.title || topic, text: result.text, model: result.modelId, platform: 'substack',
      sources: result.sources, usage: result.usage, cost: result.cost,
      subtitle: result.subtitle, subject: result.subject, previewText: result.previewText, imagePrompt: result.imagePrompt,
    })
    if (broadcast) broadcast({ type: 'article_done', data: {
      id: record.id, version: 1, title: result.title, text: result.text,
      sources: result.sources, usage: result.usage, cost: result.cost, model: result.modelId,
      subtitle: result.subtitle, subject: result.subject, previewText: result.previewText, imagePrompt: result.imagePrompt,
      cancelled: wasCancelled,
    } })
    // A stopped run must NOT fire the Telegram approve card — you'd be asked to approve a
    // deliberately abandoned half-article.
    if (wasCancelled) {
      logger.warn(`[API] Heron article ${articleId} stopped early — partial saved, no Telegram card sent`)
    } else {
      const updatedRecord = articlesStore.get(record.id)
      await heron.registerArticleDraft({ record: updatedRecord, account, broadcast, telegramSendDraft, triggerLabel: '🖱 Heron' })
    }
  } catch (err) {
    // Nothing written — nothing to clean up, even if this process is killed here.
    logger.error('[API] Heron article generate failed — nothing written', err)
    if (broadcast) broadcast({ type: 'article_error', data: { id: articleId, message: err.message } })
  } finally {
    inflight.finish(articleId)
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

  // Same as the X refine route: no empty placeholder version. Writing one made every failure
  // destructive, and a process killed mid-stream can't be rescued by a catch block.
  const newVersion = record.versions.length + 1
  res.json({ id, version: newVersion, model: modelId })

  if (broadcast) broadcast({ type: 'article_start', data: { id, version: newVersion, mode: 'refine' } })
  try {
    const result = await articleWriter.refine({
      currentText, instruction, model: modelId, sources: record.sources, platform: 'substack',
      onToken: broadcast ? (delta) => broadcast({ type: 'article_token', data: { id, delta } }) : null,
    })
    if (!result.text?.trim()) throw new Error('refine returned empty text')
    articlesStore.addVersion(id, {
      text: result.text, instruction, model: result.modelId,
      usage: result.usage, cost: result.cost, sources: result.sources,
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
    // Nothing written — the article keeps its previous text.
    logger.error('[API] Heron article refine failed — article left unchanged', err)
    if (broadcast) broadcast({ type: 'article_error', data: { id, message: err.message, unchanged: true } })
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

// ── Parrot (LinkedIn) — OAuth + on-demand write. The only agent in this app with a real posting
// path: Approve (Telegram or the web Queue) calls parrot.postApprovedDraft(), which actually posts. ──

// GET /api/parrot/status → connection status for the dashboard's status card. Never throws.
router.get('/parrot/status', (req, res) => {
  res.json(linkedinAuth.tokenStatus({ warnDays: 7 }))
})

// GET /api/parrot/oauth/start → redirect into LinkedIn's consent screen. Visit this once to connect
// (or reconnect every ~60 days — standard LinkedIn apps get no refresh token, see utils/linkedinAuth.js).
router.get('/parrot/oauth/start', (req, res) => {
  try {
    res.redirect(linkedinAuth.getAuthUrl())
  } catch (err) {
    res.status(500).send(`LinkedIn isn't configured yet: ${err.message}. Set LINKEDIN_CLIENT_ID/LINKEDIN_CLIENT_SECRET in .env first.`)
  }
})

// GET /api/parrot/oauth/callback — LinkedIn redirects here with ?code=... after consent.
router.get('/parrot/oauth/callback', async (req, res) => {
  const { code, error, error_description: errorDescription, state } = req.query
  if (error) return res.status(400).send(`LinkedIn declined: ${errorDescription || error}`)
  if (!code) return res.status(400).send('Missing ?code from LinkedIn')
  if (!linkedinAuth.verifyState(state)) return res.status(400).send('State mismatch — start the connection again from /api/parrot/oauth/start')
  try {
    const record = await linkedinAuth.exchangeCode(code)
    res.send(`<h2>✅ LinkedIn connected</h2><p>Connected as ${record.name || record.personUrn}. You can close this tab.</p>`)
  } catch (err) {
    logger.error('[API] LinkedIn OAuth callback failed', err)
    res.status(500).send(`LinkedIn connection failed: ${err.message}`)
  }
})

// POST /api/parrot/write  body: { topic, count? } → on-demand LinkedIn draft(s), sent to Parrot's bot
router.post('/parrot/write', async (req, res) => {
  const { topic, count = 1 } = req.body || {}
  if (!topic?.trim()) return res.status(400).json({ error: 'topic required' })
  const { broadcast, telegramSendParrotDraft: telegramSendDraft } = req.app.locals
  const account = memory.accounts.getActiveAccount()
  try {
    const result = await parrot.writePost({ topic, count, account, broadcast, telegramSendDraft, triggerLabel: '🖱 Parrot' })
    res.json(result)
  } catch (err) {
    logger.error('[API] Parrot write failed', err)
    res.status(500).json({ error: 'Parrot hit an error: ' + err.message })
  }
})

// POST /api/parrot/plan  body: { forceFresh?, triggerLabel? } — same shape as /quill/plan. "Fresh
// search" here reuses Raven's existing cross-platform research (LinkedIn's own API has no trending/feed
// endpoint at any tier) reframed into career/ai/building-in-public suggestions.
router.post('/parrot/plan', async (req, res) => {
  const { forceFresh = false, triggerLabel } = req.body || {}
  const { broadcast } = req.app.locals
  try {
    const result = await parrot.planSuggestions({ broadcast, forceFresh: !!forceFresh, triggerLabel })
    res.json(result)
  } catch (err) {
    logger.error('[API] Parrot plan failed', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/parrot/draft  body: { suggestion, sessionId? } → registers a real, approvable LinkedIn
// draft and sends it to Parrot's Telegram bot, same as /parrot/write.
router.post('/parrot/draft', async (req, res) => {
  const { suggestion, sessionId } = req.body || {}
  if (!suggestion?.title) return res.status(400).json({ error: 'suggestion with title required' })
  const { broadcast, telegramSendParrotDraft: telegramSendDraft } = req.app.locals
  try {
    const result = await parrot.draftFromSuggestion({ suggestion, broadcast, sessionId, telegramSendDraft })
    res.json(result)
  } catch (err) {
    logger.error('[API] Parrot draft failed', err)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/parrot/sessions  → list all plan sessions (newest first)
router.get('/parrot/sessions', (req, res) => {
  res.json({ sessions: parrotSessions.listSessions() })
})

// GET /api/parrot/sessions/:id  → single session
router.get('/parrot/sessions/:id', (req, res) => {
  const s = parrotSessions.readSession(req.params.id)
  if (!s) return res.status(404).json({ error: 'session not found' })
  res.json(s)
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

// ── Calendar / slots ──────────────────────────────────────────────────────────
// The grid is a convenience, not a constraint: an asset can sit at any instant, and anything
// scheduled off-grid still comes back in `offGrid` so it can never silently vanish.

// GET /api/schedule?start=YYYY-MM-DD&days=7
router.get('/schedule', (req, res) => {
  const account = memory.accounts.getActiveAccount()
  const days = Math.min(31, Math.max(1, parseInt(req.query.days) || 7))
  res.json({ account, ...scheduleStore.grid(account, { startYmd: req.query.start || null, days }) })
})

// PUT /api/schedule/:assetId  body: { scheduledFor: ISO | null }
// This is what drag-to-reschedule calls. null unschedules.
router.put('/schedule/:assetId', (req, res) => {
  try {
    const account = memory.accounts.getActiveAccount()
    const { scheduledFor = null } = req.body || {}
    if (scheduledFor && Number.isNaN(Date.parse(scheduledFor))) return res.status(400).json({ error: 'scheduledFor must be an ISO datetime or null' })
    const asset = assetsStore.setSchedule(account, req.params.assetId, scheduledFor)
    if (!asset) return res.status(404).json({ error: 'asset not found' })
    res.json({ ok: true, asset })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// GET /api/schedule/slots · PUT /api/schedule/slots  body: { slots: ["09:00", …] }  (IST)
router.get('/schedule/slots', (req, res) => res.json({ slots: scheduleStore.getSlots() }))
router.put('/schedule/slots', (req, res) => {
  try {
    res.json({ ok: true, slots: scheduleStore.setSlots(req.body?.slots) })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// POST /api/schedule/generate  body: { brief, platform, scheduledFor, withImage? }
// Click an empty slot → write into it. Goes through the platform-aware Koel path (Stage B), lands
// in the library, and attaches itself to the slot.
router.post('/schedule/generate', async (req, res) => {
  try {
    const { brief, platform = 'x', scheduledFor = null, withImage = false } = req.body || {}
    if (!brief?.trim()) return res.status(400).json({ error: 'brief is required' })
    const account = memory.accounts.getActiveAccount()
    const broadcast = req.app.locals.broadcast

    // Format drives the platform pack — see prompts/koelWrite.js platformForFormat().
    const format = platform === 'linkedin' ? 'linkedin' : platform === 'substack' ? 'heronMid' : 'punch'
    const written = await koel.write({
      format, input: brief, inputType: 'topic', count: 1,
      account, broadcast: null, register: false, origin: 'quill',
      triggerLabel: '📅 Slot',
    })
    const text = written.drafts[0] || ''
    const finished = finishDraft.finish({ text, platform })

    let imageId = null
    if (withImage) {
      try {
        imageId = (await generateImage.generateFromPost({ text, platform, account, broadcast })).id
      } catch (e) {
        logger.source('api').warn('slot image generation failed, continuing without: ' + e.message)
      }
    }

    const segments = finished.polishedSegments.map((s, i) => (i === 0 && imageId ? { ...s, imageId } : s))
    const asset = assetsStore.create(account, { segments, platform, origin: 'quill', warnings: finished.warnings, meta: { brief } })
    if (scheduledFor) assetsStore.setSchedule(account, asset.id, scheduledFor)

    res.json({ ok: true, asset: assetsStore.get(account, asset.id) })
  } catch (err) {
    logger.source('api').error('slot generate failed', err)
    res.status(500).json({ error: err.message })
  }
})

// ── Asset library ─────────────────────────────────────────────────────────────
// An asset is a finished, editable, publishable unit — segments + images + platform validation.
// Everything lands here: agent-generated drafts, and work written outside the app (origin:'manual').

// GET /api/assets?platform=&state=
router.get('/assets', (req, res) => {
  const account = memory.accounts.getActiveAccount()
  const { platform = null, state = null } = req.query
  res.json({ account, assets: assetsStore.list(account, { platform, state }), states: assetsStore.STATES })
})

router.get('/assets/:id', (req, res) => {
  const account = memory.accounts.getActiveAccount()
  const asset = assetsStore.get(account, req.params.id)
  if (!asset) return res.status(404).json({ error: 'asset not found' })
  res.json({ asset })
})

// POST /api/assets  body: { text?, segments?, platform?, origin?, imageId?, polish? }
// `polish` (default: true for agent origins, false for manual) decides whether house-style
// cleanup is APPLIED. For anything hand-written it is computed and returned, never applied —
// see utils/finishDraft.js.
router.post('/assets', (req, res) => {
  try {
    const account = memory.accounts.getActiveAccount()
    const { text = '', segments = null, platform = 'x', origin = 'manual', imageId = null, videoId = null, link = null, meta = {} } = req.body || {}
    if (!text.trim() && !(segments && segments.length)) return res.status(400).json({ error: 'text or segments required' })

    const polish = req.body?.polish ?? (origin !== 'manual')
    let finished = null
    let finalSegments = segments

    if (!finalSegments) {
      finished = finishDraft.finish({ text, platform })
      finalSegments = polish ? finished.polishedSegments : finished.segments
    }
    // All media rides on segment 0 — a thread's later parts never carry their own.
    if (imageId || videoId || link) {
      finalSegments = finalSegments.map((s, i) => (i === 0 ? { ...s, imageId, videoId, link } : s))
    }

    const asset = assetsStore.create(account, {
      segments: finalSegments, platform, origin, meta,
      warnings: finished ? finished.warnings : [],
    })
    // `suggestions` lets the UI offer polish as a diff for manual content instead of silently applying it.
    res.json({ ok: true, asset, suggestions: finished && !polish ? { changes: finished.changes, polishedSegments: finished.polishedSegments } : null })
  } catch (err) {
    logger.source('api').error('asset create failed', err)
    res.status(400).json({ error: err.message })
  }
})

// PUT /api/assets/:id  body: { segments?, platform?, state?, note? } → appends a version
router.put('/assets/:id', (req, res) => {
  try {
    const account = memory.accounts.getActiveAccount()
    const { segments = null, platform = null, state = null, note = 'edited' } = req.body || {}
    const target = assetsStore.get(account, req.params.id)
    if (!target) return res.status(404).json({ error: 'asset not found' })
    // Re-validate against whichever platform the asset ends up on.
    const warnings = segments ? finishDraft.validate(segments, platform || target.platform) : null
    const asset = assetsStore.update(account, req.params.id, { segments, platform, state, warnings, note })
    res.json({ ok: true, asset })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// POST /api/assets/:id/revert  body: { v }
router.post('/assets/:id/revert', (req, res) => {
  const account = memory.accounts.getActiveAccount()
  const asset = assetsStore.revert(account, req.params.id, req.body?.v)
  if (!asset) return res.status(404).json({ error: 'asset or version not found' })
  res.json({ ok: true, asset })
})

// POST /api/assets/:id/adapt  body: { platform }
// Rewrite an existing asset for a DIFFERENT platform. This is what the Stage B platform packs make
// possible: not a reformat, a genuine rewrite in that platform's register, calibrated against work
// already approved there. Works on manual content too — write once, get three native versions.
router.post('/assets/:id/adapt', async (req, res) => {
  try {
    const account = memory.accounts.getActiveAccount()
    const source = assetsStore.get(account, req.params.id)
    if (!source) return res.status(404).json({ error: 'asset not found' })

    const target = req.body?.platform
    if (!['x', 'linkedin', 'substack'].includes(target)) return res.status(400).json({ error: 'platform must be x, linkedin or substack' })
    if (target === source.platform) return res.status(400).json({ error: `already a ${target} asset` })

    const sourceText = source.segments.map(s => s.text).join('\n\n')
    const format = target === 'linkedin' ? 'linkedin' : target === 'substack' ? 'heronMid' : 'punch'

    const written = await koel.write({
      format,
      input: sourceText,
      inputType: 'freetext',
      count: 1,
      // The source is the IDEA, not a template. Saying so explicitly stops the model reformatting
      // the original instead of rewriting it for the new platform.
      extraInstructions: `Below is a post Souvik already has for ${source.platform}. Take the IDEA and write it properly for ${target} instead.

This is a rewrite, not a reformat. ${target} has a different reader, a different reading pattern, and different conventions — follow the ${target} rules in your system prompt, not the shape of the original. Keep the underlying point and any real specifics (numbers, names, concrete details). Change everything else that needs to change.`,
      account, broadcast: null, register: false, origin: 'quill', platform: target,
      triggerLabel: '🔀 Adapt',
    })

    const text = written.drafts[0] || ''
    const finished = finishDraft.finish({ text, platform: target })
    const asset = assetsStore.create(account, {
      segments: finished.polishedSegments, platform: target, origin: 'adapted',
      warnings: finished.warnings, meta: { adaptedFrom: source.id, adaptedFromPlatform: source.platform },
    })
    res.json({ ok: true, asset })
  } catch (err) {
    logger.source('api').error('adapt failed', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/assets/generate  body: { brief, platform }
// Write something with AI and hand the TEXT BACK, without saving or scheduling it. The Studio needs
// this so a generated draft lands in the editor where it can be read and changed before it becomes
// anything — /api/schedule/generate does the same Koel call but commits it to a slot immediately,
// which is the wrong shape for "generate, then look at it".
router.post('/assets/generate', async (req, res) => {
  try {
    const { brief, platform = 'x' } = req.body || {}
    if (!brief?.trim()) return res.status(400).json({ error: 'brief is required' })
    const account = memory.accounts.getActiveAccount()

    // Format drives the platform pack — see prompts/koelWrite.js platformForFormat().
    const format = platform === 'linkedin' ? 'linkedin' : platform === 'substack' ? 'heronMid' : 'punch'
    const written = await koel.write({
      format, input: brief, inputType: 'topic', count: 1,
      account, broadcast: null, register: false, origin: 'quill',
      triggerLabel: '🎬 Studio',
    })
    const text = written.drafts[0] || ''
    // Return the finishing pass alongside so the editor can show segments/warnings straight away.
    res.json({ ok: true, text, ...finishDraft.finish({ text, platform }) })
  } catch (err) {
    logger.source('api').error('studio generate failed', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/assets/:id/send → deliver this asset to Telegram right now.
// scheduler/slotDelivery.js already routes correctly per platform (LinkedIn posts for real, X to
// the main chat, Substack to Heron's, each with the "Posted ✅" button); it was only reachable from
// the cron tick. This is the same call, triggered by hand.
router.post('/assets/:id/send', async (req, res) => {
  try {
    const account = memory.accounts.getActiveAccount()
    const asset = assetsStore.get(account, req.params.id)
    if (!asset) return res.status(404).json({ error: 'asset not found' })

    // Publishing is approved in Telegram, not from this button. LinkedIn posts for real and can't
    // be edited or undone afterwards, so the web UI asks rather than acts; X and Substack go through
    // the same gate for consistency and because the approval card is where the copy button lives.
    const askToPublish = req.app.locals.telegramSendPublishRequest
    if (askToPublish) {
      await askToPublish({ account, asset })
      return res.json({ ok: true, mode: 'awaiting_approval', asset })
    }

    // No Telegram configured — fall back to delivering directly, or nothing could ever be published.
    const result = await slotDelivery.deliverAsset({
      account,
      asset,
      telegramSend: req.app.locals.telegramSend,
      telegramSendHeronDraft: req.app.locals.telegramSendHeronDraft,
      sendAssetCard: req.app.locals.telegramSendAssetCard,
    })
    if (!result.ok) return res.status(502).json({ error: result.error || 'delivery failed', mode: result.mode })
    res.json({ ok: true, mode: result.mode, asset: assetsStore.get(account, req.params.id) })
  } catch (err) {
    logger.source('api').error('asset send failed', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/assets/preview  body: { text, platform } → split + validate WITHOUT saving anything.
// Powers the live warning strip on the compose page.
router.post('/assets/preview', (req, res) => {
  const { text = '', platform = 'x' } = req.body || {}
  res.json(finishDraft.finish({ text, platform }))
})

router.delete('/assets/:id', (req, res) => {
  const account = memory.accounts.getActiveAccount()
  if (!assetsStore.remove(account, req.params.id)) return res.status(404).json({ error: 'asset not found' })
  res.json({ ok: true })
})

// ── Images ────────────────────────────────────────────────────────────────────
// Files are served statically from /assets/images (see server/index.js); these routes are the
// metadata index, generation, upload, and the approve/reject verdict that builds the future
// LoRA training set.

// GET /api/images → newest first, plus which provider is live and what else is available.
// `provider` reflects utils/imageProviders/ — swap it with IMAGE_PROVIDER in .env.
router.get('/images', (req, res) => {
  const account = memory.accounts.getActiveAccount()
  const all = imagesStore.list(account).slice().reverse()
  const status = imageClient.status()
  res.json({
    account,
    images: all,
    approvedCount: all.filter(i => i.verdict === 'approved').length,
    provider: status.active,
    providerStatus: status,
    defaultModel: status.defaultModel,
    models: modelsConfig.IMAGE_MODELS,
  })
})

// POST /api/images/generate  body: { text? | subject?, raw?, platform?, modelId? }
// `text` = post copy (a visual subject is derived from it first). `subject` = skip that step.
router.post('/images/generate', async (req, res) => {
  try {
    const { text = null, subject = null, raw = false, platform = 'x', modelId = null } = req.body || {}
    if (!text && !subject) return res.status(400).json({ error: 'Provide either `text` (post copy) or `subject` (a visual subject/prompt)' })
    const account = memory.accounts.getActiveAccount()
    const broadcast = req.app.locals.broadcast
    const image = subject
      ? await generateImage.generateFromPrompt({ subject, raw, platform, modelId, account, broadcast })
      : await generateImage.generateFromPost({ text, platform, modelId, account, broadcast })
    res.json({ ok: true, image })
  } catch (err) {
    logger.source('api').error('image generate failed', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/images/upload  body: { data: "<base64 or data: URL>", contentType?, platform? }
router.post('/images/upload', (req, res) => {
  try {
    const { data, contentType = 'image/png', platform = 'x' } = req.body || {}
    if (!data) return res.status(400).json({ error: 'data (base64 or data: URL) is required' })
    const account = memory.accounts.getActiveAccount()
    res.json({ ok: true, image: generateImage.saveUpload({ data, contentType, platform, account }) })
  } catch (err) {
    logger.source('api').error('image upload failed', err)
    res.status(400).json({ error: err.message })
  }
})

// ── Video ─────────────────────────────────────────────────────────────────────
// POST /api/videos/upload — RAW BINARY body (not base64 JSON like images: base64 inflates ~33% and
// the JSON cap is 15mb). express.raw() is mounted for this path only, in server/index.js.
// Pass the real type in Content-Type, and the original filename in X-Filename.
router.post('/videos/upload', (req, res) => {
  try {
    const contentType = req.get('content-type') || ''
    if (!Buffer.isBuffer(req.body) || !req.body.length) {
      return res.status(400).json({ error: 'Send the video as a raw binary body with a video/* Content-Type' })
    }
    if (!videosStore.isSupported(contentType)) {
      return res.status(415).json({ error: `Unsupported type "${contentType}" — use mp4, mov or webm` })
    }
    const account = memory.accounts.getActiveAccount()
    const video = videosStore.save({
      data: req.body,
      contentType,
      account,
      platform: req.get('x-platform') || 'x',
      filename: req.get('x-filename') || null,
    })
    res.json({ ok: true, video })
  } catch (err) {
    logger.source('api').error('video upload failed', err)
    res.status(400).json({ error: err.message })
  }
})

// GET /api/videos — the gallery
router.get('/videos', (req, res) => {
  const account = memory.accounts.getActiveAccount()
  res.json({ videos: videosStore.list(account).slice().reverse() })
})

// DELETE /api/videos/:id
router.delete('/videos/:id', (req, res) => {
  const account = memory.accounts.getActiveAccount()
  if (!videosStore.remove(account, req.params.id)) return res.status(404).json({ error: 'video not found' })
  res.json({ ok: true })
})

// POST /api/link-card  body: { url } → { title, description, image, siteName } for the preview card
router.post('/link-card', async (req, res) => {
  const url = String(req.body?.url || '').trim()
  if (!url) return res.status(400).json({ error: 'url required' })
  const card = await readLinkCard(url)
  if (!card) return res.status(422).json({ error: "Couldn't read that page's preview info" })
  res.json({ ok: true, card })
})

// POST /api/images/:id/verdict  body: { verdict: 'approved' | 'rejected' | null }
router.post('/images/:id/verdict', (req, res) => {
  try {
    const account = memory.accounts.getActiveAccount()
    const rec = imagesStore.setVerdict(account, req.params.id, req.body?.verdict ?? null)
    if (!rec) return res.status(404).json({ error: 'image not found' })
    res.json({ ok: true, image: rec, approvedCount: imagesStore.approved(account).length })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// DELETE /api/images/:id → removes the record and the file
router.delete('/images/:id', (req, res) => {
  const account = memory.accounts.getActiveAccount()
  const ok = imagesStore.remove(account, req.params.id)
  if (!ok) return res.status(404).json({ error: 'image not found' })
  res.json({ ok: true })
})

// ── Article preferences ───────────────────────────────────────────────────────
// The two template files already drove article generation but had no UI. articleWriter reads them
// fresh on every generation, so a save here takes effect on the next article with no restart.

router.get('/article-template', (req, res) => {
  try {
    res.json({ ...articleTemplateStore.get(req.query.platform || 'x'), platforms: articleTemplateStore.platforms() })
  } catch (err) { res.status(400).json({ error: err.message }) }
})

router.put('/article-template', (req, res) => {
  try {
    const { platform = 'x', content = null, preamble = null, sections = null } = req.body || {}
    res.json({ ok: true, ...articleTemplateStore.save(platform, { content, preamble, sections }) })
  } catch (err) { res.status(400).json({ error: err.message }) }
})

// Standing rules distilled from the corrections Souvik makes when refining articles.
router.get('/article-lessons', (req, res) => {
  res.json(articleLessonsStore.get(memory.accounts.getActiveAccount()))
})

router.post('/article-lessons/learn', async (req, res) => {
  try {
    res.json(await analyst.learnArticleLessons({ broadcast: req.app.locals.broadcast }))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/article-lessons', (req, res) => {
  const { text } = req.body || {}
  if (!text?.trim()) return res.status(400).json({ error: 'text required' })
  res.json(articleLessonsStore.addRule(memory.accounts.getActiveAccount(), text))
})

router.delete('/article-lessons/:id', (req, res) => {
  res.json(articleLessonsStore.removeRule(memory.accounts.getActiveAccount(), req.params.id))
})

// ── Content strategy ──────────────────────────────────────────────────────────
// The single source of truth for what this account is about. Editing it here changes the ranking
// prompt's subjects and ban list, Raven's on-topic domains, the thread themes, and the repost
// filter — all at once. Before this existed those lived in seven separate files, none editable.

// GET /api/strategy → { positioning, pillars[], exclusions[], domains, threadThemes }
router.get('/strategy', (req, res) => {
  const account = memory.accounts.getActiveAccount()
  const strategy = strategyStore.get(account)
  res.json({
    account,
    strategy,
    allDomains: strategyStore.ALL_DOMAINS,
    onTopicDomains: strategyStore.onTopicDomains(account),
    // What today's thread slots resolve to — makes the 'always'/'rotate' setting concrete.
    threadThemesToday: strategyStore.threadThemes(account, 2),
  })
})

// PUT /api/strategy  body: { positioning?, pillars?, exclusions? }
router.put('/strategy', (req, res) => {
  try {
    const account = memory.accounts.getActiveAccount()
    const strategy = strategyStore.save(account, req.body || {})
    res.json({
      ok: true,
      strategy,
      onTopicDomains: strategyStore.onTopicDomains(account),
      threadThemesToday: strategyStore.threadThemes(account, 2),
    })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// ── Per-platform keywords ─────────────────────────────────────────────────────
// What earns reach differs per platform, so keyword priority is stored per platform and folded into
// Raven's ranking call (see prompts/rankResults.js) rather than a single global focus list.

// GET /api/keywords → { x: [{term, weight}], linkedin: [...], substack: [...] }
router.get('/keywords', (req, res) => {
  const account = memory.accounts.getActiveAccount()
  res.json({ account, keywords: keywordsStore.getAll(account), platforms: keywordsStore.PLATFORMS })
})

// PUT /api/keywords  body: { x?: [...], linkedin?: [...], substack?: [...] }
// Each list is [{ term, weight }] or bare strings. Platforms left out are untouched.
router.put('/keywords', (req, res) => {
  const account = memory.accounts.getActiveAccount()
  const patch = req.body || {}
  const known = keywordsStore.PLATFORMS.filter(p => patch[p] !== undefined)
  if (!known.length) return res.status(400).json({ error: 'Provide at least one of: ' + keywordsStore.PLATFORMS.join(', ') })
  res.json({ ok: true, keywords: keywordsStore.save(account, patch) })
})

// POST /api/keywords/search  body: { seed?, platform? }
// Expands a seed topic into candidate keywords and scores every one against the CURRENT research
// pool (real occurrence counts, not a model's guess at what's trending). Omit `seed` to just report
// what the pool is already about plus how the saved keywords are performing.
router.post('/keywords/search', async (req, res) => {
  try {
    const { seed = null, platform = 'x' } = req.body || {}
    const result = await keywordSearch({ seed, platform })
    res.json(result)
  } catch (err) {
    logger.source('api').error('keyword search failed', err)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/brand-audit → the latest real X brand-gap audit (real tweets, real engagement, real niche comparison)
router.get('/brand-audit', (req, res) => {
  const account = memory.accounts.getActiveAccount()
  res.json({ account, audit: brandAuditStore.get(account) })
})

// POST /api/brand-audit/trigger  body: { screenname? } → runs a real audit now (real RapidAPI + LLM call)
router.post('/brand-audit/trigger', async (req, res) => {
  const { screenname } = req.body || {}
  const { broadcast } = req.app.locals
  const account = memory.accounts.getActiveAccount()
  try {
    const audit = await analyst.auditBrand({ account, screenname: screenname || undefined, broadcast })
    res.json({ account, audit })
  } catch (err) {
    logger.error('[API] Brand audit failed', err)
    res.status(500).json({ error: err.message })
  }
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
    parrot: [hhmmToLabel(t.linkedinDrop)],
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

  const imageActivity = latestActivity(['image'])
  const allImages = imagesStore.list(account)
  const approvedImages = allImages.filter(i => i.verdict === 'approved').length
  const imageCard = {
    id: 'image', name: 'Image', role: 'visuals', kind: 'shared',
    status: imageClient.activeProvider() ? 'idle' : 'not-built',
    mode: imageClient.activeProvider() || 'no provider',
    lastRun: imageActivity?.ts || null,
    summary: allImages.length
      ? `${allImages.length} image${allImages.length === 1 ? '' : 's'} · ${approvedImages} approved`
      : 'No images yet',
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

  const parrotActivity = latestActivity(['parrot'])
  const linkedinStatus = linkedinAuth.tokenStatus()
  const parrotCard = {
    id: 'parrot', name: 'Parrot', role: 'manager · LinkedIn', kind: 'platform', platform: 'linkedin',
    status: linkedinStatus.connected ? 'idle' : 'not-connected',
    lastRun: parrotActivity?.ts || null,
    summary: !linkedinStatus.connected
      ? 'LinkedIn not connected — visit /api/parrot/oauth/start'
      : (parrotActivity?.summary || 'No runs yet'),
    nextRun: getSchedulerStatus().parrotEnabled ? nextDailyLabel('parrot') : null,
  }

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

  res.json({ agents: [raven, quillX, parrotCard, heronCard, koel, article, imageCard, analystCard] })
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
    { id: 'linkedin-drop', time: hhmmToLabel(t.linkedinDrop).label, what: 'Parrot drop — LinkedIn post draft (Approve posts it immediately)', agent: 'parrot', editable: true, hhmm: t.linkedinDrop },
    { id: 'evening-research', time: 'Manual only', what: 'Fresh research — deactivated; use /research or the dashboard', agent: 'raven', editable: false },
    { id: 'weekly-wrap', time: 'Manual only', what: 'Weekly wrap + perf nudge — deactivated; use the Quill page', agent: 'quill-x', editable: false },
  ]
}

// GET /api/scheduler  →  { enabled: bool, heronEnabled: bool, parrotEnabled: bool, times: {...}, updatedAt?, slots: [...] }
router.get('/scheduler', (req, res) => {
  res.json({ ...getSchedulerStatus(), slots: getScheduleSlots() })
})

// PUT /api/scheduler  body: { enabled?, heronEnabled?, parrotEnabled?, times?: { morningResearch?, dailyDrop?, linkedinDrop? } }
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
    if (req.body?.parrotEnabled !== undefined) {
      const parrotEnabled = !!req.body.parrotEnabled
      setParrotEnabled(parrotEnabled)
      logger.info(`[API] Parrot auto-runs ${parrotEnabled ? 'ENABLED' : 'DISABLED'} by user`)
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

// POST /api/profile/bootstrap  body: { niche, samples? } — first-run AI setup: infers voice +
// starter pillars from a niche + optional sample posts instead of a blank manual form.
router.post('/profile/bootstrap', async (req, res) => {
  const { niche, samples } = req.body || {}
  if (!niche?.trim()) return res.status(400).json({ error: 'niche is required' })
  const account = memory.accounts.getActiveAccount()
  const broadcast = req.app.locals.broadcast
  try {
    const { profile, strategy } = await bootstrap.bootstrapProfile({ account, niche, samples, broadcast })
    res.json({ account, profile, strategy })
  } catch (err) {
    logger.error('[API] Profile bootstrap failed', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/profile/skip-bootstrap — dismiss the first-run bootstrap without generating anything;
// flips onboarded so Settings stops offering it, leaving all fields as whatever they are today.
router.post('/profile/skip-bootstrap', (req, res) => {
  const account = memory.accounts.getActiveAccount()
  try {
    const current = ensureProfile(account)
    const saved = memory.saveProfile(account, { ...current, onboarded: true })
    res.json({ account, profile: saved })
  } catch (err) {
    logger.error('[API] Profile bootstrap skip failed', err)
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

  // Approving a LinkedIn draft REALLY posts it — same real action as tapping Approve on Parrot's
  // Telegram bot, just triggered from the web Queue. Intercepted BEFORE the generic transition below:
  // postApprovedDraft posts first and only transitions state on success, so a failed post leaves the
  // draft untouched (still 'generated') — it stays visible in the normal Queue and this same Approve
  // button works as retry, no separate recovery path needed.
  if (state === 'queued') {
    const draft = memory.getDraft(account, req.params.id)
    if (!draft) return res.status(404).json({ error: 'draft not found' })
    if (draft.platform === 'linkedin') {
      if (editedText) memory.transition(account, req.params.id, 'edited', { editedText })
      const toPost = editedText ? memory.getDraft(account, req.params.id) : draft
      const result = await parrot.postApprovedDraft(toPost)
      const final = result.ok ? memory.getDraft(account, req.params.id) : toPost
      return res.json({ account, draft: final, linkedin: result })
    }
  }

  const updated = memory.transition(account, req.params.id, state, { reason, editedText, performance })
  if (!updated) return res.status(404).json({ error: 'draft not found' })
  // Approving a Substack draft from the web Queue page hands it off to Telegram too — same moment
  // as tapping Approve there, just triggered from the other client.
  if (state === 'queued' && updated.platform === 'substack') {
    const { telegramSendHeronHandoff } = req.app.locals
    if (telegramSendHeronHandoff) {
      try { await telegramSendHeronHandoff(updated) } catch (err) { logger.error('[API] Heron hand-off failed', err) }
    }
    return res.json({ account, draft: updated })
  }
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
