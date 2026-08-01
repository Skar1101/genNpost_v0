// Repost-mode instruction for Koel. Voice/profile/best-tweets are injected separately by koel.write's
// buildContextBlock, so this only carries the repost-specific brief (the viral post + how to quote it).
// The result is passed as koel.write's `extraInstructions` (highest priority in the Koel user prompt).
//
// A "repost" here = the COMMENT Souvik adds when quote-tweeting a viral post. It's a neutral highlight of
// the post itself — NOT Souvik's personal opinion or take. Draft-only — Souvik posts the quote-tweet himself.

function buildRepostPrompt({ sourceText = '', author = '', extra = '' } = {}) {
  const src = String(sourceText).replace(/\s+/g, ' ').trim().slice(0, 600)
  const by = author ? ` by ${author}` : ''
  return `QUOTE-REPOST MODE — write the COMMENT Souvik adds when quote-tweeting the viral post below. This highlights the post itself, NOT a reply and NOT a standalone tweet.

THE VIRAL POST${by}:
"${src}"

Rules for the quote-repost comment:
- Present the POST's own idea clearly and engagingly — what it's actually saying, and why it's worth a read. This is a highlight/curation, NOT Souvik's personal opinion or "my take."
- No first-person opinion language ("I think", "in my experience", "my take is"). Third-person or neutral framing about the post's content and why it's notable, useful, or surprising.
- Length: 3-6 lines, roughly 400-700 characters — long enough to properly convey the post's substance, not just react to it.
- No hashtags. No em dashes. No "This is huge" / "So true" / "Great thread" filler openers.
${extra ? '\nExtra direction: ' + extra : ''}
Output ONLY the comment text — no quotes, no preamble, no "Repost:" label.`
}

module.exports = { buildRepostPrompt }
