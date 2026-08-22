const models = require('../config/models')
const costStore = require('../state/costStore')

// Price a raw OpenAI-shaped usage object against a registry model id and log it to costStore.
// Never throws — cost tracking must never break a real agent run.
function priceAndRecord({ agent, action, modelId, usage } = {}) {
  try {
    const cost = models.costFor(modelId, usage)
    if (cost == null) return null
    return costStore.record({
      agent, action, model: modelId, cost,
      promptTokens: usage?.prompt_tokens ?? null,
      completionTokens: usage?.completion_tokens ?? null,
    })
  } catch (_) { return null }
}

// Same idea for images, which are priced per image (or per megapixel) rather than per token. Kept
// separate rather than overloading priceAndRecord, because a usage object and an image count are not
// the same shape and conflating them is how a cost log quietly starts lying.
//
// `cost` takes precedence when supplied: some providers (OpenRouter) report the real billed amount
// per request, which always beats a local price table and can't go stale when prices change.
// `dims` only matters for per-megapixel models.
function priceAndRecordImages({ agent, action, modelId, count = 1, cost: reported = null, dims = {} } = {}) {
  try {
    const cost = reported != null ? reported : models.imageCostFor(modelId, count, dims)
    if (cost == null) return null
    return costStore.record({
      agent, action, model: modelId, cost,
      promptTokens: null, completionTokens: null, images: count,
    })
  } catch (_) { return null }
}

module.exports = { priceAndRecord, priceAndRecordImages }
