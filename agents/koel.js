require('dotenv').config()
const OpenAI = require('openai')
const { buildKoelSystemPrompt, buildKoelUserPrompt, buildContextBlock, reloadKnowledge, platformForFormat } = require('../prompts/koelWrite')
const { buildReplyPrompt } = require('../prompts/koelReply')
const { buildRepostPrompt } = require('../prompts/koelRepost')
const { sanitize, findBannedPhrase, findUngroundedStat } = require('../prompts/styleRules')
const { appendEntry } = require('../state/koelStore')
const activityStore = require('../state/activityStore')
const llm = require('../utils/llm')
const guard = require('../utils/llmGuard')
const G = require('../config/guardrails')
const memory = require('../state/memory')
const { ensureProfile } = require('../state/profileSeed')
const logger = require('../utils/logger')
const log = logger.source('koel')
const costTracker = require('../utils/costTracker')

let _openai = null
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

// One cached system prompt PER PLATFORM — each composes common/ plus only its own knowledge pack.
// Call reload() after editing any file under sub-agents/koel/.
let _systemPrompts = {}
function getSystemPrompt(platform) {
  if (!_systemPrompts[platform]) _systemPrompts[platform] = buildKoelSystemPrompt(platform)
  return _systemPrompts[platform]
}

function reload() {
  reloadKnowledge()
  _systemPrompts = {}
  log.info('Knowledge files reloaded')
}

// Parse the LLM output into an array of draft strings. Accepts the requested "--- DRAFT N ---"
// separator, but also a bare "---" on its own line — the model reliably separates multiple drafts
// with SOME dash rule even when it drops the "DRAFT N" label, so matching only the labeled form
// silently collapsed multi-draft output into one draft.
function parseDrafts(text) {
  const parts = text.split(/^[ \t]*-{2,}[ \t]*(?:DRAFT[ \t]*\d+[ \t]*)?-{0,}[ \t]*$/im)
  const drafts = parts.map(p => p.trim()).filter(p => p.length > 0)
  // If parsing fails (LLM didn't follow format), return single draft
  if (drafts.length === 0) return [text.trim()]
  return drafts
}

/**
 * Generate X post drafts
 *
 * @param {object} options
 * @param {string} options.format    — short | thread | longform | motivational | engagement
 * @param {string} options.input     — article URL, topic text, or free instruction
 * @param {string} options.inputType — url | topic | freetext
 * @param {number} options.count     — number of drafts (default 3)
 * @param {string} options.extraInstructions — optional rider from Titto or user
 * @param {function} options.broadcast — WebSocket broadcast fn (optional)
 */
