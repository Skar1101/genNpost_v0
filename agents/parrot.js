require('dotenv').config()
const OpenAI = require('openai')
const koel = require('./koel')
const raven = require('./raven')
const memory = require('../state/memory')
const researchStore = require('../state/researchStore')
const sessionsStore = require('../state/parrotSessionsStore')
const { listPillars } = require('../state/quillPillarsStore')
const activityStore = require('../state/activityStore')
const llm = require('../utils/llm')
const guard = require('../utils/llmGuard')
const G = require('../config/guardrails')
const costTracker = require('../utils/costTracker')
const linkedinClient = require('../utils/linkedinClient')
const { buildParrotPlanPrompt } = require('../prompts/parrotPlan')
const logger = require('../utils/logger')
const log = logger.source('parrot')

let _openai = null
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

// ── Write a LinkedIn post ────────────────────────────────────────────────────────────────────
async function writePost({ topic, count = 1, account = null, broadcast = null, telegramSendDraft = null, triggerLabel = '🖱 Manual', extraInstructions: callerInstructions = '' } = {}) {
  if (!topic?.trim()) throw new Error('parrot.writePost needs a topic')
  const acct = account || memory.accounts.getActiveAccount()

  const pillars = listPillars()
  const pillarNote = pillars.length
    ? `Tie this to Souvik's content pillars/niche:\n${pillars.map(p => `- ${p.label}${p.notes ? ': ' + p.notes : ''}`).join('\n')}`
    : ''
  const extraInstructions = [callerInstructions.trim(), pillarNote].filter(Boolean).join('\n\n')

  const result = await koel.write({
    format: 'linkedin', input: topic, inputType: 'freetext', count,
    extraInstructions, origin: 'parrot', platform: 'linkedin', account: acct,
    broadcast: null, meta: { kind: 'linkedin' }, triggerLabel,
  })

  if (telegramSendDraft && result.draftRecords.length) {
    await telegramSendDraft(result.draftRecords, { header: `🦜 LinkedIn post${result.draftRecords.length > 1 ? 's' : ''}` })
  }

  return result
}

// ── Daily topic assignment — spans career/professional-growth, ai/tech commentary, and
// building-in-public. "career" is mostly freetext (professional-development angles, doesn't need a
// research link); "ai"/"building-in-public" prefer real research items when good candidates exist. ──
function fallbackDailyTopics(results) {
  const picks = (results || []).slice(0, 3).map(r => r.title).filter(Boolean)
  while (picks.length < 3) picks.push('a real lesson from building in public worth sharing today')
  return picks.map(topic => ({ topic, category: 'ai' }))
}

