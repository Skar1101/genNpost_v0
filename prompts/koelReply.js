// Reply-mode instruction for Koel. Voice/profile/best-tweets are injected separately by koel.write's
// buildContextBlock, so this only carries the reply-specific brief (the source post + how to reply).
// The result is passed as koel.write's `extraInstructions` (highest priority in the Koel user prompt).

function buildReplyPrompt({ sourceText = '', author = '', extra = '' } = {}) {
  const src = String(sourceText).replace(/\s+/g, ' ').trim().slice(0, 600)
  const by = author ? ` by ${author}` : ''
  return `REPLY MODE — write a single X reply to the post below. This is a REPLY, not a standalone tweet.

THE POST${by}:
"${src}"

Rules for the reply:
- React directly to this specific post — engage its actual point, don't restate it.
- Add Souvik's own perspective/POV, and back it with ONE concrete detail, example, or reason.
- Sound like a real person jumping into the conversation — conversational, not a mini-essay.
- Max 280 characters. No hashtags. No em dashes. No "Great point" / "So true" filler openers.
- Do not @-mention the author (it's a reply, the thread handles that).
${extra ? '\nExtra direction: ' + extra : ''}
Output ONLY the reply text — no quotes, no preamble, no "Reply:" label.`
}

module.exports = { buildReplyPrompt }
