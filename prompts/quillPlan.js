// Suggestion-picker prompt for Quill. Given pillars + trending items, group 2–3 trending
// items per pillar with a short LLM-suggested angle. NO drafts are written here — the
// user clicks a format button per suggestion to trigger Koel.

function buildPlanPrompt({ pillars, trendingItems }) {
  const pillarsList = pillars.map((p, i) =>
    `${i + 1}. ${p.label}${p.notes ? ` — ${p.notes}` : ''}`
  ).join('\n')

  const trendingList = (trendingItems || []).slice(0, 30).map((t, i) =>
    `${i + 1}. [${t.source}] ${t.title}${t.url ? ` (${t.url})` : ''}${t.snippet ? `\n   ${t.snippet.slice(0, 160)}` : ''}`
  ).join('\n')

  return `You are Quill, content planner for Souvik — Indian engineer, transplant survivor, AI/SaaS builder.

CONTENT PILLARS:
${pillarsList}

CURRENT TRENDING ITEMS (cross-source):
${trendingList || '(none — no recent research)'}

TASK:
For EACH pillar above, pick 2–3 trending items that best match the pillar and suggest a content angle for each.

Rules:
- 2–3 items per pillar (closer to 3 when good matches exist, 2 when only weak matches)
- Prefer items that genuinely connect to the pillar — don't force weak matches
- If a pillar has NO good trending match, still include 1–2 "evergreen" items where the title is your suggested topic and source/url are empty strings (mark snippet as "(no trending hook — evergreen angle)")
- Spread across DIFFERENT sources where possible within a pillar
- "angle" must be ONE concrete sentence: hook + Souvik-specific POV. No generic AI-slop angles.

Return ONLY valid JSON — no markdown, no preamble:
{
  "suggestions": [
    {
      "pillar": "exact pillar label as given",
      "items": [
        {
          "title": "use the trending item's title (or your evergreen topic title)",
          "source": "reddit|github|hackernews|twitter|youtube|ai_research|news|''",
          "url": "the trending item's url, or empty string for evergreen",
          "snippet": "1-line context (or '(no trending hook — evergreen angle)')",
          "angle": "ONE-sentence angle: hook + Souvik POV"
        }
      ]
    }
  ]
}`
}

module.exports = { buildPlanPrompt }
