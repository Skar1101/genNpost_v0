require('dotenv').config()
const OpenAI = require('openai')
const imageStyle = require('../config/imageStyle')
const guard = require('../utils/llmGuard')
const G = require('../config/guardrails')
const costTracker = require('../utils/costTracker')
const logger = require('../utils/logger')
const log = logger.source('image')

let _openai = null
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

// Composes the final generation prompt the same way buildKoelSystemPrompt composes a writing one:
// subject + house style + hard bans. The subject is the only part that varies per post.
function composePrompt(subject) {
  const style = imageStyle.style.join(', ')
  const composition = imageStyle.composition.join('; ')
  const never = imageStyle.never.join('; ')
  return `${subject}

Style: ${style}.
Composition: ${composition}.
Absolutely avoid: ${never}.`
}

// Turn post text into a visual SUBJECT. This is the step that decides whether an image looks
// considered or generated: a post about discipline should not become a picture of the word
// "discipline", and it should not become a lightbulb either. One concrete scene, no metaphor.
async function subjectFromPost({ text, platform = 'x' } = {}) {
  const body = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 900)
  if (!body) throw new Error('subjectFromPost needs post text')

  const prompt = `Turn this social post into a single concrete photographic SUBJECT for an accompanying image.

POST (${platform}):
"${body}"

Rules:
- Describe ONE real, physical scene in 15-30 words. A place, an object, a moment.
- Concrete and literal-but-oblique: it should sit alongside the post, not illustrate it. A post about
  early mornings is not a clock and not the word "discipline" — it is an unmade bed with grey light
  on it, or a cold cup of coffee beside a keyboard.
- NEVER a visual metaphor (no lightbulbs for ideas, no rockets for growth, no chess for strategy).
- NEVER text, signage, logos, or screens with readable content.
- NEVER an identifiable real person. Anonymous figures, hands, or empty scenes are fine.
- No style words (no "cinematic", "4k", "editorial") — the house style is added separately.

Return ONLY the subject sentence, nothing else.`

  const res = await guard.runGuarded(() => getOpenAI().chat.completions.create(
    { model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: 120 },
    { maxRetries: G.MAX_RETRIES, timeout: G.TIMEOUT_MS },
  ))
  costTracker.priceAndRecord({ agent: 'image', action: 'subject', modelId: 'openai/gpt-4o-mini', usage: res.usage })

  const subject = (res.choices[0].message.content || '').trim().replace(/^["']|["']$/g, '')
  log.info(`Subject: "${subject.slice(0, 80)}"`)
  return subject
}

module.exports = { composePrompt, subjectFromPost }
