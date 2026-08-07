require('dotenv').config()
const OpenAI = require('openai')
const raven = require('./raven')
const koel = require('./koel')
const articleWriter = require('./articleWriter')
const memory = require('../state/memory')
const articlesStore = require('../state/articlesStore')
const heronTopicsStore = require('../state/heronTopicsStore')
const researchStore = require('../state/researchStore')
const { listPillars } = require('../state/quillPillarsStore')
const activityStore = require('../state/activityStore')
const guard = require('../utils/llmGuard')
const G = require('../config/guardrails')
const costTracker = require('../utils/costTracker')
const logger = require('../utils/logger')
const log = logger.source('heron')

let _openai = null
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

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

// ── Write a Heron "mid-post" — a step up from a Note, ~80-120 words, one developed thought ────
async function writeMidPost({ topic, count = 1, account = null, broadcast = null, telegramSendDraft = null, triggerLabel = '🖱 Manual' } = {}) {
  if (!topic?.trim()) throw new Error('heron.writeMidPost needs a topic')
  const acct = account || memory.accounts.getActiveAccount()

  const pillars = listPillars()
  const extraInstructions = pillars.length
    ? `Tie this to Souvik's content pillars/niche:\n${pillars.map(p => `- ${p.label}${p.notes ? ': ' + p.notes : ''}`).join('\n')}`
    : ''

  const result = await koel.write({
    format: 'heronMid', input: topic, inputType: 'freetext', count,
    extraInstructions, origin: 'heron', platform: 'substack', account: acct,
    broadcast: null, meta: { kind: 'heronMid' }, triggerLabel,
  })

  if (telegramSendDraft && result.draftRecords.length) {
    await telegramSendDraft(result.draftRecords, { header: `🦢 Substack mid-post${result.draftRecords.length > 1 ? 's' : ''}` })
  }

  return result
}

// ── Daily topic assignment — 4 short (Note-length) + 2 mid topics, spanning self-help /
// achievement / ai-updates. Mirrors quill.js's assignTopics() shape. "achievement" topics are
// freetext (general observations on success/recognition/milestones — NOT Souvik's own story, no
// research link needed); "ai"/"self-help" prefer real research items when good candidates exist. ──
function fallbackDailyTopics(results) {
  const picks = (results || []).slice(0, 6).map(r => r.title).filter(Boolean)
  while (picks.length < 6) picks.push('a sharp, general take worth sharing today')
  return {
    short: picks.slice(0, 4).map(topic => ({ topic, category: 'ai' })),
    mid: picks.slice(4, 6).map(topic => ({ topic, category: 'ai' })),
  }
}

async function assignDailyTopics({ account = null } = {}) {
  const acct = account || memory.accounts.getActiveAccount()
  const research = researchStore.readLatest()
  const results = research?.results || []
  const top = results.slice(0, 15)
  const topList = top.length
    ? top.map((r, i) => `${i + 1}. [${r.source}] ${r.title}`).join('\n')
    : '(no fresh research available — use freetext angles for every topic)'

  const prompt = `You are a content strategist for Souvik — Indian engineer, kidney transplant survivor, 5 medals for India, AI/SaaS builder. You're picking today's Heron (Substack) topics.

Today's top ranked research:
${topList}

Pick 6 topics total for today's Substack drop — 4 SHORT posts (Note-length, 1-2 lines) and 2 MID posts (~100 words each). Return ONLY valid JSON:

{ "short": [{"topic":"...", "category":"self-help|achievement|ai"}, ...4 total], "mid": [{"topic":"...", "category":"self-help|achievement|ai"}, ...2 total] }

Rules:
- Span all three categories across the 6 topics:
  - self-help: discipline, mindset, habits, growth — raw and striking, not soft self-care fluff.
  - achievement: the psychology/practice of achievement, recognition, and milestones in general —
    freetext, does NOT need a research source. NOT Souvik's own story — a general observation or take
    on achievement as a topic (what actually drives it, common myths, how it's measured, etc.).
  - ai: AI/tech updates — pull from the research list above when a good candidate exists.
- Aim for roughly: short = 2 self-help + 1 achievement + 1 ai; mid = 1 self-help-or-achievement + 1 ai.
  Adjust only if the research doesn't support it.
- Each topic is a short, specific angle (one sentence) — not "write about AI" but the actual idea.
- None of these should be framed as Souvik's personal story or journey — every topic should read as a
  direct observation, insight, or take on the subject itself, not "in my experience..." narrative.`

  try {
    const response = await guard.runGuarded(() => getOpenAI().chat.completions.create(
      { model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.5, max_tokens: 700 },
      { maxRetries: G.MAX_RETRIES, timeout: G.TIMEOUT_MS },
    ))
    costTracker.priceAndRecord({ agent: 'heron', action: 'assign_daily_topics', modelId: 'openai/gpt-4o-mini', usage: response.usage })

    const raw = response.choices[0].message.content.trim()
    const match = raw.match(/\{[\s\S]*\}/)
    const parsed = JSON.parse(match ? match[0] : raw)
    const short = Array.isArray(parsed.short) ? parsed.short.filter(t => t?.topic).slice(0, 4) : []
    const mid = Array.isArray(parsed.mid) ? parsed.mid.filter(t => t?.topic).slice(0, 2) : []
    if (short.length < 4 || mid.length < 2) throw new Error(`assignDailyTopics: incomplete (short=${short.length}, mid=${mid.length})`)
    return { short, mid }
  } catch (err) {
    log.warn(`assignDailyTopics failed, using fallback: ${err.message}`)
    return fallbackDailyTopics(results)
  }
}

module.exports = { searchTopics, writeArticle, writeNote, writeMidPost, assignDailyTopics, registerArticleDraft, buildArticlePreview }
