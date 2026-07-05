// Shared house-style rules + anti-slop ban list, used by both Koel (tweets/threads/replies)
// and Quill's article writer. One source of truth so the voice stays consistent everywhere.

// The AI-slop / corporate tics to never use. Kept as one block so it reads well inside a prompt.
const BANNED_PHRASES = `- "In today's fast-paced world" / "increasingly" / "rapidly evolving" / "ever-changing landscape" / "in this era of"
- "Let's dive in" / "let's unpack" / "let's explore" / "buckle up"
- "In conclusion" / "to wrap up" / "at the end of the day" / "in summary" / "to summarize"
- Buzzword stacks: "synergy", "paradigm shift", "10x", "game-changer", "leverage", "unlock", "supercharge"
- Empty subheadings: "The Bottom Line", "Key Takeaways", "Final Thoughts", "Wrapping Up"
- Vague claims: "many founders", "most experts agree", "studies show", "research suggests" — replace with a SPECIFIC example
- Filler transitions: "moreover", "furthermore", "additionally", "consequently"
- AI-confession phrases: "navigating this complex landscape", "in this complex world", "on this journey"
- Generic openers: "Have you ever wondered…", "Picture this…", "Imagine if…"
- Reply/comment filler openers: "Great point", "So true", "This.", "Couldn't agree more", "Well said"`

// Compact house-style block injected into Koel's OUTPUT RULES. Deterministic sanitizer backs the dash rule.
const HOUSE_STYLE_TEXT = `## HOUSE STYLE (non-negotiable)
- NO em dashes (—) or en dashes (–). Use a period or comma instead.
- Breathing room: put a blank line between distinct ideas. Never a dense wall of text.
- No corporate / AI-slop words or filler openers. Banned:
${BANNED_PHRASES}
- Plain, concrete language. Prefer a specific number, name, or example over a vague claim.
- Every sentence must earn its place. If it sounds like a generic essay, cut it.`

// Deterministic post-pass — the safety net for rules an LLM tends to slip on (mainly em dashes).
// Kept intentionally small: replace em/en dashes with a comma (but not inside numeric ranges like 5–10),
// and collapse runs of blank lines. Does NOT touch wording — the prompt handles that.
function sanitize(text) {
  if (!text) return text
  let out = String(text)
  // Replace em/en dashes used as punctuation with ", " — but leave numeric ranges (5–10) intact.
  out = out.replace(/(?<!\d)\s*[—–]\s*(?!\d)/g, ', ')
  // Collapse 3+ consecutive newlines down to a single blank line.
  out = out.replace(/\n{3,}/g, '\n\n')
  return out.trim()
}

module.exports = { BANNED_PHRASES, HOUSE_STYLE_TEXT, sanitize }
