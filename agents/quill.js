require('dotenv').config()
const OpenAI = require('openai')
const koel = require('./koel')
const { appendRun } = require('../state/quillStore')
const { listArchive, readArchive } = require('../state/researchStore')
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

Assign topics for today's X posts. Return ONLY valid JSON — balanced across all 3 sections:

{
  "motivational": [
    "Short freetext prompt for a crisp motivational/self-help/philosophy post — tie to Souvik's real story OR a universal mindset/stoic/philosophy lesson",
    "Prompt 2",
    "Prompt 3"
  ],
  "domain": [
    "Best AI/tech story from the list — exact title or close paraphrase",
    "Best startup/business story",
    "Best dev tools or research story",
    "Best wellness/productivity story if available"
  ],
  "trending": [
    "Most viral/discussed topic from the list — prioritise Twitter/HN/Reddit sources",
    "2nd trending",
    "3rd trending",
    "4th trending"
  ]
}

Rules:
- motivational: exactly 3 prompts, original freetext (NOT copied from list), philosophy/self-help/resilience angle
- domain: 3-4 items from the list, span DIFFERENT domains (AI, startup, dev, wellness) — no overlap with trending
- trending: 3-4 most time-sensitive/viral items, different from domain
- Balance: domain and trending should NOT all be AI — include startup, tech, wellness, dev`

  const response = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 600,
  })

  const raw = response.choices[0].message.content.trim()
  const match = raw.match(/\{[\s\S]*\}/)
  return JSON.parse(match ? match[0] : raw)
}

// ── Daily run ─────────────────────────────────────────────────────────────────

async function runDaily({ research, broadcast, telegramSend } = {}) {
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
        'Most people give up right before it gets good — here is how to tell the difference',
        'Stoicism says: control what you can, release what you cannot — here is what that means in practice',
      ],
      domain: results.slice(0, 4).map(r => r.title),
      trending: results.slice(4, 8).map(r => r.title),
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

  await tgSend(telegramSend, `🪶 *Quill — ${istLabel(runAt)}*\nWriting your daily drafts\\.\\.\\.`)

  const allDrafts = []

  // ── A: Motivational (short crisp X posts) ────────────────────────────────
  if (broadcast) broadcast({ type: 'quill_progress', data: { step: 'writing_motivational' } })
  for (let i = 0; i < assignments.motivational.length; i++) {
    const prompt = assignments.motivational[i]
    try {
      const result = await koel.write({ format: 'short', input: prompt, inputType: 'freetext', count: 1,
        extraInstructions: 'Write as a short crisp X post (max 260 chars). Personal, punchy, no hashtags.' })
      const draft = result.drafts[0]
      const generatedAt = new Date().toISOString()
      await tgSend(telegramSend, `✍️ *Motivational ${i + 1}*\n\n${draft}`)
      allDrafts.push({ section: 'motivational', label: `Motivational ${i + 1}`, topic: prompt.slice(0, 100), text: draft, generatedAt })
    } catch (err) { log.error(`Motivational ${i + 1} failed`, err) }
  }

  // ── B: Domain posts (balanced across domains) ────────────────────────────
  if (broadcast) broadcast({ type: 'quill_progress', data: { step: 'writing_domain' } })
  for (let i = 0; i < assignments.domain.length; i++) {
    const topic = assignments.domain[i]
    if (!topic) continue
    // Alternate short/longform — but only send preview to Telegram for longform
    const fmt = i % 2 === 0 ? 'short' : 'longform'
    try {
      const result = await koel.write({ format: fmt, input: topic, inputType: 'topic', count: 1 })
      const draft = result.drafts[0]
      const generatedAt = new Date().toISOString()
      const tgText = `🌐 *Domain ${i + 1}* · ${topic.slice(0, 50)}\n\n${telegramPreview(draft)}`
      await sendChunked(telegramSend, tgText)
      allDrafts.push({ section: 'domain', label: `Domain ${i + 1}`, format: fmt, topic: topic.slice(0, 100), text: draft, generatedAt })
    } catch (err) { log.error(`Domain ${i + 1} failed`, err) }
  }

  // ── C: Trending short posts ───────────────────────────────────────────────
  if (broadcast) broadcast({ type: 'quill_progress', data: { step: 'writing_trending' } })
  for (let i = 0; i < assignments.trending.length; i++) {
    const topic = assignments.trending[i]
    if (!topic) continue
    try {
      const result = await koel.write({ format: 'short', input: topic, inputType: 'topic', count: 1 })
      const draft = result.drafts[0]
      const generatedAt = new Date().toISOString()
      await tgSend(telegramSend, `🔥 *Trending ${i + 1}* · ${topic.slice(0, 50)}\n\n${draft}`)
      allDrafts.push({ section: 'trending', label: `Trending ${i + 1}`, topic: topic.slice(0, 100), text: draft, generatedAt })
    } catch (err) { log.error(`Trending ${i + 1} failed`, err) }
  }

  // ── D: Top ranked sources (links only) ───────────────────────────────────
  if (topSources.length) {
    const lines = topSources.map((s, i) => `${i + 1}\\. [${s.title.slice(0, 55)}](${s.url})`).join('\n')
    await sendChunked(telegramSend, `📰 *Top Sources Today*\n_Click to read, then ask Titto to write a post_\n\n${lines}`)
  }

  // ── E: Viral X post links ────────────────────────────────────────────────
  if (viralXLinks.length) {
    const lines = viralXLinks.map((x, i) => `${i + 1}\\. [${x.title.slice(0, 55)}](${x.url})`).join('\n')
    await sendChunked(telegramSend, `𝕏 *Viral in your domain*\n\n${lines}`)
  }

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
  log.info(`runDaily complete — ${allDrafts.length} drafts`)
  await tgSend(telegramSend, `✅ Done — ${allDrafts.length} drafts. Full posts in Quill tab.`)
  return output
}

// ── Weekly run ────────────────────────────────────────────────────────────────

async function runWeekly({ broadcast, telegramSend } = {}) {
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
        inputType: 'freetext', count: 1,
        extraInstructions: 'Summarise most interesting GitHub repos that trended. Why each matters.',
      })
      await sendChunked(telegramSend, `🐙 *GitHub Weekly Wrap*\n\n${result.drafts[0]}`)
    } catch (err) { log.error('GitHub wrap failed', err) }
  }

  if (broadcast) broadcast({ type: 'quill_weekly_complete', data: { ideas, generatedAt: runAt } })
  log.info('runWeekly complete')
}

module.exports = { runDaily, runWeekly }