async function write({ format = 'short', input, inputType = 'freetext', count = 3, extraInstructions = '', broadcast = null, account = null, origin = 'koel', platform = 'x', meta = {}, register = true, triggerLabel = '🖱 Manual' } = {}) {
  if (!input?.trim()) throw new Error('Koel needs an input topic, URL, or instruction')

  // The format decides which knowledge pack loads (every format belongs to exactly one platform).
  // Callers pass `format` reliably; `platform` they did not — Heron never set it, so its Substack
  // drafts were written with X's entire playbook in context. Deriving from format fixes that
  // without touching a single caller.
  const plat = platformForFormat(format, platform)

  log.info(`Writing ${format} post for ${plat} — inputType: ${inputType}, input: "${input.slice(0, 60)}…"`)
  if (broadcast) broadcast({ type: 'koel_progress', data: { step: 'writing', format, platform: plat } })

  // Read-before-write: pull the live profile + voice + approved/rejected for this account,
  // calibrated against work from THIS platform.
  const acct = account || memory.accounts.getActiveAccount()
  ensureProfile(acct)
  const contextBlock = buildContextBlock(memory.loadContext(acct), plat)

  const userPrompt = buildKoelUserPrompt({ format, input, inputType, count, extraInstructions })
  const messages = [{ role: 'system', content: getSystemPrompt(plat) }]
  if (contextBlock) messages.push({ role: 'system', content: contextBlock })
  messages.push({ role: 'user', content: userPrompt })

  let response
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      // This loop handles retries; llm.chat() applies the rate/concurrency guard and the timeout.
      response = await llm.chat({ model: 'openai/gpt-4o-mini', messages, temperature: 0.85, max_tokens: 4000 })
      break
    } catch (err) {
      const retryable = err.status === 500 || err.status === 503 || err.status === 429
      if (retryable && attempt < 3) {
        const wait = attempt * 4000
        log.warn(`OpenAI error ${err.status} on attempt ${attempt} — retrying in ${wait / 1000}s`)
        await new Promise(r => setTimeout(r, wait))
      } else {
        throw err
      }
    }
  }

  const usage = response.usage
  costTracker.priceAndRecord({ agent: origin, action: meta?.kind || 'write', modelId: 'openai/gpt-4o-mini', usage })
  log.info(`Koel done — tokens: ${usage?.prompt_tokens} in / ${usage?.completion_tokens} out`)

  const raw = response.choices[0].message.content.trim()
  // Deterministic house-style pass (strips em/en dashes, collapses blank-line runs).
  let drafts = parseDrafts(raw).map(sanitize)

  // Practical enforcement of two house-style rules that prompt wording alone doesn't hold:
  // (1) no INVENTED statistics, (2) no banned AI-slop/corporate phrases. Banned words like
  // "game-changer"/"unlock" kept leaking through despite a long-standing prompt ban, and fabricated
  // percentages reached 27% of approved drafts. Mirrors the Heron article word-count expand-pass
  // pattern: up to 2 deterministic re-asks, bounded, firing only when a real problem is detected.
  //
  // Everything the model was actually given, as the grounding corpus for stat checking. A percentage
  // that appears here is real and must survive; one that doesn't was invented.
  const sourceMaterial = messages.map(m => (typeof m.content === 'string' ? m.content : '')).join('\n')

  let lastRaw = raw
  for (let attempt = 1; attempt <= 2 && drafts.length; attempt++) {
    // This check used to be `missingNumber` — it demanded a number when a batch had none, which on
    // wellness/self-help topics (where no real figure exists) is a fabrication pump. It now points the
    // other way: find invented stats and get them removed.
    const fakeStat = drafts.map(d => findUngroundedStat(d, sourceMaterial)).find(Boolean) || null
    const badPhrase = drafts.map(findBannedPhrase).find(Boolean) || null
    if (!fakeStat && !badPhrase) break

    const reasons = [fakeStat && `ungrounded statistic: "${fakeStat}"`, badPhrase && `banned phrase found: "${badPhrase}"`].filter(Boolean)
    log.warn(`${format} batch failed a house-style check (${reasons.join('; ')}) — re-ask ${attempt}`)
    try {
      const asks = []
      if (fakeStat) asks.push(`One of these drafts states "${fakeStat}", which does NOT appear anywhere in the input material — it was invented. Remove it.

Do not swap in a different percentage, and do not soften it with "up to", "nearly" or "as much as" — that is the same fabrication. Replace the claim with something concrete you actually have: a specific moment, a named thing, a real action, or a countable detail (an age, a date, a count, a timeframe, an amount). If nothing specific is available for that point, cut the claim entirely and make the sentence a direct statement instead — a post with NO number is completely fine and far better than one with an invented figure. Leave every other draft unchanged.`)
      if (badPhrase) asks.push(`At least one draft used a banned phrase: "${badPhrase}". Rewrite to cut it and anything in the same family (corporate buzzwords, generic inspirational closers like "the future of X is here" or "we're on the brink of a major shift"). Say the specific thing THIS post is actually about, not something that could be pasted onto any other topic.`)
      const retryMessages = [...messages, { role: 'assistant', content: lastRaw }, { role: 'user', content:
        `${asks.join('\n\n')}\n\nThe house style rules from your system prompt still fully apply on this rewrite — re-read them. Keep the same format/length rules and the same count. Output in the exact same format as before.` }]
      const retryRes = await llm.chat({ model: 'openai/gpt-4o-mini', messages: retryMessages, temperature: 0.85, max_tokens: 4000 })
      costTracker.priceAndRecord({ agent: origin, action: (meta?.kind || 'write') + '_style_retry', modelId: 'openai/gpt-4o-mini', usage: retryRes.usage })
      const retryRaw = retryRes.choices[0].message.content.trim()
      const retryDrafts = parseDrafts(retryRaw).map(sanitize)
      if (retryDrafts.length === drafts.length) { drafts = retryDrafts; lastRaw = retryRaw } // only replace if shape still matches
      else break // shape drifted — stop rather than risk a mismatched draft count
    } catch (err) {
      log.warn(`Style re-ask ${attempt} failed, keeping current drafts: ${err.message}`)
      break
    }
  }

  // Light thread guard: flag (don't fail) if a thread drifted well past the 5–8 tweet target.
  if (format === 'thread') {
    const tweetCount = (drafts[0] || '').split(/\bTweet\s*\d+\s*\//i).length - 1
    if (tweetCount > 10) log.warn(`Thread came back with ${tweetCount} tweets (>10) — over target, delivering anyway`)
  }

  // Register each draft into the lifecycle queue (state: generated) so it can be approved/
  // rejected/edited from the web UI or Telegram. meta carries enough to regenerate later.
  let draftRecords = []
  if (register) {
    draftRecords = drafts.map(text => {
      const rec = memory.addDraft(acct, {
        text,
        format,
        origin,
        platform: plat,   // resolved from format — see platformForFormat()
        meta: { ...meta, input: input.slice(0, 200), inputType },
      })
      return { id: rec.id, text }
    })
  }

  const result = {
    format,
    inputType,
    input: input.slice(0, 200),
    account: acct,
    drafts,
    draftRecords,
    generatedAt: new Date().toISOString(),
  }

  if (broadcast) broadcast({ type: 'koel_complete', data: result })
  log.info(`${drafts.length} drafts generated for format: ${format}`)
  appendEntry(result)
  // Log direct writes only — Quill's per-draft batch calls (origin 'quill') are covered by the
  // single daily_batch/weekly entry, so they're skipped here to avoid flooding the activity feed.
  // 'quill' (batch) and 'reply' record their own single activity entry in their caller — skip here.
  if (origin !== 'quill' && origin !== 'reply' && origin !== 'repost') {
    activityStore.recordAndBroadcast(broadcast, {
      agent: origin, action: 'write', triggerLabel,
      summary: `${drafts.length} ${format} draft${drafts.length === 1 ? '' : 's'}`,
      ref: { kind: 'koel' },
    })
  }
  return result
}

