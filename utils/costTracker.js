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

module.exports = { priceAndRecord }
