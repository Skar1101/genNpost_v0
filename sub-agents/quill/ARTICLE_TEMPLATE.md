# X Article Template — Souvik's Voice

This file controls how Quill writes **Article** format drafts for X Articles.
Edit it directly to change the default voice, structure, or rules — changes are
picked up on the next article generation. Anything passed in the Refine input or
via `/quill article` will override this template (highest priority).

When you click Article, Quill first runs a Raven search on the topic to pull
related content from Reddit, GitHub, HN, X, YouTube, and arXiv. Those items become
the primary citation sources — the article weaves them in as inline Markdown links.

---

## Length
**1500–3500 characters total.** Aim for ~2000 for a tight, readable piece.

## Structure
1. **Title** — one strong line. No clickbait, no "the surprising truth about…".
2. **Hook paragraph** — 2–3 sentences. Open with a real number, a specific moment, or a tension. Promise what the reader will get.
3. **3–4 body sections** with bold subheaders. Each section has 2–4 short paragraphs.
4. **Closing** — reflection, soft CTA, or honest question. Not a sales pitch.

## Paragraphs
- 2–4 sentences each. NO one-sentence-per-line wall-of-text.
- Blank line between paragraphs.
- Each new section's opening should briefly reference or build on the previous — never abrupt jumps.

## Links (citations)
- All citations are **inline Markdown hyperlinks** woven into prose: `[anchor text](url)`.
- Example: "The [recent Anthropic study](https://example.com) showed a 40% drop in…"
- NEVER use "(Source: …)" plaintext or a reference dump at the end.
- Cite the URL exactly once per claim, not every mention.

## Voice
- Build-in-public. Substantive. First-person, conversational but tight.
- Lead with a specific moment or number — not platitudes.
- Indian engineer, transplant survivor, AI/SaaS builder — but use the personal story sparingly, only where it actually illuminates the point.
- No hashtags unless explicitly asked.

## Citation rules (non-negotiable)
- Every statistic / percentage / dollar figure / user count / specific number → must come from the Related Content fetched for this article OR be universally well-known.
- Do NOT invent statistics, growth rates, revenue, or user counts.
- If a claim needs data you don't have: omit it, or make a qualitative point instead.

## Anti-slop tics to avoid
- "In today's fast-paced world", "increasingly", "rapidly evolving"
- "Let's dive in", "let's unpack", "let's explore"
- "In conclusion", "to wrap up", "at the end of the day"
- Buzzword stacks: "synergy", "10x", "game-changer", "paradigm shift"
- Empty subheadings: "The Bottom Line", "Key Takeaways"
- Vague claims: "many founders", "most experts agree", "studies show"
- Filler transitions: "moreover", "furthermore", "additionally"
- AI-confession phrases: "navigating this complex landscape"
- Generic openers: "Have you ever wondered…", "Picture this…"
- Em-dash chains (more than 2 per paragraph)

## Formatting
- Bold subheaders via `**Subheader**`
- Blank lines between paragraphs
- No emoji in subheaders. One or two emoji in body is fine if natural, never decorative.