async function assignDailyTopics({ account = null, count = 1 } = {}) {
  const acct = account || memory.accounts.getActiveAccount()
  const research = researchStore.readLatest()
  const results = research?.results || []
  // Ordered by LinkedIn fit rather than the global ranking — career/industry items rise, and the
  // motivational one-liners that suit X sink, which is the correct outcome for this platform.
  const top = raven.topForPlatform(research, 'linkedin', 15)
  const topList = top.length
    ? top.map((r, i) => `${i + 1}. [${r.source}] ${r.title}`).join('\n')
    : '(no fresh research available — use freetext angles)'

  const prompt = `You are a content strategist for Souvik — Indian engineer, kidney transplant survivor, 5 medals for India, AI/SaaS builder. You're picking today's Parrot (LinkedIn) topic${count === 1 ? '' : 's'}.

Today's top ranked research:
${topList}

Pick ${count} topic${count === 1 ? '' : 's'} for today's LinkedIn post${count === 1 ? '' : 's'} — LinkedIn's
audience expects professional/thought-leadership content, not X's punchy style. Return ONLY valid JSON:

{ "topics": [{"topic":"...", "category":"career|ai|building-in-public"}${count === 1 ? '' : ', ...'}] }

Rules:
- Categories: career (professional growth, leadership, career lessons — freetext, doesn't need a research
  source), ai (AI/tech industry commentary — pull from the research list above when a good candidate
  exists), building-in-public (the practice/reality of building a product or business in public as a
  topic — freetext, NOT Souvik's own story; a general observation or take on building-in-public itself).
- Each topic is a short, specific angle (one sentence) — not "write about AI" but the actual idea.
- If nothing in the research fits, propose a freetext angle yourself — don't force a weak match.
- None of these should be framed as Souvik's personal story or journey — every topic should read as a
  direct observation, insight, or take on the subject itself, not "in my experience..." narrative.`

  try {
    const response = await llm.chat({ model: 'openai/gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.5, max_tokens: 500 })
    costTracker.priceAndRecord({ agent: 'parrot', action: 'assign_daily_topics', modelId: 'openai/gpt-4o-mini', usage: response.usage })

    const raw = response.choices[0].message.content.trim()
    const match = raw.match(/\{[\s\S]*\}/)
    const parsed = JSON.parse(match ? match[0] : raw)
    const topics = Array.isArray(parsed.topics) ? parsed.topics.filter(t => t?.topic).slice(0, count) : []
    if (topics.length < count) throw new Error(`assignDailyTopics: incomplete (got ${topics.length}, wanted ${count})`)
    return topics
  } catch (err) {
    log.warn(`assignDailyTopics failed, using fallback: ${err.message}`)
    return fallbackDailyTopics(results).slice(0, count)
  }
}

// ── Approve-time hook — the one shared function both parrotTelegram.js and the web Queue's Approve
// route call. Posts the APPROVED text (edits included, if any) to real LinkedIn. Never throws — always
// returns a structured result so the caller can turn it into the right user-facing message.
// Posts BEFORE transitioning state — a failed post leaves the draft untouched (still 'generated'), so
// the same Approve button/tap works as retry with no separate recovery UI needed. ──────────────────
async function postApprovedDraft(draft) {
  if (!draft) return { ok: false, error: 'No draft record to post' }
  const text = draft.editedText || draft.text
  try {
    const { postUrn, url } = await linkedinClient.postToLinkedIn({ text, account: draft.account })
    // Both transitions fire together, only after a confirmed real post — 'queued' first so the
    // learning loop (approvedDrafts → Koel's context, same as every other approved draft) sees it,
    // then 'posted' for postedAt.
    memory.transition(draft.account, draft.id, 'queued')
    memory.transition(draft.account, draft.id, 'posted')
    activityStore.recordAndBroadcast(null, {
      agent: 'parrot', action: 'post', triggerLabel: '✅ Approved',
      summary: `posted to LinkedIn${url ? ' — ' + url : ''}`,
      ref: { kind: 'koel' },
    })
    log.info(`Posted to LinkedIn: ${postUrn || '(no urn returned)'}`)
    return { ok: true, url, postUrn }
  } catch (err) {
    log.error(`LinkedIn post failed for draft ${draft.id}: ${err.message}`)
    activityStore.recordAndBroadcast(null, {
      agent: 'parrot', action: 'post-failed', triggerLabel: '⚠️ Approved',
      summary: `LinkedIn post failed: ${err.message}`,
      ref: { kind: 'koel' },
    })
    return { ok: false, error: err.message }
  }
}

// ── Plan LinkedIn posts — fresh search + category-matched suggestions, mirrors Quill's
// planSuggestions()/draftFromSuggestion() shape (agents/quill.js), using Parrot's fixed 3 categories
// (career/ai/building-in-public) instead of Quill's content pillars. "Fresh search" here means the
// same cross-platform Raven research Quill/Heron use, reframed for LinkedIn angles — LinkedIn's own
// API has no trending-topic/feed-read capability at any tier (confirmed), so this is the real answer
// to "search trending topics/posts," not literal LinkedIn-native data. ──────────────────────────────
async function planSuggestions({ broadcast = null, forceFresh = false, triggerLabel = '🖱 Plan button' } = {}) {
  log.info(`planSuggestions starting${forceFresh ? ' (forceFresh)' : ''}`)
  if (broadcast) broadcast({ type: 'parrot_progress', data: { step: 'fetching_trending' } })

  const STALE_HOURS = 4
  let research = researchStore.readLatest()
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
    research = await raven.run({ triggeredBy: 'parrot-plan', triggerLabel: '🦜 Parrot · plan', broadcast: null, forceRefetch: forceFresh })
  } else {
    log.info(`Reusing cached research (${ageHours.toFixed(1)}h old, under ${STALE_HOURS}h threshold)`)
  }
  const trendingItems = research?.results || []

  if (broadcast) broadcast({ type: 'parrot_progress', data: { step: 'matching_categories' } })
  const prompt = buildParrotPlanPrompt({ trendingItems })

  const res = await llm.chat({ model: 'openai/gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.4, max_tokens: 1200 })
  costTracker.priceAndRecord({ agent: 'parrot', action: 'plan', modelId: 'openai/gpt-4o-mini', usage: res.usage })
  const raw = res.choices[0].message.content.trim()
  const m = raw.match(/\{[\s\S]*\}/)
  let suggestions
  try {
    suggestions = JSON.parse(m ? m[0] : raw)?.suggestions || []
  } catch (e) {
    log.error('Parrot suggestions JSON parse failed', e)
    throw new Error('Parrot could not pick suggestions — LLM returned invalid JSON.')
  }

  const categories = suggestions.map(s => s.category)
  const sessionId = sessionsStore.createSession({ triggerLabel, categories, suggestions })

  activityStore.recordAndBroadcast(broadcast, {
    agent: 'parrot', action: 'plan', triggerLabel,
    summary: `${suggestions.reduce((n, s) => n + (s.items?.length || 0), 0)} LinkedIn suggestions across ${categories.length} categories`,
    ref: { kind: 'koel' },
  })

  return {
    generatedAt: new Date().toISOString(),
    sessionId,
    triggerLabel,
    categories,
    suggestions,
    totalSuggestions: suggestions.reduce((n, s) => n + (s.items?.length || 0), 0),
  }
}

// Turns one suggestion into a real, draftable, approvable LinkedIn post — registers into the queue and
// (if telegramSendDraft given) delivers it to Parrot's bot with Approve/Reject/Edit, same as writePost().
async function draftFromSuggestion({ suggestion, broadcast = null, sessionId = null, telegramSendDraft = null } = {}) {
  if (!suggestion?.title) throw new Error('draftFromSuggestion: suggestion.title required')
  log.info(`draftFromSuggestion — category: "${suggestion.category}", title: "${suggestion.title.slice(0, 60)}"`)
  if (broadcast) broadcast({ type: 'parrot_progress', data: { step: 'writing_linkedin' } })

  const briefInput = [
    suggestion.title,
    suggestion.angle ? `\nAngle: ${suggestion.angle}` : '',
    suggestion.snippet ? `\nContext: ${suggestion.snippet}` : '',
    suggestion.url ? `\nSource: ${suggestion.url}` : '',
  ].filter(Boolean).join('\n')

  const pillars = listPillars()
  const pillarNote = pillars.length
    ? `\nTie this to Souvik's content pillars/niche:\n${pillars.map(p => `- ${p.label}${p.notes ? ': ' + p.notes : ''}`).join('\n')}`
    : ''
  const extraInstructions = `Write this as a LinkedIn post for the "${suggestion.category}" category. Lead with the angle: ${suggestion.angle || suggestion.title}. ${suggestion.url ? 'Weave in the source naturally if it fits — no raw URL dump.' : ''}${pillarNote}`

  const result = await koel.write({
    format: 'linkedin', input: briefInput, inputType: 'freetext', count: 1,
    extraInstructions, origin: 'parrot', platform: 'linkedin', broadcast: null,
    meta: { kind: 'linkedin', category: suggestion.category },
  })

  const generatedAt = new Date().toISOString()
  const uid = 'pd-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)
  const rec = result.draftRecords?.[0]
  const draftRecord = {
    uid, draftId: rec?.id || null, category: suggestion.category, title: suggestion.title,
    text: result.drafts[0], sources: suggestion.url ? [suggestion.url] : [],
    generatedAt,
  }
  if (sessionId) {
    const saved = sessionsStore.appendDraft(sessionId, draftRecord)
    if (!saved) log.warn(`appendDraft: session ${sessionId} not found — draft not persisted`)
  }
  if (telegramSendDraft && rec) {
    await telegramSendDraft([rec], { header: `🦜 LinkedIn post — "${suggestion.title.slice(0, 50)}"` })
  }

  return {
    uid, draftId: rec?.id || null, draft: result.drafts[0], category: suggestion.category,
    title: suggestion.title, sources: draftRecord.sources, generatedAt,
  }
}

module.exports = { writePost, assignDailyTopics, postApprovedDraft, planSuggestions, draftFromSuggestion }
