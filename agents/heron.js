require('dotenv').config()
const raven = require('./raven')
const koel = require('./koel')
const articleWriter = require('./articleWriter')
const memory = require('../state/memory')
const articlesStore = require('../state/articlesStore')
const heronTopicsStore = require('../state/heronTopicsStore')
const researchStore = require('../state/researchStore')
const { listPillars } = require('../state/quillPillarsStore')
const activityStore = require('../state/activityStore')
const logger = require('../utils/logger')
const log = logger.source('heron')

// ── Topic search ──────────────────────────────────────────────────────────────
// Targeted search (query given) fires a fresh Raven run; otherwise reuses the latest research.
// Filters out short-only material (postPotential:'short') — Substack needs long-form-worthy angles.
async function searchTopics({ query = null, count = 6, account = null, broadcast = null, triggerLabel = '🖱 Manual' } = {}) {
  const acct = account || memory.accounts.getActiveAccount()
  let research
  if (query?.trim()) {
    research = await raven.run({
      triggeredBy: 'heron-topics',
      triggerLabel: `🦢 Heron topic search · "${query.slice(0, 40)}"`,
      searchQuery: query,
      broadcast,
    })
  } else {
    research = researchStore.readLatest()
  }

  const results = research?.results || []
  const candidates = results
    .filter(r => r.postPotential !== 'short')
    .sort((a, b) => (b.trendingScore || 0) - (a.trendingScore || 0))
    .slice(0, count)

  const rec = heronTopicsStore.save(acct, candidates, { researchRunId: research?.runId || null })

  activityStore.recordAndBroadcast(broadcast, {
    agent: 'heron', action: 'topics', triggerLabel,
    summary: `${candidates.length} article topic${candidates.length === 1 ? '' : 's'} found`,
    ref: { kind: 'heron' },
  })

  log.info(`searchTopics: ${candidates.length} candidates saved (query: ${query || '(latest research)'})`)
  return rec
}

// ── Article draft preview + registration (shared by heron.js's own writeArticle and the
// streaming /api/heron/article/generate route, so both paths register/hand-off identically) ──
// Draft text is a SHORT preview only (subject/subtitle + first ~280 chars) — the full article always
// comes fresh from articlesStore by meta.articleId, never duplicated into the draft queue record.
function buildArticlePreview(record) {
  const ver = record.versions?.[record.versions.length - 1] || {}
  const header = [ver.subject, ver.subtitle].filter(Boolean).join('\n')
  const body = String(ver.text || '').trim()
  const bodyPreview = body.length > 280 ? body.slice(0, 280).trim() + '…' : body
  return [header, bodyPreview].filter(Boolean).join('\n\n')
}

async function registerArticleDraft({ record, account = null, broadcast = null, telegramSendDraft = null, triggerLabel = '🖱 Manual' } = {}) {
  const acct = account || memory.accounts.getActiveAccount()
  const preview = buildArticlePreview(record)
  const draftRec = memory.addDraft(acct, {
    text: preview, format: 'article', origin: 'heron', platform: 'substack',
    meta: { articleId: record.id, kind: 'article', topic: (record.topic || '').slice(0, 200) },
  })

  if (telegramSendDraft) {
    await telegramSendDraft([{ id: draftRec.id, text: preview }], { header: `🦢 Substack article — "${record.title}"` })
  }

  activityStore.recordAndBroadcast(broadcast, {
    agent: 'heron', action: 'write-article', triggerLabel,
    summary: `article drafted — "${record.title}"`,
    ref: { kind: 'article', id: record.id },
  })

  return { id: draftRec.id, text: preview }
}

// ── Write a fresh Substack article (one-shot, non-streamed — for internal/Telegram-triggered use;
// the web UI's live-streaming generate goes through the API route directly + registerArticleDraft) ──
async function writeArticle({ idx = null, topic = null, model = undefined, account = null, broadcast = null, telegramSendDraft = null, triggerLabel = '🖱 Manual' } = {}) {
  const acct = account || memory.accounts.getActiveAccount()
  let picked = topic
  if (!picked && idx != null) {
    const t = heronTopicsStore.getTopic(acct, idx)
    if (!t) throw new Error('heron.writeArticle: no topic at that index — run searchTopics first')
    picked = t.title || t.angle || t.snippet
  }
  if (!picked?.trim()) throw new Error('heron.writeArticle needs a topic or idx')

  log.info(`writeArticle: "${picked.slice(0, 60)}…"`)
  const gen = await articleWriter.generate({ topic: picked, model, account: acct, platform: 'substack' })

  const record = articlesStore.create({
    topic: picked, title: gen.title, text: gen.text, model: gen.modelId,
    sources: gen.sources, usage: gen.usage, cost: gen.cost, platform: 'substack',
    subtitle: gen.subtitle, subject: gen.subject, previewText: gen.previewText, imagePrompt: gen.imagePrompt,
  })

  const draft = await registerArticleDraft({ record, account: acct, broadcast, telegramSendDraft, triggerLabel })
  return { article: record, draft }
}

// ── Write Substack Notes — short posts tied to the user's content pillars/niche ───────────────
async function writeNote({ topic, count = 1, account = null, broadcast = null, telegramSendDraft = null, triggerLabel = '🖱 Manual' } = {}) {
  if (!topic?.trim()) throw new Error('heron.writeNote needs a topic')
  const acct = account || memory.accounts.getActiveAccount()

  const pillars = listPillars()
  const extraInstructions = pillars.length
    ? `Tie this to Souvik's content pillars/niche:\n${pillars.map(p => `- ${p.label}${p.notes ? ': ' + p.notes : ''}`).join('\n')}`
    : ''

  const result = await koel.write({
    format: 'note', input: topic, inputType: 'freetext', count,
    extraInstructions, origin: 'heron', platform: 'substack', account: acct,
    broadcast: null, meta: { kind: 'note' }, triggerLabel,
  })

  if (telegramSendDraft && result.draftRecords.length) {
    await telegramSendDraft(result.draftRecords, { header: `🦢 Substack Note${result.draftRecords.length > 1 ? 's' : ''}` })
  }

  return result
}

module.exports = { searchTopics, writeArticle, writeNote, registerArticleDraft, buildArticlePreview }
