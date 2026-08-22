// Selectable writing models for the Article Writer. Prices are USD per 1M tokens (approx list price)
// and drive the live cost readout. IDs are OpenRouter model slugs; when OPENROUTER_API_KEY is set the
// client routes through OpenRouter, otherwise it falls back to OpenAI (see utils/llm.js).
//
// `openaiFallback` is the equivalent model id to use on the plain OpenAI API when OpenRouter isn't
// configured (only meaningful for openai/* models — others simply require an OpenRouter key).

const MODELS = [
  {
    id: 'deepseek/deepseek-chat',
    label: 'DeepSeek V3 (cheap, strong writer)',
    provider: 'openrouter',
    inputPer1M: 0.27,
    outputPer1M: 1.10,
    requiresOpenRouter: true,
  },
  {
    id: 'deepseek/deepseek-r1',
    label: 'DeepSeek R1 (reasoning)',
    provider: 'openrouter',
    inputPer1M: 0.55,
    outputPer1M: 2.19,
    requiresOpenRouter: true,
  },
  {
    id: 'anthropic/claude-3.7-sonnet',
    label: 'Claude 3.7 Sonnet (premium prose)',
    provider: 'openrouter',
    inputPer1M: 3.0,
    outputPer1M: 15.0,
    requiresOpenRouter: true,
  },
  {
    id: 'openai/gpt-4o',
    label: 'GPT-4o',
    provider: 'openrouter',
    inputPer1M: 2.5,
    outputPer1M: 10.0,
    requiresOpenRouter: false,
    openaiFallback: 'gpt-4o',
  },
  {
    id: 'openai/gpt-4o-mini',
    label: 'GPT-4o mini (cheapest, default)',
    provider: 'openrouter',
    inputPer1M: 0.15,
    outputPer1M: 0.60,
    requiresOpenRouter: false,
    openaiFallback: 'gpt-4o-mini',
  },
]

// The safe default that works even before an OpenRouter key is added.
const DEFAULT_MODEL_ID = 'openai/gpt-4o-mini'

// Preferred model for the Article Writer: DeepSeek V3 (cheap, strong long-form). Requires an OpenRouter
// key; falls back to gpt-4o-mini when none is set.
const ARTICLE_DEFAULT_MODEL = 'deepseek/deepseek-chat'
function articleDefaultModel() {
  return process.env.OPENROUTER_API_KEY ? ARTICLE_DEFAULT_MODEL : DEFAULT_MODEL_ID
}

function byId(id) {
  return MODELS.find(m => m.id === id) || null
}

// Cost in USD from a usage object { prompt_tokens, completion_tokens }.
function costFor(modelId, usage) {
  const m = byId(modelId)
  if (!m || !usage) return null
  const inTok = usage.prompt_tokens || 0
  const outTok = usage.completion_tokens || 0
  const cost = (inTok / 1e6) * m.inputPer1M + (outTok / 1e6) * m.outputPer1M
  return Math.round(cost * 1e6) / 1e6   // round to 6 decimals (micro-dollars)
}

// ── Image models ─────────────────────────────────────────────────────────────
// Images are NOT defined here. Every image model, its price, and how to call its API live with the
// provider that owns it, in utils/imageProviders/ — so adding or swapping a provider is one file
// and one registry line, with nothing to change here or in any caller.
//
// These are thin re-exports so existing call sites keep working unchanged.
const imageProviders = require('../utils/imageProviders')

function imageDefaultModel() { return imageProviders.active()?.defaultModel || null }
function imageById(id) { return imageProviders.modelById(id) }

// Cost in USD. `dims` is optional and only matters for per-megapixel models (FLUX bills that way,
// so a flat per-image figure would misreport it).
function imageCostFor(modelId, count = 1, dims = {}) {
  return imageProviders.costFor(modelId, { ...dims, count })
}

module.exports = {
  MODELS, DEFAULT_MODEL_ID, ARTICLE_DEFAULT_MODEL, articleDefaultModel, byId, costFor,
  imageDefaultModel, imageById, imageCostFor,
  imageProviders,
  // Every model across every provider, each flagged `available` by whether its key is set.
  get IMAGE_MODELS() { return imageProviders.allModels() },
}
