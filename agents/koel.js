require('dotenv').config()
const OpenAI = require('openai')
const { buildKoelSystemPrompt, buildKoelUserPrompt, reloadKnowledge } = require('../prompts/koelWrite')
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
async function write({ format = 'short', input, inputType = 'freetext', count = 3, extraInstructions = '', broadcast = null } = {}) {
  if (!input?.trim()) throw new Error('Koel needs an input topic, URL, or instruction')

  log.info(`Writing ${format} post — inputType: ${inputType}, input: "${input.slice(0, 60)}…"`)
  if (broadcast) broadcast({ type: 'koel_progress', data: { step: 'writing', format } })

  const userPrompt = buildKoelUserPrompt({ format, input, inputType, count, extraInstructions })

  let response
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      response = await getOpenAI().chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: getSystemPrompt() },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.85,   // creative but structured
        max_tokens: 2000,
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

  const result = {
    format,
    inputType,
    input: input.slice(0, 200),
    drafts,
    generatedAt: new Date().toISOString(),
  }

  if (broadcast) broadcast({ type: 'koel_complete', data: result })
  log.info(`${drafts.length} drafts generated for format: ${format}`)
  return result
}

module.exports = { write, reload }
