const { BANNED_PHRASES } = require('./styleRules')

// Substack-mode article prompt builder. Structurally mirrors prompts/quillArticle.js's
// buildArticlePrompt (same related-content formatting, same anti-slop/citation sections) but the
// OUTPUT contract is rewritten for Substack: real newsletter length, a SUBJECT/PREVIEW/SUBTITLE
// header block, and a trailing image-prompt marker. Kept as a separate file (not a branch inside
// quillArticle.js) so the tested X prompt can never regress from a Substack-only change.

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

function buildSubstackArticlePrompt({ suggestion = {}, template = '', userOverride = '', relatedItems = [] } = {}) {
  const hasSource = !!suggestion.url
  const override = (userOverride || '').trim() || '(none — follow template)'
  const related = formatRelated(relatedItems)

  return `SUBSTACK-MODE WRITING — produce a long-form Substack newsletter post. Follow ALL rules below. User override (at the bottom) has highest priority.

══ TEMPLATE (default voice + structure — user-editable in SUBSTACK_ARTICLE_TEMPLATE.md) ═══
${template || '(template file missing — write a 900–2200 word structured newsletter post with SUBJECT/PREVIEW/SUBTITLE header lines, title, 4-7 bold subheaders, closing, and a trailing ===IMAGE PROMPT=== block.)'}
═════════════════════════════════════════════════════════════════════════════════

══ RELATED CONTENT (research — use as primary citation sources) ═════════════════
Treat these as "what's already been said." Your job is to add a sharper, more specific angle — NOT duplicate. Cite them via Markdown hyperlinks INLINE as you make claims.

${related}
═════════════════════════════════════════════════════════════════════════════════

══ HARD STRUCTURE RULES (NON-NEGOTIABLE) ═══════════════════════════════════════
- **Length: 900-2200 words, 900 is a HARD FLOOR.** A short-but-polished draft still fails this task.
  Write 5-7 body sections, each 3-5 paragraphs (~150-300 words) — do not stop at the minimum of every
  range or you will land far under 900. If you're unsure you've written enough, add another section,
  example, or counterpoint before closing.
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

OUTPUT — exact format, in this order:
SUBJECT: <email subject line, under 70 chars>
PREVIEW: <preview/preheader text, under 140 chars>
SUBTITLE: <one-sentence dek shown under the title>

<Title line>

<article body — 900-2200 words (900 is a hard floor — 5-7 sections of 3-5 paragraphs each), Markdown: **bold** subheaders, [anchor](url) inline links, blank lines between paragraphs, no hashtags>

===IMAGE PROMPT===
<one detailed text-to-image prompt for a header image — concrete visual details, no text/words in the image>

No preamble, no "here is your article", no DRAFT separators — output only the block above, starting with SUBJECT:.

Write it now.`
}

module.exports = { buildSubstackArticlePrompt }
