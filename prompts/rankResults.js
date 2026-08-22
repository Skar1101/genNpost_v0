// Builds the single ranking prompt sent to LLM after all fetchers complete.
//
// Platform fit rides along in this SAME call rather than three separate ranking passes — it costs a
// few extra output tokens per item instead of 3× the requests. Quill/Parrot/Heron then each pull
// from one shared pool sorted by their own score, instead of all three taking the same top items.

// Renders the per-platform keyword priorities (state/keywordsStore.js) into the prompt.
function keywordBlock(platformKeywords) {
  if (!platformKeywords) return ''
  const lines = Object.entries(platformKeywords)
    .filter(([, terms]) => terms && terms.length)
    .map(([p, terms]) => `- ${p}: ${terms.join(', ')}`)
  if (!lines.length) return ''
  return `\nPLATFORM KEYWORD PRIORITIES — use these when scoring platformFit (an item matching a platform's terms should score higher FOR THAT PLATFORM):\n${lines.join('\n')}`
}

// The subjects and ban list come from the editable content strategy, so changing positioning is a
// Settings edit rather than a code change here.
function strategyBlocks() {
  let s
  try { s = require('../state/strategyStore').get(null) } catch (_) { s = null }
  if (!s) return { positioning: '', pillarList: '', exclusions: '', domainList: '' }

  const active = (s.pillars || []).filter(p => p.active)
  return {
    positioning: s.positioning || '',
    pillarList: active.map(p => `- **${p.label}** — ${p.notes || p.domains.join(', ')}`).join('\n'),
    exclusions: (s.exclusions || []).map(e => `- ${e}`).join('\n'),
    domainList: active.flatMap(p => p.domains).filter((d, i, a) => a.indexOf(d) === i).join(', '),
  }
}

function buildRankingPrompt(rawItems, instructions = {}, platformKeywords = null) {
  const S = strategyBlocks()
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

  return `You are a content research assistant for a creator on X (Twitter) positioned as: **${S.positioning}**.

They publish on these subjects and NOTHING else:
${S.pillarList}

Review these ${rawItems.length} items from multiple sources and return the TOP 30 most relevant items.

HARD EXCLUDE — never include, no matter how popular:
${S.exclusions}
- Anything not clearly about one of the subjects above. **If you have to argue for why it fits, it does not fit — drop it.**

It is much better to return FEWER items than to pad the list with off-topic filler. If only 8 items genuinely qualify, return 8.
${excludeNote}

CONTENT MIX TARGET — this is a HARD requirement, aim for ~60% human / ~40% tech:
- ~12 items HUMAN (topic:human): discipline/habits, meditation/mindfulness, self-development, use of AI in personal/daily life, and how AI is impacting humans & society
- ~8 items TECH (topic:tech): trending AI/tech news, tools, models, research
- Use the [topic:] tag on each item to hit this split. Do NOT return a majority-tech list even if the tech items have higher engagement.
- **The mix is a target, not a licence to include junk.** Never pad the human side with off-topic
  lifestyle/trivia content just to hit 12. An on-topic list of 8 beats a padded list of 20.

AI-TOOLS ARE THE PRIORITY. Keep at least 3-4 "ai-tools" items whenever the list contains them.
GitHub and Hacker News items are the main source of these, and they often have terse, unglamorous
titles (a bare repo name like "AutoGPT", or "Show HN: ..."). **Do not discard a genuine tool because
its title is plain** — a real, usable AI tool is worth more to this creator than a viral tweet about
AI. Judge it on what it IS, not how it's worded.

DOMAIN — label every item with exactly one. The ones in use for this account are: ${S.domainList}.
- "ai-tools"     a usable AI tool, agent, product, model release, repo, or a practical how-to. The most valuable kind.
- "ai-research"  papers and academic work. Genuine AI, but rarely makes a good post on its own.
- "ai-impact"    how AI is changing work, jobs, daily life, society.
- "self-help"    discipline, habits, focus, mindset, consistency, resilience. Raw and specific, never soft self-care fluff.
- "wellness"     sleep, energy, recovery, meditation, mental and physical health. Secular and evidence-led.
- "building"     solo SaaS, indie business, building in public.
- "other"        anything else — and if you're labelling something "other", it should almost certainly have been excluded above instead.

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

PLATFORM FIT (0–100 per platform, scored INDEPENDENTLY — an item can be great for one and useless for another):
- "x" — works as a punchy, contrarian, or timely take. Rewards a sharp single idea, cultural relevance, immediacy.
- "linkedin" — works as professional/industry commentary. Rewards career relevance, workplace impact, something a professional could apply. Motivational-poster material scores LOW here.
- "substack" — works as depth. Rewards an idea worth 100+ words, evergreen relevance, something that repays thinking about. Pure news scores LOW here.
Do not give the same three numbers to every item. If an item genuinely only suits one platform, the other two should be low.${keywordBlock(platformKeywords)}

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
    "domain": "ai-tools|ai-research|ai-impact|wellness|building|other",
    "platformFit": { "x": 85, "linkedin": 30, "substack": 60 },
    "why": "one line — why this matters for a self-development + AI-for-humans audience"
  }
]`
}

module.exports = { buildRankingPrompt }
