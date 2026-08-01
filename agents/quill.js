require('dotenv').config()
const OpenAI = require('openai')
const koel = require('./koel')
const raven = require('./raven')
const analyst = require('./analyst')
const { appendRun } = require('../state/quillStore')
const activityStore = require('../state/activityStore')
const guard = require('../utils/llmGuard')
const G = require('../config/guardrails')
const { listArchive, readArchive, readLatest } = require('../state/researchStore')
const { listPillars } = require('../state/quillPillarsStore')
const sessionsStore = require('../state/quillSessionsStore')
const { buildPlanPrompt } = require('../prompts/quillPlan')
const { buildRefinePrompt } = require('../prompts/quillRefine')
const { buildArticlePrompt } = require('../prompts/quillArticle')
const contentVolume = require('../config/contentVolume')
const articleWriter = require('./articleWriter')
const articlesStore = require('../state/articlesStore')
const articleIdeasStore = require('../state/articleIdeasStore')
const models = require('../config/models')
const costTracker = require('../utils/costTracker')
const memory = require('../state/memory')
const fs = require('fs')
const path = require('path')
const logger = require('../utils/logger')
const log = logger.source('quill')

let _openai = null
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function tgSend(telegramSend, text) {
  if (!telegramSend) return
  try { await telegramSend(text) } catch (e) { log.warn('Telegram send failed:', e.message) }
}

function splitMessage(text, limit = 4000) {
  const chunks = []
  while (text.length > limit) {
    let cut = text.lastIndexOf('\n', limit)
    if (cut < limit / 2) cut = limit
    chunks.push(text.slice(0, cut))
    text = text.slice(cut).trimStart()
  }
  if (text.length) chunks.push(text)
  return chunks
}

async function sendChunked(telegramSend, text) {
  for (const chunk of splitMessage(text)) await tgSend(telegramSend, chunk)
}

