// Repost-mode instruction for Koel. Voice/profile/best-tweets are injected separately by koel.write's
// buildContextBlock, so this only carries the repost-specific brief (the viral post + how to quote it).
// The result is passed as koel.write's `extraInstructions` (highest priority in the Koel user prompt).
//
// A "repost" here = the COMMENT Souvik adds when quote-tweeting a viral post. It's a neutral highlight of
// the post itself — NOT Souvik's personal opinion or take. Draft-only — Souvik posts the quote-tweet himself.
//
// Real bug found + fixed (2026-08-08): "neutral, third-person, not personal opinion" was being
// interpreted as PRESS-RELEASE/EXPLAINER tone — real posted examples came back reading like "X has
// launched Y, marking a pivotal moment... this insight highlights the intersection of innovation and
// ethics... essential reading for anyone." That register is a big part of why those specific posts got
// zero engagement. "Neutral" means not about Souvik's personal life — it does NOT mean hedged, soft, or
// summary-toned. The comment still needs a sharp, clear stance.

function buildRepostPrompt({ sourceText = '', author = '', extra = '' } = {}) {
  const src = String(sourceText).replace(/\s+/g, ' ').trim().slice(0, 600)
  const by = author ? ` by ${author}` : ''
  return `QUOTE-REPOST MODE — write the COMMENT Souvik adds when quote-tweeting the viral post below. This highlights the post itself, NOT a reply and NOT a standalone tweet.

THE VIRAL POST${by}:
"${src}"

Rules for the quote-repost comment:
- Take a real, sharp STANCE on the post — bigger than it looks, overhyped, the part everyone's missing,
  what it actually means. "Neutral" means not about Souvik's personal life/story — it does NOT mean
  hedged, soft, or explainer-toned. A comment with no real opinion in it is not acceptable output.
- No first-person opinion language framed as personal experience ("in my experience", "my take is",
  "when I..."). A direct stance stated as fact ("this is bigger than it looks") is fine and expected —
  that's not the same as "personal opinion language," it's just having a point of view.
- BANNED — this is a press release, not a quote-tweet, if you catch yourself writing any of these:
  "marking a pivotal moment", "this insight highlights", "the intersection of X and Y", "essential
  reading for anyone", "a significant step forward", "opens up exciting possibilities", "elevate their
  [craft/content/work]", any sentence that could be swapped onto a different product announcement
  unchanged. If the comment reads like a news summary or a product description, rewrite it.
- Length: 3-6 lines, roughly 400-700 characters — long enough to properly convey the post's substance,
  not just react to it. Length is not an excuse to pad with explainer filler.
- No hashtags. No em dashes. No "This is huge" / "So true" / "Great thread" filler openers.
${extra ? '\nExtra direction: ' + extra : ''}
Output ONLY the comment text — no quotes, no preamble, no "Repost:" label.`
}

module.exports = { buildRepostPrompt }
