// First-run profile bootstrap — infers voice + starter content pillars from a niche description
// and (optionally) a few sample posts, instead of asking a brand-new user to author all of it from
// blank fields. Pillar domains must come from strategyStore.ALL_DOMAINS so they stay compatible
// with research ranking without a separate validation pass.

function buildBootstrapPrompt({ niche, samples = [], allDomains }) {
  const sampleBlock = samples.length
    ? `Sample posts written by the user (use these to infer their actual voice/tone — do NOT invent a voice that contradicts them):\n${samples.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
    : 'No sample posts were provided — infer a plausible, professional voice for this niche instead.'

  return `You are setting up a new user's content profile from minimal input. Be concrete and specific to their niche, not generic.

Niche/domain: ${niche}

${sampleBlock}

Valid pillar domains (pick only from this list): ${allDomains.join(', ')}

Return ONLY a JSON object with this exact shape:
{
  "voice": {
    "description": "1-2 sentence description of their writing voice/tone",
    "doRules": ["3-5 short, concrete do's"],
    "dontRules": ["3-5 short, concrete don'ts"]
  },
  "pillars": [
    {
      "label": "short pillar name",
      "weight": 50,
      "domains": ["one or two values from the valid domains list"],
      "notes": "1 sentence describing what this pillar covers",
      "keywords": ["5-8 concrete keywords/phrases for this pillar"]
    }
  ]
}

Produce exactly 3 pillars covering distinct angles of the niche, weights summing to roughly 100.`
}

module.exports = { buildBootstrapPrompt }