function istLabel(iso) {
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

// Truncate text for Telegram (domain longform → 280 chars teaser)
function telegramPreview(text, max = 280) {
  if (!text || text.length <= max) return text
  return text.slice(0, max).trimEnd() + '…\n_(full draft in Quill)_'
}

// ── Topic assignment ──────────────────────────────────────────────────────────

async function assignTopics(researchResults) {
  const top = (researchResults || []).slice(0, 15)
  const topList = top.map((r, i) => `${i + 1}. [${r.source}] ${r.title}`).join('\n')

  const n = contentVolume.posts.count   // number of punch posts for today's batch (configurable)
  const example = `[${Array.from({ length: n }, (_, i) => `"topic ${i + 1}"`).join(', ')}]`

  const prompt = `You are a content strategist for Souvik — Indian engineer, kidney transplant survivor, 5 medals for India, AI/SaaS builder.

Today's top ranked content:
${topList}

Pick ${n} topics for today's X posts — each will become a short, punchy, viral one-liner (not a
personal story, not long-form). Return ONLY valid JSON:

{ "topics": ${example} }

Rules:
- Span DIFFERENT domains — AI, startup, dev, wellness, AND self-help/personal-development. At least 1-2
  of the ${n} topics must be self-help/personal-development (discipline, mindset, habits, growth) — raw,
  striking, not soft self-care fluff. Should NOT all be AI.
- If none of the items above are genuinely self-help/personal-development, you may propose one general
  self-help/personal-development angle yourself (it doesn't need to tie back to the list) — this
  category is required every day regardless of what's in today's research.
- Pick items that land in ONE punchy, single-idea hit — a sharp take or contrarian angle works better than a story`

  const response = await guard.runGuarded(() => getOpenAI().chat.completions.create(
    { model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.3, max_tokens: 600 },
    { maxRetries: G.MAX_RETRIES, timeout: G.TIMEOUT_MS },
  ))
  costTracker.priceAndRecord({ agent: 'quill', action: 'assign_topics', modelId: 'openai/gpt-4o-mini', usage: response.usage })

  const raw = response.choices[0].message.content.trim()
  const match = raw.match(/\{[\s\S]*\}/)
  return JSON.parse(match ? match[0] : raw)
}

// Match a batch topic string back to the research item it came from, so drafts can carry
// research provenance (url/source/rank) for the future Raven feedback loop. Title-based since
// assignTopics returns bare strings. Returns null for original (motivational) topics.
function matchResearchItem(topic, results) {
  if (!topic || !results?.length) return null
  const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()
  const t = norm(topic)
  if (!t) return null
  return results.find(r => norm(r.title) === t)
      || results.find(r => { const rt = norm(r.title); return rt && (rt.includes(t) || t.includes(rt)) })
      || null
}

// ── Daily run ─────────────────────────────────────────────────────────────────

async function runDaily({ research, broadcast, telegramSend, telegramSendDraft = null, triggerLabel = '🖱 Manual' } = {}) {
  const results = research?.results || []
  if (!results.length) {
    log.warn('runDaily: no research results')
    await tgSend(telegramSend, '⚠️ Quill: No research data. Run /research first.')
    return null
  }

  const runAt = new Date().toISOString()
  log.info(`runDaily starting — ${results.length} items`)
  if (broadcast) broadcast({ type: 'quill_progress', data: { step: 'assigning_topics' } })

  // Step 1: Assign topics
  let assignments
  try {
    assignments = await assignTopics(results)
  } catch (err) {
    log.error('Topic assignment failed — using fallback', err)
    const n = contentVolume.posts.count
    assignments = { topics: results.slice(0, n).map(r => r.title) }
  }

  // Step 2: Build sources section (top 8 ranked items with links)
  const topSources = results.slice(0, 8).map(r => ({
    title: r.title,
    url: r.url,
    source: r.source,
    score: r.trendingScore,
  }))

  // Step 3: Viral X post links (Twitter source items only)
  const viralXLinks = results
    .filter(r => r.source === 'twitter' && r.url?.includes('twitter.com') || r.url?.includes('x.com'))
    .slice(0, 5)
    .map(r => ({ title: r.title, url: r.url }))

  const allDrafts = []

  // Generate a section's drafts, then deliver them as ONE Telegram batch (short header + the drafts
  // with their buttons). Keeps Telegram to: 1 header + N draft messages per batch — no chatter.
  async function runBatchSection({ topics, section, header, emoji, formatFor }) {
    if (broadcast) broadcast({ type: 'quill_progress', data: { step: `writing_${section}` } })
    const batch = []
    for (let i = 0; i < topics.length; i++) {
      const topic = topics[i]
      if (!topic) continue
      const fmt = formatFor ? formatFor(i) : 'short'
      const item = matchResearchItem(topic, results)
      const provenance = item
        ? { researchUrl: item.url, researchSource: item.source, researchRank: item.rank, researchRunId: research?.runId }
        : {}
      try {
        const result = await koel.write({
          format: fmt, input: topic, inputType: 'topic', count: 1,
          origin: 'quill', meta: { section, ...provenance },
        })
        const draft = result.drafts[0]
        const rec = result.draftRecords && result.draftRecords[0]
        // Flag (don't block) short-form drafts that slipped past the 280-char target — surfaced only
        // in the Telegram message header line (auto-stripped by telegram.js's stripHeader for
        // Copy/Approve/Edit), never in the stored draft text.
        const warn = (fmt === 'short' || fmt === 'punch') && draft.length > 280 ? `⚠️ ${draft.length}/280` : undefined
        if (rec) batch.push({ id: rec.id, text: draft, format: fmt, warn })
        allDrafts.push({ section, label: `${header} ${i + 1}`, format: fmt, topic: String(topic).slice(0, 100), text: draft, generatedAt: new Date().toISOString() })
      } catch (err) { log.error(`${header} ${i + 1} failed`, err) }
    }
    if (telegramSendDraft && batch.length) {
      await telegramSendDraft(batch, { header: `${emoji} ${header} — ${batch.length} drafts` })
    } else {
      for (const d of batch) await tgSend(telegramSend, d.text)
    }
    return batch.length
  }

  // Single batch: 4 punch posts (raw, hook-driven one-liners). Long-form dropped from the automated
  // drop — still available on-demand via the Koel page / Quill planner.
  await runBatchSection({ topics: assignments.topics, section: 'punch', header: 'Punch posts', emoji: '⚡', formatFor: () => 'punch' })

  // Top sources + viral X links are kept in the run output (web dashboard) but NOT spammed to Telegram.

  const output = {
    generatedAt: runAt,
    runLabel: istLabel(runAt),
    assignments,
    drafts: allDrafts,
    totalDrafts: allDrafts.length,
    topSources,
    viralXLinks,
  }

  appendRun(output)
  if (broadcast) broadcast({ type: 'quill_complete', data: output })
  activityStore.recordAndBroadcast(broadcast, {
    agent: 'quill', action: 'daily_batch', triggerLabel,
    summary: `${allDrafts.length} punch drafts`,
    ref: { kind: 'quill' },
  })
  log.info(`runDaily complete — ${allDrafts.length} drafts`)
  await tgSend(telegramSend, `✅ Done — ${allDrafts.length} drafts. Full posts in Quill tab.`)
  return output
}

// ── Value-add quote-reposts ─────────────────────────────────────────────────────
// Picks the top viral X posts already in the latest research (no new search) and drafts a
// value-add quote-repost comment for each. Draft-only; delivered to Telegram with action buttons.
// A watchlist entry can be a bare handle ("garyvee") or a full profile link
// ("https://x.com/garyvee") — normalize both down to a lowercase bare handle for matching.
function normalizeHandle(v) {
  if (!v) return ''
  const s = String(v).trim()
  const m = s.match(/(?:twitter|x)\.com\/([A-Za-z0-9_]+)/i)
  return (m ? m[1] : s.replace(/^@/, '')).toLowerCase()
}

async function runReposts({ research = null, count = null, account = null, broadcast = null, telegramSend = null, telegramSendDraft = null, triggerLabel = '🖱 Manual' } = {}) {
  const n = count || contentVolume.reposts.perDay
  const results = (research && research.results) || (readLatest() && readLatest().results) || []
  const acct = account || memory.accounts.getActiveAccount()
  const watchlist = new Set((memory.getProfile(acct)?.watchlist || []).map(normalizeHandle).filter(Boolean))

  // Viral X posts from the research (twitter source) — watchlist authors first, then most engaged.
  const candidates = results.filter(r => r.source === 'twitter' && r.url)
  const isWatched = r => watchlist.has(normalizeHandle(r.publisher))
  const byEngagement = (a, b) => (b.engagement || 0) - (a.engagement || 0)
  const viral = [
    ...candidates.filter(isWatched).sort(byEngagement),
    ...candidates.filter(r => !isWatched(r)).sort(byEngagement),
  ].slice(0, n)
  if (!viral.length) {
    await tgSend(telegramSend, '⚠️ No viral X posts in the latest research to repost. Run /research first.')
    return { drafts: [], draftRecords: [] }
  }

  const batch = []
  for (const item of viral) {
    try {
      const sourceText = `${item.title || ''}${item.snippet ? ' — ' + item.snippet : ''}`.trim()
      const res = await koel.draftRepost({ sourceText, author: item.publisher || '', url: item.url, broadcast: null, triggerLabel })
      const rec = res.draftRecords && res.draftRecords[0]
      if (rec) batch.push({ id: rec.id, text: res.drafts[0], format: 'repost' })
    } catch (err) { log.error('repost draft failed', err) }
  }

  activityStore.recordAndBroadcast(broadcast, {
    agent: 'repost', action: 'reposts', triggerLabel,
    summary: `${batch.length} quote-repost drafts`, ref: { kind: 'koel' },
  })
  if (telegramSendDraft && batch.length) {
    await telegramSendDraft(batch, { header: `🔁 Quote-reposts — ${batch.length} drafts (comment + link, ready to quote-tweet)` })
  } else {
    for (const d of batch) await tgSend(telegramSend, d.text)
  }
  if (broadcast) broadcast({ type: 'koel_complete', data: { format: 'repost', drafts: batch.map(b => b.text), draftRecords: batch.map(b => ({ id: b.id, text: b.text })) } })
  log.info(`runReposts complete — ${batch.length} drafts`)
  return { drafts: batch.map(b => b.text), draftRecords: batch.map(b => ({ id: b.id, text: b.text })) }
}

// ── Article idea picker → auto-write ────────────────────────────────────────────
// Generate N article angles from the latest research (no new search), each tied to a source item so
// the article can be written from the SAME run. Persists to articleIdeasStore; returns the ideas.
async function suggestArticleIdeas({ research = null, count = null, broadcast = null } = {}) {
  const n = count || contentVolume.articleIdeas.count
  const results = (research && research.results) || (readLatest() && readLatest().results) || []
  const runId = (research && research.runId) || (readLatest() && readLatest().runId) || null
  if (!results.length) return []

  const top = results.slice(0, 20)
  const topList = top.map((r, i) => `${i + 1}. ${r.title} [${r.source}]`).join('\n')
  const prompt = `Content strategist for Souvik — Indian engineer, transplant survivor, AI SaaS builder.

Today's top stories (numbered):
${topList}

Suggest ${n} long-form article angles worth writing, each grounded in ONE of the stories above.
Return ONLY JSON:
[{ "title": "punchy article title", "angle": "one-line pitch", "sourceIndex": 3 }]  // sourceIndex = the story number`

  let raw = []
  try {
    const r = await guard.runGuarded(() => getOpenAI().chat.completions.create(
      { model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.4, max_tokens: 700 },
      { maxRetries: G.MAX_RETRIES, timeout: G.TIMEOUT_MS },
    ))
    costTracker.priceAndRecord({ agent: 'quill', action: 'article_ideas', modelId: 'openai/gpt-4o-mini', usage: r.usage })
    const txt = r.choices[0].message.content.trim()
    const m = txt.match(/\[[\s\S]*\]/)
    raw = JSON.parse(m ? m[0] : txt)
  } catch (err) { log.error('suggestArticleIdeas failed', err); return [] }
  if (!Array.isArray(raw)) return []

  const ideas = raw.slice(0, n).map((x, i) => {
    const src = top[(parseInt(x.sourceIndex) || 0) - 1] || null
    return {
      idx: i, title: String(x.title || '').trim() || 'Untitled', angle: String(x.angle || '').trim(),
      url: src?.url || '', snippet: src?.snippet || '', source: src?.source || '',
    }
  }).filter(x => x.title)

  articleIdeasStore.save(null, ideas, { researchRunId: runId })
  activityStore.recordAndBroadcast(broadcast, {
    agent: 'quill', action: 'article_ideas', triggerLabel: '🖱 Ideas',
    summary: `${ideas.length} article ideas`, ref: { kind: 'quill' },
  })
  return ideas
}

// Write the full article for a chosen idea, in the background, reusing the day's research (no new search).
// Saves to articlesStore (versioned) and returns { id, title, words, cost }.
async function writeArticleFromIdea({ idx, broadcast = null } = {}) {
  const idea = articleIdeasStore.getIdea(null, idx)
  if (!idea) throw new Error('article idea not found (list may have refreshed)')
  const results = (readLatest() && readLatest().results) || []
  const related = results.slice(0, 6)
  // Make sure the idea's own source item is in the citation pool.
  if (idea.url && !related.find(r => r.url === idea.url)) {
    related.unshift({ title: idea.title, url: idea.url, snippet: idea.snippet, source: idea.source })
  }
  const topic = idea.angle ? `${idea.title} — ${idea.angle}` : idea.title
  const modelId = models.articleDefaultModel()

  const rec = articlesStore.create({ topic: idea.title, title: idea.title, text: '', model: modelId })
  const result = await articleWriter.generate({ topic, model: modelId, relatedItems: related })
  articlesStore.updateLatestVersion(rec.id, {
    text: result.text, usage: result.usage, cost: result.cost, sources: result.sources,
    model: result.modelId, title: result.title,
  })
  const words = (result.text || '').split(/\s+/).filter(Boolean).length
  activityStore.recordAndBroadcast(broadcast, {
    agent: 'article', action: 'write', triggerLabel: '📱 Article (idea)',
    summary: `${words} words · ${(result.sources || []).length} sources${result.cost != null ? ' · $' + result.cost.toFixed(4) : ''}`,
    ref: { kind: 'article', id: rec.id },
  })
  if (broadcast) broadcast({ type: 'article_saved', data: { id: rec.id, title: result.title } })
  log.info(`writeArticleFromIdea complete — "${result.title}" (${words} words), id ${rec.id}`)
  return { id: rec.id, title: result.title, words, cost: result.cost }
}

// Write a full article for an arbitrary topic (a natural-language "write an article" request routed here
// by Titto). Runs a targeted search on the topic (Souvik asked to "search + write"), saves to
// articlesStore — so it shows in the Writer/Article section — and streams article_* events so the web
// Writer renders it live. This is the ONLY article path for free-text requests; Koel is never used.
// Returns { id, title, words, cost }.
async function writeArticleFromTopic({ topic, extraInstructions = '', broadcast = null } = {}) {
  const cleanTopic = String(topic || '').trim()
  if (!cleanTopic) throw new Error('writeArticleFromTopic: topic required')
  const angle = String(extraInstructions || '').trim()
  const fullTopic = angle ? `${cleanTopic} — ${angle}` : cleanTopic
  const modelId = models.articleDefaultModel()

  const rec = articlesStore.create({ topic: cleanTopic, title: cleanTopic, text: '', model: modelId })
  if (broadcast) broadcast({ type: 'article_start', data: { id: rec.id, title: cleanTopic, mode: 'generate' } })
  try {
    const result = await articleWriter.generate({
      topic: fullTopic, model: modelId,
      onToken: broadcast ? (delta) => broadcast({ type: 'article_token', data: { id: rec.id, delta } }) : null,
    })
    articlesStore.updateLatestVersion(rec.id, {
      text: result.text, usage: result.usage, cost: result.cost, sources: result.sources,
      model: result.modelId, title: result.title,
    })
    const words = (result.text || '').split(/\s+/).filter(Boolean).length
    if (broadcast) broadcast({ type: 'article_done', data: {
      id: rec.id, version: 1, title: result.title, text: result.text,
      sources: result.sources, usage: result.usage, cost: result.cost, model: result.modelId,
    } })
    activityStore.recordAndBroadcast(broadcast, {
      agent: 'article', action: 'write', triggerLabel: '💬 Article (topic)',
      summary: `${words} words · ${(result.sources || []).length} sources${result.cost != null ? ' · $' + result.cost.toFixed(4) : ''}`,
      ref: { kind: 'article', id: rec.id },
    })
    log.info(`writeArticleFromTopic complete — "${result.title}" (${words} words), id ${rec.id}`)
    return { id: rec.id, title: result.title, words, cost: result.cost }
  } catch (err) {
    if (broadcast) broadcast({ type: 'article_error', data: { id: rec.id, message: err.message } })
    log.error('writeArticleFromTopic failed', err)
    throw err
  }
}

// ── Weekly run ────────────────────────────────────────────────────────────────

async function runWeekly({ broadcast, telegramSend, triggerLabel = '🖱 Manual' } = {}) {
  log.info('runWeekly starting')
  const runAt = new Date().toISOString()

  const archive = listArchive()
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const allResults = [], githubResults = []

  for (const a of archive) {
    const entry = readArchive(a.file)
    if (!entry?.rankedAt || new Date(entry.rankedAt).getTime() < sevenDaysAgo) continue
    if (!entry.results) continue
    allResults.push(...entry.results)
    githubResults.push(...entry.results.filter(r => r.source === 'github'))
  }

  const seen = new Set()
  const unique = allResults.filter(r => { if (seen.has(r.url)) return false; seen.add(r.url); return true })
  const uniqueGh = githubResults.filter((r, i, arr) => arr.findIndex(x => x.url === r.url) === i)

  await tgSend(telegramSend, `📅 *Quill — Weekly Wrap* · ${istLabel(runAt)}`)

  let ideas = []
  try {
    const topList = unique.slice(0, 20).map((r, i) => `${i + 1}. ${r.title} [${r.source}]`).join('\n')
    const prompt = `Content strategist for Souvik — Indian engineer, transplant survivor, 5 medals for India, AI SaaS builder.

This week's top stories:
${topList}

Suggest 4 long-form article angles that would go viral on X. Actionable or story-driven.
Return ONLY JSON:
[{ "title": "...", "angle": "One line pitch", "whyViral": "Why this gets shares" }]`

    const r = await guard.runGuarded(() => getOpenAI().chat.completions.create(
      { model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.4, max_tokens: 600 },
      { maxRetries: G.MAX_RETRIES, timeout: G.TIMEOUT_MS },
    ))
    costTracker.priceAndRecord({ agent: 'quill', action: 'weekly_ideas', modelId: 'openai/gpt-4o-mini', usage: r.usage })
    const raw = r.choices[0].message.content.trim()
    const match = raw.match(/\[[\s\S]*\]/)
    ideas = JSON.parse(match ? match[0] : raw)
  } catch (err) { log.error('Long-form ideas failed', err) }

  if (ideas.length) {
    const lines = ideas.map((x, i) => `${i + 1}. *${x.title}*\n_${x.angle}_`).join('\n\n')
    await sendChunked(telegramSend, `📝 *Weekly Long-Form Ideas*\n\n${lines}`)
  }

  if (uniqueGh.length) {
    const ghText = uniqueGh.slice(0, 8).map(r => `${r.title}: ${r.snippet || r.summary || ''}`).join('\n')
    try {
      const result = await koel.write({
        format: 'thread', input: `GitHub trending this week:\n${ghText}`,
        inputType: 'freetext', count: 1, origin: 'quill',
        extraInstructions: 'Summarise most interesting GitHub repos that trended. Why each matters.',
      })
      await sendChunked(telegramSend, `🐙 *GitHub Weekly Wrap*\n\n${result.drafts[0]}`)
    } catch (err) { log.error('GitHub wrap failed', err) }
  }

  // Refresh learned insights from the week's approvals/rejections + any pasted performance, then nudge
  // Souvik to feed this week's numbers so the loop keeps sharpening. Was previously only wired up when
  // this ran on the (now-deactivated) automatic Sunday schedule — moved here so it fires the same way
  // whether triggered by a schedule or manually (POST /api/quill/weekly).
  try { await analyst.analyze({ broadcast }) } catch (e) { log.error('weekly analyze failed', e) }
  await tgSend(telegramSend, '📊 *Weekly performance loop*\nPaste your top 3 and bottom 3 tweets from this week (text + impressions/likes/replies) with:\n`/perf <paste here>`\nThen run `/learned` to see what I picked up.')

  if (broadcast) broadcast({ type: 'quill_weekly_complete', data: { ideas, generatedAt: runAt } })
  activityStore.recordAndBroadcast(broadcast, {
    agent: 'quill', action: 'weekly', triggerLabel,
    summary: `${ideas.length} long-form ideas`,
    ref: { kind: 'quill' },
  })
  log.info('runWeekly complete')
}

// ── Pillar-based search-first planner ────────────────────────────────────────

// Format → Koel format + display label + length rule for extraInstructions
const FORMAT_MAP = {
  long:    { koel: 'longform', label: 'Long-form', lengthRule: 'LENGTH: 400–900 characters, one cohesive single post. Personal/build-in-public voice. Line breaks every 1–2 sentences.' },
  thread:  { koel: 'thread',   label: 'Thread',    lengthRule: 'THREAD LENGTH: strictly 3–5 tweets total. No more than 5. Number each "Tweet 1/", "Tweet 2/" etc.' },
  medium:  { koel: 'short',    label: 'Medium',    lengthRule: 'LENGTH: 150–260 characters. Punchy single post, slightly longer than a one-liner.' },
  short:   { koel: 'short',    label: 'Short',     lengthRule: 'LENGTH: max 280 characters. Hook in line 1. Punchy close.' },
  article: { koel: 'longform', label: 'X Article', lengthRule: '(see ARTICLE template — extraInstructions carries the full template + citation rules)' },
}

const ARTICLE_TEMPLATE_PATH = path.join(__dirname, '..', 'sub-agents', 'quill', 'ARTICLE_TEMPLATE.md')
const KOEL_VIRAL_LONGFORM_PATH = path.join(__dirname, '..', 'sub-agents', 'koel', 'Viral_long_form_template.txt')

function loadArticleTemplate() {
  try {
    if (fs.existsSync(ARTICLE_TEMPLATE_PATH)) return fs.readFileSync(ARTICLE_TEMPLATE_PATH, 'utf8')
  } catch (_) {}
  log.warn('ARTICLE_TEMPLATE.md missing — falling back to Koel viral_longform template')
  try {
    if (fs.existsSync(KOEL_VIRAL_LONGFORM_PATH)) return fs.readFileSync(KOEL_VIRAL_LONGFORM_PATH, 'utf8')
  } catch (_) {}
  return ''
}

// Step 1: search trending + match items to pillars (1 LLM call, no Koel)
async function planSuggestions({ broadcast = null, forceFresh = false, triggerLabel = '🖱 Plan button' } = {}) {
  const pillars = listPillars()
  if (!pillars.length) {
    throw new Error('No content pillars defined. Add at least one pillar in sub-agents/quill/PILLARS.md before planning.')
  }

  log.info(`planSuggestions starting — ${pillars.length} pillars${forceFresh ? ' (forceFresh)' : ''}`)
  if (broadcast) broadcast({ type: 'quill_progress', data: { step: 'fetching_trending' } })

  // Decide whether to use cached research or fetch fresh.
  // Fresh fetch when: forceFresh OR no research OR research older than STALE_HOURS.
  const STALE_HOURS = 4
  let research = readLatest()
  const researchTs = research?.rankedAt ? new Date(research.rankedAt).getTime() : 0
  const ageHours = researchTs ? (Date.now() - researchTs) / 3600000 : Infinity
  const isStale = ageHours > STALE_HOURS

  if (forceFresh || !research?.results?.length || isStale) {
    const reason = forceFresh
      ? 'forceFresh requested'
      : !research?.results?.length
        ? 'no prior research'
        : `research is ${ageHours.toFixed(1)}h old (>${STALE_HOURS}h threshold)`
    log.info(`Triggering fresh Raven run — ${reason}`)
    research = await raven.run({
      triggeredBy: 'quill-plan',
      triggerLabel: '🪶 Quill · plan',
      broadcast: null,
      forceRefetch: forceFresh,
    })
  } else {
    log.info(`Reusing cached research (${ageHours.toFixed(1)}h old, under ${STALE_HOURS}h threshold)`)
  }
  const trendingItems = research?.results || []

  if (broadcast) broadcast({ type: 'quill_progress', data: { step: 'matching_pillars' } })
  const prompt = buildPlanPrompt({ pillars, trendingItems })

  const res = await guard.runGuarded(() => getOpenAI().chat.completions.create(
    { model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.4, max_tokens: 1500 },
    { maxRetries: G.MAX_RETRIES, timeout: G.TIMEOUT_MS },
  ))
  costTracker.priceAndRecord({ agent: 'quill', action: 'plan', modelId: 'openai/gpt-4o-mini', usage: res.usage })
  const raw = res.choices[0].message.content.trim()
  const m = raw.match(/\{[\s\S]*\}/)
  let suggestions
  try {
    suggestions = JSON.parse(m ? m[0] : raw)?.suggestions || []
  } catch (e) {
    log.error('Suggestions JSON parse failed', e)
    throw new Error('Quill could not pick suggestions — LLM returned invalid JSON.')
  }

  const pillarLabels = pillars.map(p => p.label)
  const sessionId = sessionsStore.createSession({ triggerLabel, pillars: pillarLabels, suggestions })

  const output = {
    generatedAt: new Date().toISOString(),
    kind: 'suggestions',
    sessionId,
    triggerLabel,
    pillars: pillarLabels,
    suggestions,
    totalSuggestions: suggestions.reduce((n, s) => n + (s.items?.length || 0), 0),
  }

  appendRun(output)
  if (broadcast) broadcast({ type: 'quill_suggestions_complete', data: output })
  activityStore.recordAndBroadcast(broadcast, {
    agent: 'quill', action: 'plan', triggerLabel: triggerLabel || '🖱 Plan button',
    summary: `${output.totalSuggestions} suggestions · ${suggestions.length} pillars`,
    ref: { kind: 'quill' },
  })
  log.info(`planSuggestions complete — session=${sessionId}, ${suggestions.length} pillar groups, ${output.totalSuggestions} items`)
  return output
}

// Step 2: write a single draft from a chosen suggestion + format (1 Koel call)
async function draftFromSuggestion({ suggestion, format, broadcast = null, sessionId = null, sid = null } = {}) {
  if (!suggestion?.title) throw new Error('draftFromSuggestion: suggestion.title required')
  const fmtKey = (format || 'short').toLowerCase()
  const fmt = FORMAT_MAP[fmtKey]
  if (!fmt) throw new Error(`Unknown format: ${format}. Use: long, thread, medium, short.`)

  log.info(`draftFromSuggestion — pillar: "${suggestion.pillar}", format: ${fmtKey}, title: "${suggestion.title?.slice(0, 60)}"`)
  if (broadcast) broadcast({ type: 'quill_progress', data: { step: `writing_${fmtKey}` } })

  let briefInput, extraInstructions
  if (fmtKey === 'article') {
    // Article-mode: research similar articles first, then build the prompt
    const topicQuery = (suggestion.title || suggestion.angle || '').trim()
    let relatedItems = []
    if (topicQuery) {
      if (broadcast) broadcast({ type: 'quill_progress', data: { step: 'researching_similar' } })
      log.info(`Article research — searching for similar content on "${topicQuery.slice(0, 60)}"`)
      try {
        const research = await raven.run({
          triggeredBy: 'quill-article-research',
          triggerLabel: `🪶 Quill · article research · "${topicQuery.slice(0, 40)}"`,
          searchQuery: topicQuery,
          broadcast: null,
        })
        relatedItems = (research?.results || []).slice(0, 6)
        log.info(`Article research found ${relatedItems.length} related items`)
      } catch (err) {
        log.warn(`Article research failed (proceeding without): ${err.message}`)
      }
    }

    if (broadcast) broadcast({ type: 'quill_progress', data: { step: 'writing_article' } })
    const template = loadArticleTemplate()
    extraInstructions = buildArticlePrompt({ suggestion, template, userOverride: '', relatedItems })
    briefInput = `(Article brief, related research, and all rules are in the instructions above. Write the article per those rules.)`
  } else {
    briefInput = [
      suggestion.title,
      suggestion.angle ? `\nAngle: ${suggestion.angle}` : '',
      suggestion.snippet ? `\nContext: ${suggestion.snippet}` : '',
      suggestion.url ? `\nSource: ${suggestion.url}` : '',
    ].filter(Boolean).join('\n')
    extraInstructions = `Write this as a ${fmt.label} post for the "${suggestion.pillar}" pillar. Lead with the angle: ${suggestion.angle || suggestion.title}. ${suggestion.url ? 'Weave in the source naturally (URL at end is fine).' : ''} ${fmt.lengthRule}`
  }

  const result = await koel.write({
    format: fmt.koel,
    input: briefInput,
    inputType: 'freetext',
    count: 1,
    extraInstructions,
  })

  const generatedAt = new Date().toISOString()
  const uid = 'qd-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)
  const draftRecord = {
    uid,
    sid: sid || null,
    format: fmtKey,
    formatLabel: fmt.label,
    pillar: suggestion.pillar,
    title: suggestion.title,
    text: result.drafts[0],
    sources: suggestion.url ? [suggestion.url] : [],
    generatedAt,
    edited: false,
  }
  if (sessionId) {
    const saved = sessionsStore.appendDraft(sessionId, draftRecord)
    if (!saved) log.warn(`appendDraft: session ${sessionId} not found — draft not persisted`)
  }

  return {
    uid,
    draft: result.drafts[0],
    format: fmtKey,
    formatLabel: fmt.label,
    pillar: suggestion.pillar,
    title: suggestion.title,
    sources: suggestion.url ? [suggestion.url] : [],
    generatedAt,
  }
}

// Step 3: refine an existing draft per a user instruction (1 Koel call)
async function refineDraft({ draftText, instruction, format = 'short', broadcast = null, sessionId = null, draftUid = null } = {}) {
  if (!draftText?.trim()) throw new Error('refineDraft: draftText required')
  if (!instruction?.trim()) throw new Error('refineDraft: instruction required')
  const fmtKey = (format || 'short').toLowerCase()
  const fmt = FORMAT_MAP[fmtKey] || FORMAT_MAP.short

  log.info(`refineDraft — format: ${fmtKey}, instruction: "${instruction.slice(0, 60)}"`)
  if (broadcast) broadcast({ type: 'quill_progress', data: { step: 'refining' } })

  // Koel's user prompt is what becomes the LLM input. We bypass Koel's normal format guide
  // by sending the whole refine prompt as input + a strong extraInstructions override.
  const refinePrompt = buildRefinePrompt({ draftText, instruction, format: fmtKey })
  const result = await koel.write({
    format: fmt.koel,
    input: refinePrompt,
    inputType: 'freetext',
    count: 1,
    extraInstructions: `This is a REFINEMENT request. Follow the instruction at the top of the input EXACTLY. Output ONLY the rewritten post — no preamble, no "DRAFT" separators, no explanation.`,
  })

  const newText = result.drafts[0]
  if (sessionId && draftUid) {
    const updated = sessionsStore.updateDraft(sessionId, draftUid, { text: newText, edited: true })
    if (!updated) log.warn(`refineDraft: session=${sessionId} draft=${draftUid} not found — not persisted`)
  }

  return {
    draft: newText,
    format: fmtKey,
    generatedAt: new Date().toISOString(),
  }
}

// Quick chat-driven draft: bypasses pillar matching, writes straight from a topic.
// Persists to history so it shows up in scheduled-history view alongside other drafts.
async function quickWrite({ topic, format = 'medium', broadcast = null } = {}) {
  if (!topic?.trim()) throw new Error('quickWrite: topic required')
  const fmtKey = (format || 'medium').toLowerCase()
  if (!FORMAT_MAP[fmtKey]) throw new Error(`Unknown format: ${format}. Use: long, thread, medium, short.`)

  log.info(`quickWrite — format: ${fmtKey}, topic: "${topic.slice(0, 60)}"`)
  const suggestion = {
    pillar: 'Chat (quick)',
    title: topic,
    snippet: '',
    angle: topic,
    url: '',
  }
  const result = await draftFromSuggestion({ suggestion, format: fmtKey, broadcast })

  appendRun({
    generatedAt: result.generatedAt,
    kind: 'quick',
    via: 'titto-chat',
    topic,
    format: fmtKey,
    formatLabel: result.formatLabel,
    pillar: 'Chat (quick)',
    drafts: [{ format: fmtKey, formatLabel: result.formatLabel, pillar: 'Chat (quick)', title: topic, text: result.draft, generatedAt: result.generatedAt }],
    totalDrafts: 1,
  })
  return result
}

module.exports = { runDaily, runReposts, suggestArticleIdeas, writeArticleFromIdea, writeArticleFromTopic, runWeekly, planSuggestions, draftFromSuggestion, refineDraft, quickWrite }
