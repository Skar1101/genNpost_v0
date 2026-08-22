require('dotenv').config()

// Image provider registry.
//
// ─── To swap which API generates images ──────────────────────────────────────
// Set IMAGE_PROVIDER in .env to a provider id ('openrouter' | 'fal' | 'openai').
// Leave it unset and the first provider in PRIORITY that has its API key wins.
//
// ─── To add a NEW provider ───────────────────────────────────────────────────
// 1. Copy any file in this directory (openrouter.js is the simplest) and edit it.
// 2. Add it to the PROVIDERS array below.
// That is the whole job — nothing outside this directory needs to change, because every caller
// goes through utils/imageClient.js, which only ever talks to this registry.
//
// ─── The contract a provider must satisfy ────────────────────────────────────
//   id           string, unique                     e.g. 'openrouter'
//   label        human name for the UI
//   envKey       env var holding its API key        e.g. 'OPENROUTER_API_KEY'
//   models       [{ id, label, ...pricing }]        pricing: `perImage` OR
//                                                   `perMegapixel: { first, additional }`
//   defaultModel model id used when none is asked for
//   isConfigured()                                  -> boolean
//   generate({ prompt, model, size })               -> { buffer, contentType, modelUsed, cost? }
//
// `size` is provider-neutral: { width, height, aspect } from config/imageStyle.js. Each provider
// translates it into whatever its own API wants, so adding a provider never means touching the
// style config.
//
// `cost` is optional. Return it when the API reports a real figure (OpenRouter does) — it beats any
// local price table and never goes stale. Omit it and the registry prices from `models`.

const PROVIDERS = [
  require('./fal'),
  require('./openrouter'),
  require('./openai'),
]

// Order of preference when IMAGE_PROVIDER isn't set. fal first because it is the cheapest per image
// AND the only one that can LoRA-train on approved images later; OpenRouter next (cheap, and its key
// is usually already present for the Article Writer); OpenAI last as the always-there backstop.
const PRIORITY = ['fal', 'openrouter', 'openai']

function list() { return PROVIDERS }

function byId(id) { return PROVIDERS.find(p => p.id === id) || null }

function configured() { return PROVIDERS.filter(p => p.isConfigured()) }

// The provider that will actually be used. Explicit IMAGE_PROVIDER wins, but only if that provider
// is really configured — a typo or a missing key falls through to the priority order rather than
// failing every generation.
function active() {
  const forced = (process.env.IMAGE_PROVIDER || '').trim().toLowerCase()
  if (forced) {
    const p = byId(forced)
    if (p && p.isConfigured()) return p
  }
  for (const id of PRIORITY) {
    const p = byId(id)
    if (p && p.isConfigured()) return p
  }
  return null
}

// Which provider owns a given model id.
function providerForModel(modelId) {
  return PROVIDERS.find(p => p.models.some(m => m.id === modelId)) || null
}

function modelById(modelId) {
  for (const p of PROVIDERS) {
    const m = p.models.find(x => x.id === modelId)
    if (m) return { ...m, provider: p.id }
  }
  return null
}

// Every model from every provider, flagged with whether it can be used right now.
function allModels() {
  return PROVIDERS.flatMap(p => p.models.map(m => ({
    ...m, provider: p.id, providerLabel: p.label, available: p.isConfigured(),
  })))
}

// Resolve a requested model to one that can actually run: keep it if its provider is configured,
// otherwise fall back to the active provider's default.
function resolve(modelId) {
  const owner = modelId ? providerForModel(modelId) : null
  if (owner && owner.isConfigured()) return { provider: owner, modelId }
  const p = active()
  if (!p) return { provider: null, modelId: null }
  return { provider: p, modelId: p.defaultModel }
}

// Price from the registry. Handles both flat per-image and per-megapixel pricing (FLUX bills by
// megapixel, so a flat table would quietly misreport it).
function costFor(modelId, { width = 1024, height = 1024, count = 1 } = {}) {
  const m = modelById(modelId)
  if (!m) return null
  if (typeof m.perImage === 'number') return round(m.perImage * count)
  if (m.perMegapixel) {
    const mp = (width * height) / 1e6
    const first = Math.min(mp, 1) * m.perMegapixel.first
    const rest = Math.max(mp - 1, 0) * m.perMegapixel.additional
    return round((first + rest) * count)
  }
  return null
}

function round(n) { return Math.round(n * 1e6) / 1e6 }

// One-line summary for logs and the Settings UI.
function status() {
  const a = active()
  return {
    active: a ? a.id : null,
    activeLabel: a ? a.label : null,
    defaultModel: a ? a.defaultModel : null,
    forced: (process.env.IMAGE_PROVIDER || '').trim().toLowerCase() || null,
    providers: PROVIDERS.map(p => ({ id: p.id, label: p.label, envKey: p.envKey, configured: p.isConfigured() })),
  }
}

module.exports = { list, byId, configured, active, providerForModel, modelById, allModels, resolve, costFor, status, PRIORITY }
