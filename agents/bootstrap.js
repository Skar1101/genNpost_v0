// First-run profile bootstrap. A brand-new account's profile/pillars default to placeholder values
// seeded for the original single user (see state/profileSeed.js, state/strategyStore.js DEFAULTS) —
// fine for one person, meaningless for anyone else. This infers a real starting voice + 3 niche-fit
// pillars from a niche description and optional sample posts, so Settings opens pre-filled instead of
// blank. Keywords are left alone: keywordsStore already ships sensible per-platform defaults that
// aren't user-specific the way voice/pillars are, so there's nothing to bootstrap there.
require('dotenv').config()
const memory = require('../state/memory')
const strategyStore = require('../state/strategyStore')
const activityStore = require('../state/activityStore')
const llm = require('../utils/llm')
const costTracker = require('../utils/costTracker')
const logger = require('../utils/logger')
const log = logger.source('bootstrap')
const { buildBootstrapPrompt } = require('../prompts/bootstrapProfile')

async function bootstrapProfile({ account = null, niche, samples = [], broadcast = null } = {}) {
  const acct = account || memory.accounts.getActiveAccount()
  if (!niche?.trim()) throw new Error('bootstrapProfile needs a niche')

  const cleanSamples = (samples || []).map(s => String(s || '').trim()).filter(Boolean).slice(0, 8)

  const prompt = buildBootstrapPrompt({ niche: niche.trim(), samples: cleanSamples, allDomains: strategyStore.ALL_DOMAINS })
  const res = await llm.chat({ model: 'openai/gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.6, max_tokens: 1500 })
  costTracker.priceAndRecord({ agent: 'bootstrap', action: 'profile_bootstrap', modelId: 'openai/gpt-4o-mini', usage: res.usage })

  const raw = res.choices[0].message.content.trim()
  const m = raw.match(/\{[\s\S]*\}/)
  let parsed
  try {
    parsed = JSON.parse(m ? m[0] : raw)
  } catch (e) {
    log.error('Bootstrap JSON parse failed', e)
    throw new Error('Profile bootstrap: LLM returned invalid JSON')
  }

  const voice = parsed.voice || {}
  const current = memory.getProfile(acct) || {}
  const profile = memory.saveProfile(acct, {
    ...current,
    identity: { ...current.identity, niche: niche.trim() },
    voice: {
      ...current.voice,
      description: voice.description || current.voice?.description || '',
      doRules: Array.isArray(voice.doRules) ? voice.doRules : current.voice?.doRules || [],
      dontRules: Array.isArray(voice.dontRules) ? voice.dontRules : current.voice?.dontRules || [],
    },
    onboarded: true,
  })

  const pillars = Array.isArray(parsed.pillars) && parsed.pillars.length ? parsed.pillars : null
  const strategy = pillars ? strategyStore.save(acct, { pillars }) : strategyStore.get(acct)

  activityStore.recordAndBroadcast(broadcast, {
    agent: 'bootstrap', action: 'profile_bootstrap', triggerLabel: '🌱 Profile setup',
    summary: `generated voice + ${pillars ? pillars.length : 0} starter pillars for "${niche.trim()}"`,
    ref: { kind: 'settings' },
  })

  return { profile, strategy }
}

module.exports = { bootstrapProfile }
