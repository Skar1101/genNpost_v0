require('dotenv').config()
const OpenAI = require('openai')
const models = require('../config/models')
const guard = require('./llmGuard')
const G = require('../config/guardrails')

// Wrap a create() in an AbortController that fires after TIMEOUT_MS, so a hung/slow call (even a stalled
// stream) is aborted rather than holding a concurrency slot forever.
function withTimeout() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), G.TIMEOUT_MS)
  return { signal: controller.signal, clear: () => clearTimeout(timer) }
}

// Unified chat client for the Article Writer. Routes through OpenRouter when OPENROUTER_API_KEY is set
// (one key → DeepSeek / Claude / GPT / …), otherwise falls back to the plain OpenAI API so the tool is
// never blocked before a key is added. OpenRouter is OpenAI-compatible, so the same SDK works with only
// baseURL / apiKey / model changed.

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'

let _client = null
let _mode = null   // 'openrouter' | 'openai'

function usingOpenRouter() {
  return !!process.env.OPENROUTER_API_KEY
}

function getClient() {
  const mode = usingOpenRouter() ? 'openrouter' : 'openai'
  if (_client && _mode === mode) return _client
  _mode = mode
  if (mode === 'openrouter') {
    _client = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: OPENROUTER_BASE,
      defaultHeaders: {
        'HTTP-Referer': process.env.PUBLIC_URL || 'http://localhost',
        'X-Title': 'TinySparrow Article Writer',
      },
    })
  } else {
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return _client
}

// Resolve a registry model id to the concrete id the active provider expects.
// On OpenRouter we pass the slug as-is; on OpenAI fallback we map openai/* → its plain id.
function resolveModelId(modelId) {
  const m = models.byId(modelId) || models.byId(models.DEFAULT_MODEL_ID)
  if (usingOpenRouter()) return m.id
  // OpenAI fallback: only openai/* models are reachable; anything else degrades to the default.
  if (m.openaiFallback) return m.openaiFallback
  const def = models.byId(models.DEFAULT_MODEL_ID)
  return def.openaiFallback || 'gpt-4o-mini'
}

// Non-streaming completion. Returns { text, usage, modelUsed }.
async function complete({ modelId, messages, temperature = 0.8, maxTokens = 4000 } = {}) {
  const client = getClient()
  const model = resolveModelId(modelId)
  const cappedTokens = Math.min(maxTokens, G.MAX_OUTPUT_TOKENS)
  return guard.runGuarded(async () => {
    const t = withTimeout()
    try {
      const res = await client.chat.completions.create(
        { model, messages, temperature, max_tokens: cappedTokens },
        { signal: t.signal, maxRetries: G.MAX_RETRIES },
      )
      return {
        text: res.choices?.[0]?.message?.content?.trim() || '',
        usage: res.usage || null,
        modelUsed: model,
      }
    } finally { t.clear() }
  })
}

// Streaming completion. Calls onToken(delta) for each chunk; returns { text, usage, modelUsed }.
// Note: usage is only present on the final chunk when stream_options.include_usage is honored (OpenRouter
// + OpenAI support it). We also accumulate text so callers always get the full result.
async function stream({ modelId, messages, temperature = 0.8, maxTokens = 4000, onToken } = {}) {
  const client = getClient()
  const model = resolveModelId(modelId)
  const cappedTokens = Math.min(maxTokens, G.MAX_OUTPUT_TOKENS)
  // Hold the guard slot for the ENTIRE stream (create + consumption), so concurrency is real.
  return guard.runGuarded(async () => {
    const t = withTimeout()
    try {
      const s = await client.chat.completions.create(
        { model, messages, temperature, max_tokens: cappedTokens, stream: true, stream_options: { include_usage: true } },
        { signal: t.signal, maxRetries: G.MAX_RETRIES },
      )
      let text = ''
      let usage = null
      for await (const chunk of s) {
        const delta = chunk.choices?.[0]?.delta?.content || ''
        if (delta) { text += delta; if (onToken) onToken(delta) }
        if (chunk.usage) usage = chunk.usage
      }
      return { text: text.trim(), usage, modelUsed: model }
    } finally { t.clear() }
  })
}

module.exports = { complete, stream, usingOpenRouter, resolveModelId, getClient }
