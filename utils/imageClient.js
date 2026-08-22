require('dotenv').config()
const providers = require('./imageProviders')
const imageStyle = require('../config/imageStyle')
const logger = require('./logger')
const log = logger.source('image')

// Thin dispatcher over utils/imageProviders/. Deliberately knows nothing about any specific API —
// every provider detail (endpoint, auth, request shape, size format, pricing) lives in that
// provider's own file.
//
// To change which API generates images: set IMAGE_PROVIDER in .env.
// To add a new one: add a file in utils/imageProviders/ and list it in that directory's index.js.
// Nothing in this file, or in any caller, needs to change either way.

/**
 * @param {string} prompt    fully composed generation prompt
 * @param {string} modelId   optional; falls back to the active provider's default
 * @param {string} platform  x | linkedin | substack — selects output dimensions
 * @returns {{ buffer, contentType, modelUsed, provider, cost }} cost is null when the provider
 *          doesn't report one, in which case the caller prices it from the registry.
 */
async function generate({ prompt, modelId = null, platform = 'x' } = {}) {
  if (!prompt?.trim()) throw new Error('imageClient.generate needs a prompt')

  const { provider, modelId: resolved } = providers.resolve(modelId)
  if (!provider) {
    const names = providers.list().map(p => p.envKey).join(' or ')
    throw new Error(`No image provider configured — set one of: ${names}`)
  }

  const size = imageStyle.platformSpec[platform] || imageStyle.platformSpec[imageStyle.defaultPlatform]

  log.info(`Generating image — provider:${provider.id} model:${resolved} platform:${platform} ${size.width}x${size.height}`)
  const started = Date.now()
  const out = await provider.generate({ prompt, model: resolved, size })
  if (!out?.buffer?.length) throw new Error(`${provider.id} returned an empty image`)

  log.info(`Image generated in ${((Date.now() - started) / 1000).toFixed(1)}s — ${(out.buffer.length / 1024).toFixed(0)} KB via ${provider.id}`)
  return {
    buffer: out.buffer,
    contentType: out.contentType || 'image/png',
    modelUsed: out.modelUsed || resolved,
    provider: provider.id,
    cost: out.cost ?? null,
    size,
  }
}

// Which provider is live, plus what else is available — used by /api/images and the logs.
function status() { return providers.status() }

// Kept for callers that only want to know the active provider id.
function activeProvider() { return providers.active()?.id || null }

module.exports = { generate, status, activeProvider, providers }
