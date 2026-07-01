require('dotenv').config()
const OpenAI = require('openai')
const koel = require('./koel')
const chitrag = require('./chitrag')
const { appendRun } = require('../state/quillStore')
const activityStore = require('../state/activityStore')
const { listArchive, readArchive, readLatest } = require('../state/researchStore')
const { listPillars } = require('../state/quillPillarsStore')
const sessionsStore = require('../state/quillSessionsStore')
const { buildPlanPrompt } = require('../prompts/quillPlan')
const { buildRefinePrompt } = require('../prompts/quillRefine')
const { buildArticlePrompt } = require('../prompts/quillArticle')
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

  const prompt = `You are a content strategist for Souvik — Indian engineer, kidney transplant survivor, 5 medals for India, AI/SaaS builder.

Today's top ranked content:
${topList}

Assign topics for today's X posts. Return ONLY valid JSON — exactly 5 items in EACH of the 3 sections:

{
  "motivational": ["prompt 1", "prompt 2", "prompt 3", "prompt 4", "prompt 5"],
  "domain": ["story 1", "story 2", "story 3", "story 4", "story 5"],
  "trending": ["topic 1", "topic 2", "topic 3", "topic 4", "topic 5"]
}

Rules:
- motivational: exactly 5 prompts, original freetext (NOT copied from list), philosophy/self-help/resilience angle
- domain: exactly 5 items from the list, span DIFFERENT domains (AI, startup, dev, wellness) — no overlap with trending
- trending: exactly 5 most time-sensitive/viral items, different from domain
- Balance: domain and trending should NOT all be AI — include startup, tech, wellness, dev`

  const response = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 900,
  })

  const raw = response.choices[0].message.content.trim()
  const match = raw.match(/\{[\s\S]*\}/)
  return JSON.parse(match ? match[0] : raw)
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
    assignments = {
      motivational: [
        'What a kidney transplant taught me about urgency and not wasting time',
        'Most people give up right before it gets good — how to tell the difference',
        'Stoicism: control what you can, release what you cannot — in practice',
        'High performance is unglamorous: the quiet accumulation of small daily acts',
        'Constraint as a forcing function — why finite energy makes you ship',
      ],
      domain: results.slice(0, 5).map(r => r.title),
      trending: results.slice(5, 10).map(r => r.title),
    }
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
      try {
        const result = await koel.write({
          format: fmt, input: topic, inputType: section === 'motivational' ? 'freetext' : 'topic', count: 1,
          origin: 'quill', meta: { section },
          extraInstructions: section === 'motivational' ? 'Write as a short crisp X post (max 260 chars). Personal, punchy, no hashtags.' : '',
        })
        const draft = result.drafts[0]
        const rec = result.draftRecords && result.draftRecords[0]
        if (rec) batch.push({ id: rec.id, text: draft, format: fmt })
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

  // 3 batches × 5 drafts: motivational, domain, trending
  await runBatchSection({ topics: assignments.motivational, section: 'motivational', header: 'Motivational', emoji: '✍️' })
  await runBatchSection({ topics: assignments.domain, section: 'domain', header: 'Domain', emoji: '🌐', formatFor: i => (i % 2 === 0 ? 'short' : 'longform') })
  await runBatchSection({ topics: assignments.trending, section: 'trending', header: 'Trending', emoji: '🔥' })

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
    summary: `${allDrafts.length} drafts (3 batches)`,
    ref: { kind: 'quill' },
  })
  log.info(`runDaily complete — ${allDrafts.length} drafts`)
  await tgSend(telegramSend, `✅ Done — ${allDrafts.length} drafts. Full posts in Quill tab.`)
  return output
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

    const r = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4, max_tokens: 600,
    })
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
    log.info(`Triggering fresh ChitraG run — ${reason}`)
    research = await chitrag.run({
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

  const res = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.4,
    max_tokens: 1500,
  })
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
        const research = await chitrag.run({
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

module.exports = { runDaily, runWeekly, planSuggestions, draftFromSuggestion, refineDraft, quickWrite }
