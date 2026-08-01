require('dotenv').config()
const OpenAI = require('openai')
const { buildKoelSystemPrompt, buildKoelUserPrompt, buildContextBlock, reloadKnowledge } = require('../prompts/koelWrite')
const { buildReplyPrompt } = require('../prompts/koelReply')
const { buildRepostPrompt } = require('../prompts/koelRepost')
const { sanitize } = require('../prompts/styleRules')
const { appendEntry } = require('../state/koelStore')
const activityStore = require('../state/activityStore')
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

// Cached at startup — call reload() after editing knowledge files
let _systemPrompt = null
function getSystemPrompt() {
  if (!_systemPrompt) _systemPrompt = buildKoelSystemPrompt()
  return _systemPrompt
}

function reload() {
  reloadKnowledge()
  _systemPrompt = buildKoelSystemPrompt()
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

  log.info(`Writing ${format} post — inputType: ${inputType}, input: "${input.slice(0, 60)}…"`)
  if (broadcast) broadcast({ type: 'koel_progress', data: { step: 'writing', format } })

  // Read-before-write: pull the live profile + voice + approved/rejected for this account.
  const acct = account || memory.accounts.getActiveAccount()
  ensureProfile(acct)
  const contextBlock = buildContextBlock(memory.loadContext(acct))

  const userPrompt = buildKoelUserPrompt({ format, input, inputType, count, extraInstructions })
  const messages = [{ role: 'system', content: getSystemPrompt() }]
  if (contextBlock) messages.push({ role: 'system', content: contextBlock })
  messages.push({ role: 'user', content: userPrompt })

  let response
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      response = await guard.runGuarded(() => getOpenAI().chat.completions.create(
        { model: 'gpt-4o-mini', messages, temperature: 0.85, max_tokens: 4000 },
        { maxRetries: 0, timeout: G.TIMEOUT_MS },   // this loop handles retries; guard bounds rate/concurrency
      ))
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
  const drafts = parseDrafts(raw).map(sanitize)

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
        platform,
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
  const inner = await write({
    format: 'short',
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
