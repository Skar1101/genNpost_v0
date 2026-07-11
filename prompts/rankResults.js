// Builds the single ranking prompt sent to LLM after all fetchers complete

function buildRankingPrompt(rawItems, instructions = {}) {
  const itemLines = rawItems.map((item, i) => {
    const eng = item.engagement > 0 ? ` [eng:${item.engagement}]` : ''
    const pub = item.publisher ? ` [${item.publisher}]` : ''
    const cat = item.source ? ` [cat:${item.source}]` : ''
    const top = ` [topic:${item.topic === 'human' ? 'human' : 'tech'}]`
    return `${i + 1}.${cat}${top}${pub}${eng} "${item.title}"\n   Snippet: ${(item.snippet || '').slice(0, 120)}\n   URL: ${item.url}`
  }).join('\n\n')

  const focusNote = instructions.focus?.length
    ? `\nFOCUS BIAS: Weight items about "${instructions.focus.join(', ')}" higher.` : ''
  const downweightNote = instructions.downweight?.length
    ? `\nDOWNWEIGHT: Give lower rank to items from: ${instructions.downweight.join(', ')}.` : ''
  const excludeNote = instructions.exclude_topics?.length
    ? `\nEXCLUDE TOPICS: Remove any items about: ${instructions.exclude_topics.join(', ')}.` : ''

  return `You are a content research assistant for a creator on X (Twitter) who blends SELF-DEVELOPMENT, AI-for-humans, and tech — his audience cares about discipline, meditation, self-growth, and how AI affects everyday human life as much as the latest models.

Review these ${rawItems.length} items from multiple sources and return the TOP 20 most relevant items.

HARD EXCLUDE — never include:
- Religion, sports, celebrity gossip, partisan politics
${excludeNote}

CONTENT MIX TARGET — this is a HARD requirement, aim for ~60% human / ~40% tech:
- ~12 items HUMAN (topic:human): discipline/habits, meditation/mindfulness, self-development, use of AI in personal/daily life, and how AI is impacting humans & society
- ~8 items TECH (topic:tech): trending AI/tech news, tools, models, research
- Use the [topic:] tag on each item to hit this split. Do NOT return a majority-tech list even if the tech items have higher engagement.

SOURCE DIVERSITY:
- Include items from multiple different [cat:] categories (aim for 3-4+); no single [cat:] should exceed 6 items.

RANKING CRITERIA:
1. Timely — recent content preferred
2. Surprising or counterintuitive
3. Actionable — reader learns something or can do something
4. Self-development / AI-in-daily-life / AI's-impact-on-humans relevance (primary), OR AI/tech/startup relevance (secondary)
5. High engagement (likes, upvotes, stars, views) signals resonance — but never let it override the 60/40 mix
${focusNote}
${downweightNote}

TRENDING SCORE (0–100):
- 80–100: Must post today
- 60–79: Strong candidate
- 40–59: Good filler
- <40: Skip

POST TYPE:
- "thread" — complex topic, 5–10 tweets
- "long" — one detailed tweet
- "short" — punchy one-liner

ITEMS:
${itemLines}

RETURN JSON ARRAY ONLY — no markdown, no explanation:
[
  {
    "rank": 1,
    "title": "exact title from the item — do not rephrase",
    "snippet": "copy the Snippet text exactly from the item above — do not generate new text",
    "source": "exact source category from [cat:] tag (hackernews|twitter|reddit|github|youtube|arxiv)",
    "publisher": "exact publisher name from the item",
    "url": "exact url from the item — copy exactly, do not modify",
    "trendingScore": 85,
    "postPotential": "thread|long|short",
    "why": "one line — why this matters for a self-development + AI-for-humans audience"
  }
]`
}

module.exports = { buildRankingPrompt }
