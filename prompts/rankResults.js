// Builds the single ranking prompt sent to LLM after all fetchers complete

function buildRankingPrompt(rawItems, instructions = {}) {
  const itemLines = rawItems.map((item, i) => {
    const eng = item.engagement > 0 ? ` [eng:${item.engagement}]` : ''
    const pub = item.publisher ? ` [${item.publisher}]` : ''
    const cat = item.source ? ` [cat:${item.source}]` : ''
    return `${i + 1}.${cat}${pub}${eng} "${item.title}"\n   Snippet: ${(item.snippet || '').slice(0, 120)}\n   URL: ${item.url}`
  }).join('\n\n')

  const focusNote = instructions.focus?.length
    ? `\nFOCUS BIAS: Weight items about "${instructions.focus.join(', ')}" higher.` : ''
  const downweightNote = instructions.downweight?.length
    ? `\nDOWNWEIGHT: Give lower rank to items from: ${instructions.downweight.join(', ')}.` : ''
  const excludeNote = instructions.exclude_topics?.length
    ? `\nEXCLUDE TOPICS: Remove any items about: ${instructions.exclude_topics.join(', ')}.` : ''

  return `You are a content research assistant for a tech/AI creator on X (Twitter).

Review these ${rawItems.length} items from multiple sources and return the TOP 20 most relevant items for a tech/AI audience.

HARD EXCLUDE — never include:
- Religion, sports, celebrity gossip, politics
${excludeNote}

SOURCE DIVERSITY REQUIRED:
- You MUST include items from multiple different [cat:] categories
- Do NOT pick only from one category (e.g. only twitter)
- Aim for at least 3-4 different source categories in your final 20
- If a category has strong items, include 3-5 from it; no single category should exceed 6 items

RANKING CRITERIA:
1. Timely — recent content preferred
2. Surprising or counterintuitive
3. Actionable — reader learns something or can do something
4. AI/tech/startup relevance — new tools, models, research, funding
5. High engagement (likes, upvotes, stars, views) signals resonance
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
    "source": "exact source category from [cat:] tag (hackernews|twitter|reddit|github|youtube|news|ai_research)",
    "publisher": "exact publisher name from the item",
    "url": "exact url from the item — copy exactly, do not modify",
    "trendingScore": 85,
    "postPotential": "thread|long|short",
    "why": "one line — why this matters for a tech/AI audience"
  }
]`
}

module.exports = { buildRankingPrompt }
