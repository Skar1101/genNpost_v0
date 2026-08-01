// Repost-mode instruction for Koel. Voice/profile/best-tweets are injected separately by koel.write's
// buildContextBlock, so this only carries the repost-specific brief (the viral post + how to quote it).
// The result is passed as koel.write's `extraInstructions` (highest priority in the Koel user prompt).
//
// A "repost" here = the COMMENT Souvik adds when quote-tweeting a viral post. It must add value, not just
// echo the post. Draft-only — Souvik posts the quote-tweet himself.

function buildRepostPrompt({ sourceText = '', author = '', extra = '' } = {}) {
  const src = String(sourceText).replace(/\s+/g, ' ').trim().slice(0, 600)
  const by = author ? ` by ${author}` : ''
  return `QUOTE-REPOST MODE — write the COMMENT Souvik adds when quote-tweeting the viral post below. This is his take stacked on top of the post, NOT a reply and NOT a standalone tweet.

THE VIRAL POST${by}:
"${src}"

Rules for the quote-repost comment:
- Add clear VALUE on top of the post: a sharper insight, a builder's angle, a concrete example, a number, or a useful "so what". This is Souvik's own take, not a caption for the post.
- Do NOT just summarize, react to, or agree with the post — that's a report, not a take. Go deeper: explain WHY it matters, add a specific example or lived-experience detail, or push back with a sharper angle.
- Length: 3-6 lines, roughly 400-700 characters. Long enough to actually say something with substance, short enough to still read as a tweet, not an essay. A single punchy line is NOT enough here.
- Make it engaging and scroll-stopping — the reader sees your comment first, the quoted post below it. Open with a hook, build the point, land on something the reader takes away.
- No hashtags. No em dashes. No "This is huge" / "So true" / "Great thread" filler openers.
- Write as Souvik, first person, in his voice.
${extra ? '\nExtra direction: ' + extra : ''}
Output ONLY the comment text — no quotes, no preamble, no "Repost:" label.`
}

module.exports = { buildRepostPrompt }
