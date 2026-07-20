// Seeds a creator profile from what we already know (pillars, voice principles), leaving the
// onboarding-only fields blank for Souvik to fill (handle, audience, goal, baseline, best tweets).
// This profile becomes the single source of truth every agent reads before drafting.
const memory = require('./memory')
const { listPillars } = require('./quillPillarsStore')

function defaultProfile() {
  return {
    schemaVersion: 1,
    onboarded: false,
    identity: {
      name: 'Souvik',
      handle: '',                 // ← onboarding: your @handle (also used to pull your tweets)
      niche: 'Solo SaaS builder using AI as the team — build-in-public, indie economics, and resilience (transplant → builder).',
      audience: '',               // ← onboarding: who you write for (indie founders, AI builders, …)
      goal: '',                   // ← onboarding: e.g. "20k followers by <date>"
      deadline: '',
    },
    baseline: {
      followers: null,            // ← onboarding
      avgImpressions: null,       // ← onboarding
    },
    voice: {
      description: 'Direct, specific, plain language. Real numbers and lived experience over vague claims. Practical, not a hero arc. Standard sentence casing — capitalize sentence starts and proper nouns.',
      doRules: [
        'Lead with a specific event, number, or outcome',
        'Back claims with a real number when possible',
        'Write like texting a smart friend',
      ],
      dontRules: [
        'No em dashes',
        'No corporate words (leverage, exciting, game-changing, unlock)',
        'No "inspiration porn" / vague motivation',
        'No threads without data or a real story',
      ],
    },
    restrictions: [],             // ← onboarding: topics/formats to avoid, words you never use
    watchlist: [],                // ← onboarding: 5–10 handles to monitor / reply under
    pillars: (listPillars() || []).map(p => ({ label: p.label, notes: p.notes })),
    bestTweets: [],               // ← onboarding: 2–3 best tweets (links or text) → seed voice
  }
}

// Create the seeded profile if none exists yet; otherwise return the existing one.
function ensureProfile(account) {
  let p = memory.getProfile(account)
  if (!p) p = memory.saveProfile(account, defaultProfile())
  return p
}

module.exports = { defaultProfile, ensureProfile }