// Draft a single reply to a given post (draft-only). Reuses write() so voice/profile/guardrails apply;
// records one 'reply' activity entry. Returns the same shape as write() (drafts + draftRecords).
async function draftReply({ sourceText, author = '', extra = '', account = null, broadcast = null, register = true, triggerLabel = '🖱 Reply' } = {}) {
  if (!sourceText?.trim()) throw new Error('draftReply needs the source post text')
  const extraInstructions = buildReplyPrompt({ sourceText, author, extra })
  const result = await write({
    format: 'short',
    input: `(Reply brief + the post are in the instructions above. Write Souvik's reply.)`,
    inputType: 'freetext', count: 1, extraInstructions,
    origin: 'reply', account, broadcast: null, register,   // null → no koel_complete panel-jump; reply UI handles delivery
    meta: { kind: 'reply', sourceAuthor: author },
    triggerLabel,
  })
  activityStore.recordAndBroadcast(broadcast, {
    agent: 'reply', action: 'reply', triggerLabel,
    summary: `reply drafted${author ? ' → ' + author : ''}`,
    ref: { kind: 'koel' },
  })
  return result
}

// Draft the value-add COMMENT for a quote-repost of a viral post (draft-only). Mirrors draftReply:
// reuses write() so voice/profile/guardrails apply. Returns the same shape (drafts + draftRecords).
async function draftRepost({ sourceText, author = '', url = '', extra = '', account = null, broadcast = null, register = true, triggerLabel = '🔁 Repost' } = {}) {
  if (!sourceText?.trim()) throw new Error('draftRepost needs the source post text')
  const acct = account || memory.accounts.getActiveAccount()
  const extraInstructions = buildRepostPrompt({ sourceText, author, extra })
  // Generate the comment only (register:false); we compose the final quote-tweet ourselves.
  // format:'repost' (not 'short') — 'short''s own 280-char cap was conflicting with the 400-700 char
  // target here even with extraInstructions given "highest priority" (confirmed via a real test: output
  // landed at 281 chars, right at 'short''s boundary, ignoring the override).
  const inner = await write({
    format: 'repost',
    input: `(Quote-repost brief + the viral post are in the instructions above. Write Souvik's value-add comment.)`,
    inputType: 'freetext', count: 1, extraInstructions,
    origin: 'repost', account: acct, broadcast: null, register: false,
    meta: { kind: 'repost', sourceAuthor: author, sourceUrl: url },
    triggerLabel,
  })
  const comment = (inner.drafts[0] || '').trim()
  // The complete, ready-to-post quote-tweet = comment + the post URL (X embeds the quoted tweet).
  const finalText = url ? `${comment}\n\n${url}` : comment
  let draftRecords = []
  if (register) {
    const rec = memory.addDraft(acct, { text: finalText, format: 'short', origin: 'repost', meta: { kind: 'repost', sourceAuthor: author, sourceUrl: url } })
    draftRecords = [{ id: rec.id, text: finalText }]
  }
  activityStore.recordAndBroadcast(broadcast, {
    agent: 'repost', action: 'repost', triggerLabel,
    summary: `repost drafted${author ? ' → ' + author : ''}`,
    ref: { kind: 'koel' },
  })
  return { format: 'repost', inputType: 'freetext', account: acct, drafts: [finalText], draftRecords, generatedAt: new Date().toISOString() }
}

module.exports = { write, reload, draftReply, draftRepost }
