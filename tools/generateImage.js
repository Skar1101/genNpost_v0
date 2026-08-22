require('dotenv').config()
const imageClient = require('../utils/imageClient')
const imagesStore = require('../state/imagesStore')
const models = require('../config/models')
const { composePrompt, subjectFromPost } = require('../prompts/imagePrompt')
const costTracker = require('../utils/costTracker')
const memory = require('../state/memory')
const activityStore = require('../state/activityStore')
const logger = require('../utils/logger')
const log = logger.source('image')

// A tool, not an agent — no persona, no identity file. Any writer can call it, and so can the
// library UI. Three ways in, in increasing order of "we already know what we want":
//
//   generateFromPost({ text })     — derive a subject from the post, then generate
//   generateFromPrompt({ prompt }) — a subject/prompt you already have (e.g. Heron's stored
//                                    imagePrompt, which until now was written and never rendered)
//   attach an uploaded file        — see saveUpload()

/**
 * Generate from an explicit subject or prompt.
 * @param {string} subject   the visual subject; house style is composed on top of it
 * @param {boolean} raw      true = use `subject` verbatim as the full prompt, no style injection
 */
async function generateFromPrompt({ subject, raw = false, platform = 'x', modelId = null, account = null, sourceText = '', broadcast = null, triggerLabel = '🖼 Image' } = {}) {
  if (!subject?.trim()) throw new Error('generateImage needs a subject or prompt')
  const acct = account || memory.accounts.getActiveAccount()
  const prompt = raw ? subject.trim() : composePrompt(subject.trim())

  if (broadcast) broadcast({ type: 'image_progress', data: { step: 'generating', platform } })

  const out = await imageClient.generate({ prompt, modelId, platform })
  // Prefer the provider's own reported cost (OpenRouter returns one); price from the registry only
  // when it doesn't. Dimensions matter because FLUX bills per megapixel.
  const dims = { width: out.size?.width, height: out.size?.height }
  const cost = out.cost != null ? out.cost : models.imageCostFor(out.modelUsed, 1, dims)
  costTracker.priceAndRecordImages({ agent: 'image', action: 'generate', modelId: out.modelUsed, count: 1, cost: out.cost, dims })

  const rec = imagesStore.save(acct, out.buffer, {
    contentType: out.contentType,
    platform,
    prompt,
    subject: raw ? null : subject.trim(),
    model: out.modelUsed,
    provider: out.provider,
    cost,
    sourceText,
    source: 'generated',
  })

  log.info(`Saved ${rec.id} (${(rec.bytes / 1024).toFixed(0)} KB, $${cost}) — ${rec.url}`)
  if (broadcast) broadcast({ type: 'image_complete', data: rec })
  activityStore.recordAndBroadcast(broadcast, {
    agent: 'image', action: 'generate', triggerLabel,
    summary: `image for ${platform} · ${out.provider}/${out.modelUsed} · $${cost}`,
    ref: { kind: 'library' },
  })
  return rec
}

/** Derive a visual subject from post text first, then generate. Costs one extra cheap LLM call. */
async function generateFromPost({ text, platform = 'x', modelId = null, account = null, broadcast = null, triggerLabel = '🖼 Image' } = {}) {
  if (!text?.trim()) throw new Error('generateFromPost needs post text')
  const subject = await subjectFromPost({ text, platform })
  return generateFromPrompt({ subject, platform, modelId, account, sourceText: text, broadcast, triggerLabel })
}

/**
 * Store an image the user made elsewhere. Same store, same library, same downstream handling as a
 * generated one — only `source` differs.
 * @param {Buffer|string} data  raw buffer, or a base64 / data: URL string
 */
function saveUpload({ data, contentType = 'image/png', platform = 'x', account = null, sourceText = '' } = {}) {
  const acct = account || memory.accounts.getActiveAccount()
  let buffer
  if (Buffer.isBuffer(data)) {
    buffer = data
  } else if (typeof data === 'string') {
    const m = data.match(/^data:([^;]+);base64,(.*)$/s)
    if (m) { contentType = m[1]; buffer = Buffer.from(m[2], 'base64') } else { buffer = Buffer.from(data, 'base64') }
  } else {
    throw new Error('saveUpload needs a Buffer or a base64/data-URL string')
  }
  if (!buffer.length) throw new Error('saveUpload got empty image data')

  const rec = imagesStore.save(acct, buffer, { contentType, platform, source: 'upload', sourceText })
  log.info(`Stored upload ${rec.id} (${(rec.bytes / 1024).toFixed(0)} KB)`)
  return rec
}

module.exports = { generateFromPrompt, generateFromPost, saveUpload }
