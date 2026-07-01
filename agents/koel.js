require('dotenv').config()
const OpenAI = require('openai')
const { buildKoelSystemPrompt, buildKoelUserPrompt, buildContextBlock, reloadKnowledge } = require('../prompts/koelWrite')
const { appendEntry } = require('../state/koelStore')
const activityStore = require('../state/activityStore')
const memory = require('../state/memory')
const { ensureProfile } = require('../state/profileSeed')
const logger = require('../utils/logger')
const log = logger.source('koel')

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

// Parse the LLM output into an array of draft strings
function parseDrafts(text) {
  // Split on draft separators
  const parts = text.split(/---\s*DRAFT\s*\d+\s*---/i)
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
async function write({ format = 'short', input, inputType = 'freetext', count = 3, extraInstructions = '', broadcast = null, account = null, origin = 'koel', meta = {}, register = true, triggerLabel = '🖱 Manual' } = {}) {
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
      response = await getOpenAI().chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.85,
        max_tokens: 4000,
      })
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
  log.info(`Koel done — tokens: ${usage?.prompt_tokens} in / ${usage?.completion_tokens} out`)

  const raw = response.choices[0].message.content.trim()
  const drafts = parseDrafts(raw)

  // Register each draft into the lifecycle queue (state: generated) so it can be approved/
  // rejected/edited from the web UI or Telegram. meta carries enough to regenerate later.
  let draftRecords = []
  if (register) {
    draftRecords = drafts.map(text => {
      const rec = memory.addDraft(acct, {
        text,
        format,
        origin,
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
  if (origin !== 'quill') {
    activityStore.recordAndBroadcast(broadcast, {
      agent: 'koel', action: 'write', triggerLabel,
      summary: `${drafts.length} ${format} draft${drafts.length === 1 ? '' : 's'}`,
      ref: { kind: 'koel' },
    })
  }
  return result
}

module.exports = { write, reload }
