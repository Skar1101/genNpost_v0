require('dotenv').config()
const OpenAI = require('openai')
const models = require('../config/models')
const guard = require('./llmGuard')
const G = require('../config/guardrails')

// Wrap a create() in an AbortController that fires after TIMEOUT_MS, so a hung/slow call (even a stalled
// stream) is aborted rather than holding a concurrency slot forever.
// `external` lets a caller (e.g. the Stop button on the Article Writer) abort the same request.
// Linked by hand rather than with AbortSignal.any, which is Node 20+ — this project targets Node 18.
function withTimeout(external = null) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), G.TIMEOUT_MS)
  const onExternalAbort = () => controller.abort()
  if (external) {
    if (external.aborted) controller.abort()
    else external.addEventListener('abort', onExternalAbort, { once: true })
  }
  return {
    signal: controller.signal,
    clear: () => {
      clearTimeout(timer)
      if (external) external.removeEventListener('abort', onExternalAbort)
    },
  }
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
async function complete({ modelId, messages, temperature = 0.8, maxTokens = 4000, signal = null, responseFormat = null } = {}) {
  const client = getClient()
  const model = resolveModelId(modelId)
  const cappedTokens = Math.min(maxTokens, G.MAX_OUTPUT_TOKENS)
  return guard.runGuarded(async () => {
    const t = withTimeout(signal)
    try {
      const res = await client.chat.completions.create(
        {
          model, messages, temperature, max_tokens: cappedTokens,
          ...(responseFormat ? { response_format: responseFormat } : {}),
        },
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
async function stream({ modelId, messages, temperature = 0.8, maxTokens = 4000, onToken, signal = null } = {}) {
  const client = getClient()
  const model = resolveModelId(modelId)
  const cappedTokens = Math.min(maxTokens, G.MAX_OUTPUT_TOKENS)
  // Hold the guard slot for the ENTIRE stream (create + consumption), so concurrency is real.
  return guard.runGuarded(async () => {
    const t = withTimeout(signal)
    try {
      const s = await client.chat.completions.create(
        { model, messages, temperature, max_tokens: cappedTokens, stream: true, stream_options: { include_usage: true } },
        { signal: t.signal, maxRetries: G.MAX_RETRIES },
      )
      let text = ''
      let usage = null
      let aborted = false
      for await (const chunk of s) {
        if (signal && signal.aborted) { aborted = true; break }
        const delta = chunk.choices?.[0]?.delta?.content || ''
        if (delta) { text += delta; if (onToken) onToken(delta) }
        if (chunk.usage) usage = chunk.usage
      }
      return { text: text.trim(), usage, modelUsed: model, aborted }
    } finally { t.clear() }
  })
}

// OpenAI-SDK-shaped wrapper, so the agents that were calling
// `getOpenAI().chat.completions.create(...)` directly can route through here without rewriting how
// they read the result. Those agents were hardwired to OPENAI_API_KEY, so when that account ran out
// of credits every one of them died (429 "no credits remaining") while OpenRouter sat unused.
//
// IMPORTANT: this already runs inside guard.runGuarded via complete(). Do NOT wrap a call to it in
// runGuarded again — the guard is a plain non-reentrant semaphore, so nesting holds two of the three
// concurrency slots and stalls until it throws "rate limit hit".
//
// Takes OpenAI-style keys (model, max_tokens, response_format); returns an OpenAI-style envelope.
async function chat({ model, messages, temperature = 0.8, max_tokens = 4000, response_format = null, signal = null } = {}) {
  const res = await complete({
    modelId: model, messages, temperature, maxTokens: max_tokens, responseFormat: response_format, signal,
  })
  return {
    choices: [{ message: { content: res.text }, finish_reason: 'stop' }],
    usage: res.usage,
    model: res.modelUsed,
  }
}

module.exports = { complete, stream, chat, usingOpenRouter, resolveModelId, getClient }
