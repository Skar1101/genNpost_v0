const { BANNED_PHRASES } = require('./styleRules')

// Article-mode prompt builder. Composes:
//   - Template (from ARTICLE_TEMPLATE.md, user-editable voice + structure)
//   - Related research items (from Raven search on the topic — primary citation sources)
//   - Hard structure rules (paragraphs, markdown links, transitions)
//   - Anti-AI-slop ban list (specific tics to never use)
//   - Citation rules (no invented stats)
//   - User override (highest priority — supersedes everything)
//   - The article brief itself

function formatRelated(relatedItems) {
  if (!relatedItems?.length) return '(no related content fetched — write from your knowledge + the brief)'
  return relatedItems.map((r, i) => {
    const title = r.title || '(untitled)'
    const url = r.url || ''
    const src = r.source ? `[${r.source}] ` : ''
    const snippet = r.snippet ? `\n    ${r.snippet.slice(0, 240).replace(/\s+/g, ' ').trim()}` : ''
    return `[${i + 1}] ${src}${title}\n    ${url || '(no url)'}${snippet}`
  }).join('\n\n')
}

function buildArticlePrompt({ suggestion = {}, template = '', userOverride = '', relatedItems = [] } = {}) {
  const hasSource = !!suggestion.url
  const override = (userOverride || '').trim() || '(none — follow template)'
  const related = formatRelated(relatedItems)

  return `ARTICLE-MODE WRITING — produce a long-form X Article. Follow ALL rules below. User override (at the bottom) has highest priority.

══ TEMPLATE (default voice + structure — user-editable in ARTICLE_TEMPLATE.md) ═══
${template || '(template file missing — write a 1500–3500 char structured article with title, hook, 3–4 bold subheaders, closing.)'}
═════════════════════════════════════════════════════════════════════════════════

══ RELATED CONTENT (research — use as primary citation sources) ═════════════════
Treat these as "what's already been said." Your job is to add a sharper, more specific angle — NOT duplicate. Cite them via Markdown hyperlinks INLINE as you make claims.

${related}
═════════════════════════════════════════════════════════════════════════════════

══ HARD STRUCTURE RULES (NON-NEGOTIABLE) ═══════════════════════════════════════
- **Paragraphs:** 2–4 sentences each. NEVER one-sentence-per-line wall-of-text. Blank line between paragraphs.
- **Transitions:** Each new section's opening line should briefly reference or build on the previous section. NO abrupt jumps between subheaders.
- **Subheaders:** Bold markdown only (\`**Subheader**\`). No ALL CAPS, no underlines, no emoji-decorated headers.
- **Links:** Citations are INLINE Markdown hyperlinks — \`[anchor text](url)\` woven into prose.
  Example: "The [recent Anthropic study](https://example.com/study) showed that…"
  NOT: "The recent Anthropic study (Source: https://...) showed…"
- **No reference dump at the end.** Citations live where the claim lives.
═════════════════════════════════════════════════════════════════════════════════

══ CITATION RULES (NON-NEGOTIABLE) ══════════════════════════════════════════════
- EVERY statistic, percentage, dollar amount, user/follower count, or specific number → must cite a URL from the Related Content above or the brief's source URL.
- Do NOT invent statistics, growth rates, revenue figures, or precedents.
- If a claim needs data you lack: omit it or make a qualitative point instead. Never fabricate.
═════════════════════════════════════════════════════════════════════════════════

══ ANTI-SLOP BAN LIST — NEVER USE THESE TICS ═══════════════════════════════════
${BANNED_PHRASES}
- Em-dash chains (— more than 2 per paragraph)
- Three-part templated structures ("First… Second… Finally…") unless genuinely needed
- Empty hooks that promise but don't deliver in the next sentence

**Rule of thumb:** Every sentence should pass the "would a sharp human writer keep this?" test. Cut anything that sounds like a generic essay opener.
═════════════════════════════════════════════════════════════════════════════════

══ USER OVERRIDE (HIGHEST PRIORITY — supersedes ALL above) ═════════════════════
${override}
═════════════════════════════════════════════════════════════════════════════════

══ ARTICLE BRIEF ═════════════════════════════════════════════════════════════════
- Working title: ${suggestion.title || '(unspecified — pick one strong line)'}
- Pillar: ${suggestion.pillar || '(general)'}
- Angle: ${suggestion.angle || '(use the title as the angle)'}
- Primary source URL: ${hasSource ? suggestion.url : '(none — use Related Content above for citations)'}
- Context snippet: ${suggestion.snippet || '(none)'}
═════════════════════════════════════════════════════════════════════════════════

OUTPUT:
- Write the article only — no preamble, no "here is your article", no DRAFT separators.
- Length: 1500–3500 characters total.
- Markdown allowed: **bold** subheaders, [anchor](url) inline links, blank lines between paragraphs.
- No hashtags unless requested above.

Write the article now.`
}

module.exports = { buildArticlePrompt }
