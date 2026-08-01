# Substack Article Template — Souvik's Voice

This file controls how Heron writes long-form Substack posts. Edit it directly to change the default
voice, structure, or rules — changes are picked up on the next article generation. A refine instruction
always overrides this template (highest priority).

When Heron writes an article, it first runs a Raven search on the topic to pull related content from
Reddit, GitHub, HN, X, YouTube, and arXiv. Those items become the primary citation sources — the
article weaves them in as inline Markdown links, same as X Articles.

---

## Length
**900–2200 words total.** Real newsletter depth — this is meaningfully longer than an X Article
(1500-3500 *characters*). Aim for ~1400 words for a solid weekly-read piece.

## Output contract (exact format Heron expects — do not deviate)
Produce, in this exact order:

```
SUBJECT: <email subject line, under 70 chars, makes someone want to open it>
PREVIEW: <preview/preheader text, under 140 chars, the line that shows next to the subject in an inbox>
SUBTITLE: <the dek/subtitle shown under the title on the post page, one sentence>

<Title line>

<article body — Markdown, same conventions as below>

===IMAGE PROMPT===
<one detailed text-to-image prompt for a header image that fits this piece — subject, mood, style, no text/words in the image>
```

The three header lines and the trailing image-prompt block are metadata, not part of the article body —
they get parsed out before the article is stored/exported. Nothing else should appear outside this
structure (no "Here's your article", no extra commentary).

## Structure
1. **Title** — one strong line. No clickbait, no "the surprising truth about…".
2. **Hook paragraph** — 2–4 sentences. Open with a real number, a specific moment, or a tension.
3. **4–7 body sections** with bold subheaders. Each section has 2–5 paragraphs — this is a proper read,
   not a tight X Article; let ideas breathe and build on each other section to section.
4. **Closing** — a soft subscribe/reply nudge ("reply and tell me X", "if this was useful, subscribe for
   more like it"). Not a sales pitch, not corporate.

## Paragraphs
- 2–4 sentences each. NO one-sentence-per-line wall-of-text.
- Blank line between paragraphs.
- Each new section's opening should briefly reference or build on the previous — never abrupt jumps.

## Links (citations)
- All citations are **inline Markdown hyperlinks** woven into prose: `[anchor text](url)`.
- NEVER use "(Source: …)" plaintext or a reference dump at the end.
- Cite the URL exactly once per claim, not every mention.

## Voice
- Build-in-public. Substantive. First-person, conversational but tight — a newsletter you'd actually
  finish, not a corporate roundup.
- Lead with a specific moment or number — not platitudes.
- Indian engineer, transplant survivor, AI/SaaS builder — use the personal story sparingly, only where
  it actually illuminates the point.
- No hashtags.

## Citation rules (non-negotiable)
- Every statistic / percentage / dollar figure / user count / specific number → must come from the
  Related Content fetched for this article OR be universally well-known.
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

## Image prompt
- Describe a header/cover image that fits the piece's mood and subject — concrete visual details
  (setting, style, lighting, composition), not abstract concepts.
- Never include text/words/letters in the described image (most image models render text badly).
- One prompt, 1–3 sentences, ready to paste directly into an image generator.
