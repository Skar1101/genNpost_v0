// Suggestion-picker prompt for Parrot (LinkedIn). Given the day's trending items across Raven's
// sources, group 2-3 items per category (career, ai, building-in-public) with a short LLM-suggested
// angle. Mirrors prompts/quillPlan.js's shape, using Parrot's fixed 3 categories instead of Quill's
// content pillars — no drafts are written here, the user taps a suggestion to trigger Koel.

function buildParrotPlanPrompt({ trendingItems }) {
  const trendingList = (trendingItems || []).slice(0, 30).map((t, i) =>
    `${i + 1}. [${t.source}] ${t.title}${t.url ? ` (${t.url})` : ''}${t.snippet ? `\n   ${t.snippet.slice(0, 160)}` : ''}`
  ).join('\n')

  return `You are Parrot, LinkedIn content planner for Souvik — Indian engineer, kidney transplant survivor, 5 medals for India, AI/SaaS builder.

CURRENT TRENDING ITEMS (cross-source — this is the same research pool Quill/Heron use, not LinkedIn-native data):
${trendingList || '(none — no recent research)'}

CATEGORIES (fixed — always these three):
1. career — professional growth, leadership, career lessons. Freetext-friendly: if nothing in the
   trending list fits, propose a genuine professional-development angle yourself (title/source/url empty).
2. ai — AI/tech industry commentary. Prefer real trending items above; this category should draw from
   the list when a good candidate exists.
3. building-in-public — the practice/reality of building a product or business in public as a topic
   (NOT Souvik's own story — a general observation or take on building-in-public itself). Freetext-friendly
   like career.

TASK:
For EACH category above, pick 2-3 items and suggest a LinkedIn-appropriate content angle for each —
professional/thought-leadership register, not X's punchy one-liner style.

Rules:
- 2-3 items per category (closer to 3 when good trending matches exist for "ai", 2 for the more
  freetext-leaning categories)
- Prefer items that genuinely connect to the category — don't force weak matches
- If a category has no good trending match, include a freetext item (title = your suggested topic,
  source/url empty, snippet = "(no trending hook — evergreen angle)")
- "angle" must be ONE concrete sentence: a hook + a clear point of view on the topic — NOT framed as
  Souvik's personal story or journey ("in my experience...", "when I..."). Write as a direct observation
  or take, not a personal narrative.

Return ONLY valid JSON — no markdown, no preamble:
{
  "suggestions": [
    {
      "category": "career|ai|building-in-public",
      "items": [
        {
          "title": "use the trending item's title (or your evergreen topic title)",
          "source": "reddit|github|hackernews|twitter|youtube|arxiv|''",
          "url": "the trending item's url, or empty string for evergreen",
          "snippet": "1-line context (or '(no trending hook — evergreen angle)')",
          "angle": "ONE-sentence angle: hook + Souvik POV"
        }
      ]
    }
  ]
}`
}

module.exports = { buildParrotPlanPrompt }
