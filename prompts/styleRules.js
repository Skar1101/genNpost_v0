// Shared house-style rules + anti-slop ban list. HOUSE_STYLE_TEXT is injected into Koel
// (tweets/threads/replies) via prompts/koelWrite.js; the article writers carry their own citation
// rules in prompts/quillArticle.js and prompts/heronArticle.js. sanitize/findBannedPhrase/
// findUngroundedStat are the shared deterministic backstops.

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
- Reply/comment filler openers: "Great point", "So true", "This.", "Couldn't agree more", "Well said"
- Generic inspirational closers: "the future of X is here/getting more Y", "we're on the brink of a major
  shift", "allowing creativity/innovation to flourish", "a call to action for anyone", "bridging the gap
  between X and Y", "genuinely benefits humanity" — any closing line that could be pasted onto a
  completely different topic and still technically make sense is too generic, rewrite it specific to
  THIS post`

// Compact house-style block injected into Koel's OUTPUT RULES. Deterministic sanitizer backs the dash rule.
const HOUSE_STYLE_TEXT = `## HOUSE STYLE (non-negotiable)
- NO em dashes (—) or en dashes (–). Use a period or comma instead.
- Breathing room: put a blank line between distinct ideas. Never a dense wall of text.
- No corporate / AI-slop words or filler openers. Banned:
${BANNED_PHRASES}
- Plain, concrete language. Prefer a specific number, name, or example over a vague claim.
- Every sentence must earn its place. If it sounds like a generic essay, cut it.
- REQUIRED: every draft must contain at least one concrete, checkable detail — something that
  couldn't be pasted onto any other topic. That can be a named tool/person/place, a specific moment,
  a real action, or a real number. "Discipline wakes you up at 5 AM" is still a generic template;
  "₹500", "6 months", "3 attempts", "the second week of physio" are real. A number is ONE way to be
  specific, not the only acceptable one — a vivid specific moment fully satisfies this rule.
- ABSOLUTELY FORBIDDEN: stating a percentage, an "X% of people/jobs/founders" claim, or the finding
  of a study/survey/report, UNLESS that exact figure appears in the input material you were given for
  this draft. Do not estimate one. Do not use "up to". Do not round a plausible-sounding guess.
  These are all real failures from this system and every one of them is banned:
    "Confidence can boost your attractiveness by as much as 80%."
    "67% of people report feeling burned out."
    "Mindfulness in just 10 minutes a day can boost your mental clarity by 25%."
    "In 2025, 85% of jobs will require AI skills."
- Writing about a habit, a mindset, discipline, or wellness, you will usually have NO statistic
  available. That is correct and expected — it is not a gap to fill. Reach for a specific moment or a
  countable detail you actually know instead. A post with no number is fine. A post with an invented
  number is a failure, and worse than a vague one.`

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

// Flat, lowercase phrase list for PROGRAMMATIC checking (agents/koel.js's retry-on-slop loop) — the
// BANNED_PHRASES block above is prose formatted for the prompt; this is the same list as literal
// substrings to detect. Kept in sync manually since they serve different purposes (one is read by the
// LLM, one is checked by code) — real evidence this was needed: banned words like "game-changer" and
// "unlock" kept leaking through even though they'd been on the prompt-level ban list for a long time.
const BANNED_PHRASE_LIST = [
  "in today's fast-paced world", 'rapidly evolving', 'ever-changing landscape', 'in this era of',
  "let's dive in", "let's unpack", "let's explore", 'buckle up',
  'in conclusion', 'to wrap up', 'at the end of the day', 'in summary', 'to summarize',
  'synergy', 'paradigm shift', 'game-changer', 'game changer', 'leverage', 'unlock', 'supercharge',
  'the bottom line', 'key takeaways', 'final thoughts', 'wrapping up',
  'many founders', 'most experts agree', 'studies show', 'research suggests',
  'moreover', 'furthermore', 'additionally', 'consequently',
  'navigating this complex landscape', 'in this complex world', 'on this journey',
  'have you ever wondered', 'picture this', 'imagine if',
  'great point', "couldn't agree more", 'well said',
  "we're on the brink", 'allowing creativity to flourish', 'allowing innovation to flourish',
  'a call to action for anyone', 'bridging the gap', 'genuinely benefits humanity',
  'marking a pivotal moment', 'this insight highlights', 'essential reading for anyone',
  'a significant step forward', 'opens up exciting possibilities',
]

function findBannedPhrase(text) {
  const lower = String(text || '').toLowerCase()
  return BANNED_PHRASE_LIST.find(p => lower.includes(p)) || null
}

// ── Ungrounded-statistic detector ─────────────────────────────────────────────
// The house style used to REQUIRE a number in every draft, which on self-help/wellness topics — where
// no real figure exists — the model satisfied by inventing one. Measured before this change: 25% of
// recent drafts and 27% of APPROVED drafts carried a fabricated percentage, and approvals are what the
// analyst learns the voice from, so it compounded.
//
// Returns the offending figure/claim, or null. A figure is "grounded" when its digits actually appear
// in the source material the model was given, so a real cited stat in an AI/research post survives.
const PERCENT_RE = /\b\d{1,3}(?:\.\d+)?\s?%/g
const STUDY_CLAIM_RE = /\b(?:a |the |one |recent |new )?(?:study|survey|report|poll|research)\s+(?:by\s+\w+\s+)?(?:found|shows?|showed|says?|suggests?|reveals?|reports?|indicates?)\b/i
// "1% better / 1% improvement" is the Atomic Habits idiom, not a factual claim about the world.
// Flagging it would make the writer strip a legitimate turn of phrase.
const IDIOM_RE = /\b1\s?%\s*(?:better|improvement|improvements|gains?|rule)\b/i

function findUngroundedStat(text, sourceText = '') {
  const t = String(text || '')
  const src = String(sourceText || '')

  for (const match of t.match(PERCENT_RE) || []) {
    // Compare on digits alone: "25 %" in a draft is grounded by "25%" in the source.
    const digits = match.replace(/[^\d.]/g, '')
    if (digits && src.replace(/\s+/g, '').includes(digits + '%')) continue
    if (digits && new RegExp(`\\b${digits.replace('.', '\\.')}\\s?%`).test(src)) continue
    // Skip the idiom only where it actually appears as the idiom.
    if (digits === '1') {
      const at = t.indexOf(match)
      if (IDIOM_RE.test(t.slice(Math.max(0, at - 10), at + 40))) continue
    }
    return match.trim()
  }

  // "a study found…" invented out of nothing is the other half of the same failure. Grounding here is
  // deliberately loose: if the source material mentions a study/survey/report at all, citing it is
  // legitimate. Requiring the full claim pattern in the source flagged a real Stack Overflow survey.
  const study = t.match(STUDY_CLAIM_RE)
  if (study && !/\b(?:study|studies|survey|report|poll|research|benchmark)\b/i.test(src)) return study[0].trim()

  return null
}

module.exports = { BANNED_PHRASES, HOUSE_STYLE_TEXT, sanitize, findBannedPhrase, findUngroundedStat }
