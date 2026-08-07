const fs = require('fs')
const path = require('path')
const { HOUSE_STYLE_TEXT } = require('./styleRules')

const KOEL_DIR = path.join(__dirname, '..', 'sub-agents', 'koel')

function loadFile(filename) {
  try { return fs.readFileSync(path.join(KOEL_DIR, filename), 'utf8') } catch (_) { return '' }
}

// Cache loaded once at startup — call reloadKnowledge() after editing files
let _cache = null

function reloadKnowledge() {
  _cache = {
    identity:       loadFile('IDENTITY.md'),
    writingCtx:     loadFile('writing_principles_context.txt'),
    copyPrinciples: loadFile('twitter_copy_principles.md'),
    examples:       loadFile('HIGH-PERFORMING_TWEET_EXAMPLES_100K_Views_V2.txt'),
    engTemplates:   loadFile('Engagement_Post_Templates.txt'),
    viralLongform:  loadFile('Viral_long_form_template.txt'),
  }
  return _cache
}

// Load on first require
reloadKnowledge()

function getKnowledge() {
  return _cache
}

// ── Format descriptions shown in UI ──────────────────────────────────────────
const FORMAT_META = {
  short:       { label: 'Short Form',         desc: 'Single tweet, punchy & direct, max 280 chars' },
  thread:      { label: 'Thread',             desc: '5–8 tweet thread, numbered, standalone tweets, one CTA' },
  longform:    { label: 'Long Form',          desc: 'Single detailed post, 500–900 chars' },
  motivational:{ label: 'Motivational',       desc: 'Personal story or resilience post, emotional + universal' },
  engagement:  { label: 'Engagement Farming', desc: 'DM giveaway post with CTA keyword' },
  note:        { label: 'Substack Note',      desc: '1–2 lines, punchy, tied to your niche/pillars' },
  // Daily-drop only — not a manually-selectable format (kept out of KoelPage.jsx's format list on
  // purpose). Raw, hook-driven, punchline-length; no forced personal-story framing.
  punch:       { label: 'Punch',              desc: '1–2 lines, raw hook, built to go viral — daily drop only' },
  // Heron daily-drop only (kept out of KoelPage.jsx's format list) — a step up from a Substack Note:
  // enough room to develop one thought with a concrete detail, still well short of an article.
  heronMid:    { label: 'Heron Mid-Post',     desc: '~80–120 words, one developed thought — Heron daily drop only' },
  // Quote-repost comment (Quill's repost pipeline only) — own format so its 400-700 char target
  // doesn't compete with the 'short' format's own 280-char cap (they were conflicting when reposts
  // reused 'short' + an extraInstructions override alone).
  repost:      { label: 'Quote-Repost',       desc: 'Neutral highlight of the quoted post, 400-700 chars — reposts only' },
  // Parrot (LinkedIn) only — different platform, different register: professional/thought-leadership,
  // not X's punchy one-liner style. Short hashtag use is appropriate here (unlike everywhere else).
  linkedin:    { label: 'LinkedIn Post',      desc: 'Professional/thought-leadership, ~150-300 words — Parrot only' },
}

// ── Build the system prompt from cached knowledge ────────────────────────────
function buildKoelSystemPrompt() {
  const k = getKnowledge()
  return `${k.identity}

---
## WRITING PRINCIPLES
${k.writingCtx}

---
## TWITTER COPY PRINCIPLES
${k.copyPrinciples}

---
## HIGH-PERFORMING TWEET EXAMPLES (100K+ Views)
${k.examples}

---
## ENGAGEMENT POST TEMPLATES
${k.engTemplates}

---
## VIRAL LONG-FORM TEMPLATE
${k.viralLongform}

---
${HOUSE_STYLE_TEXT}

---
## OUTPUT RULES (CRITICAL)
- Produce EXACTLY the number of drafts stated in the instructions below — no more, no fewer
- Separate drafts with: --- DRAFT 2 ---, --- DRAFT 3 ---, etc. (one separator per additional draft,
  matching the requested count)
- Start with DRAFT 1 (no header needed, just start writing)
- Never explain your choices, never add notes or meta-commentary
- Never number lines inside a tweet
- Keep threads clearly separated: Tweet 1/, Tweet 2/ etc.
- Motivational posts: ground them in Souvik's real story (transplant, medals, building)
- Engagement posts: always end with Comment "[KEYWORD]" + follow → I'll DM it (must be following)
- Do not add hashtags unless asked
- Write as Souvik in first person always
- Use standard sentence casing — capitalize the start of sentences and proper nouns (AI, product/brand
  names, etc.). Do not write in all-lowercase unless the profile explicitly opts in via a line that
  says "CASE: write everything in lowercase"`
}

// ── Build the live context block (read-before-write) ─────────────────────────
// Turns memory.loadContext() into a prompt section: profile/voice + approved patterns to lean
// toward + rejected angles to NEVER repeat. Injected fresh on every call (not cached).
function oneLine(t) { return String(t || '').replace(/\s+/g, ' ').trim().slice(0, 160) }
// Best tweets can be plain strings or { text, url } objects — get the calibratable text.
function bestTweetText(t) {
  if (!t) return ''
  if (typeof t === 'string') return t.trim()
  return String(t.text || t.url || '').trim()
}

function buildContextBlock(ctx) {
  if (!ctx) return ''
  const out = []
  const p = ctx.profile
  if (p) {
    const id = p.identity || {}
    const v = p.voice || {}
    out.push('=== CREATOR PROFILE (write AS this person, in this exact voice) ===')
    if (id.name) out.push(`Name: ${id.name}`)
    if (id.handle) out.push(`Handle: @${id.handle}`)
    if (id.niche) out.push(`Niche: ${id.niche}`)
    if (id.audience) out.push(`Audience: ${id.audience}`)
    if (v.description) out.push(`Voice: ${v.description}`)
    if (v.doRules && v.doRules.length) out.push('DO: ' + v.doRules.join(' · '))
    if (v.dontRules && v.dontRules.length) out.push("DON'T (hard rules, never violate): " + v.dontRules.join(' · '))
    if (p.restrictions && p.restrictions.length) out.push('Avoid: ' + p.restrictions.join(' · '))
    // Opt-in lowercase voice — only when the profile explicitly sets it.
    if (v.lowercase) out.push('CASE: write everything in lowercase (no capitalization at sentence starts or on proper nouns), for a casual all-lowercase voice.')
  }
  // Best tweets are the gold-standard voice reference — show them first and fuller than learned examples.
  const best = (p && p.bestTweets ? p.bestTweets : []).map(bestTweetText).filter(Boolean)
  if (best.length) {
    out.push('\n=== YOUR BEST TWEETS (the gold standard — match THIS voice, rhythm, and quality bar) ===')
    best.slice(0, 5).forEach(t => out.push('- ' + t.replace(/\s+/g, ' ').trim().slice(0, 320)))
  }
  if (ctx.voiceExamples && ctx.voiceExamples.length) {
    out.push('\n=== VOICE EXAMPLES (mirror the rhythm & phrasing, not the topic) ===')
    ctx.voiceExamples.slice(-8).forEach(e => out.push('- ' + oneLine(e.text)))
  }
  if (ctx.approved && ctx.approved.length) {
    out.push('\n=== RECENTLY APPROVED (what resonates — lean toward these patterns) ===')
    ctx.approved.slice(-6).forEach(e => out.push('- ' + oneLine(e.text)))
  }
  // Learned performance insights (Phase 4) — what actually landed with the audience.
  const ins = ctx.insights
  if (ins && (ins.workingHooks?.length || ins.workingTopics?.length || ins.avoid?.length)) {
    out.push('\n=== WHAT IS WORKING (from real post performance — lean into these) ===')
    if (ins.workingHooks?.length) out.push('Hooks that land: ' + ins.workingHooks.slice(0, 5).join(' · '))
    if (ins.workingFormats?.length) out.push('Formats that land: ' + ins.workingFormats.slice(0, 4).join(' · '))
    if (ins.workingTopics?.length) out.push('Topics that land: ' + ins.workingTopics.slice(0, 6).join(' · '))
    if (ins.avoid?.length) out.push('AVOID (underperformed): ' + ins.avoid.slice(0, 6).join(' · '))
  }
  if (ctx.rejected && ctx.rejected.length) {
    out.push('\n=== REJECTED ANGLES — DO NOT REPEAT THESE (avoid the angle and its reason) ===')
    ctx.rejected.slice(-10).forEach(e => out.push(`- ${oneLine(e.text)}${e.reason ? '  (reason: ' + e.reason + ')' : ''}`))
  }
  return out.join('\n')
}

// ── Build the user prompt ─────────────────────────────────────────────────────
function buildKoelUserPrompt({ format, input, inputType, count = 3, extraInstructions = '' }) {
  const meta = FORMAT_META[format] || FORMAT_META.short
  const inputLabel = {
    url:       'ARTICLE/URL TO WRITE ABOUT',
    topic:     'TOPIC/HEADLINE FROM RESEARCH',
    freetext:  'INSTRUCTION/TOPIC',
  }[inputType] || 'TOPIC'

  let formatGuide = ''
  if (format === 'short') {
    formatGuide = count === 1
      ? `Write ONE short-form tweet — max 280 chars, aim for 150-220 to leave safety margin. 2-3 short lines with a line break between them. Open with a hook that stops the scroll, land ONE clear point. No preamble, no filler, no meta-commentary.`
      : `Write ${count} SHORT FORM tweets — single tweet each, max 280 chars, aim for 150-220 to leave safety margin. 2-3 short lines each, line break between them. Each opens with a hook, lands ONE clear point. The ${count} drafts must each take a DISTINCT angle — not rewordings of the same idea.`
  } else if (format === 'thread') {
    formatGuide = 'Write a THREAD, 5-8 tweets max (fewer, sharper wins). Tweet 1 is a hook that promises a SPECIFIC payoff. Number each: "Tweet 1/" "Tweet 2/" etc. Every tweet must stand alone — it should make sense if read out of order or screenshotted by itself. Exactly ONE call-to-action, and only in the final tweet. No CTA mid-thread.'
  } else if (format === 'longform') {
    formatGuide = `Write ${count} LONG FORM posts (single post, 400-900 chars each). Personal/build-in-public voice. Follow this skeleton (do NOT print the labels): hook → insight → translation (what it means for the reader) → POV. Line breaks every 1-2 sentences. The ${count} drafts must each take a DISTINCT angle.`
  } else if (format === 'motivational') {
    formatGuide = `Write ${count} MOTIVATIONAL posts. Ground each in Souvik's real story (transplant comeback, medals, building). Universal lesson at end. Emotional but not cringey.`
  } else if (format === 'engagement') {
    formatGuide = `Write ${count} ENGAGEMENT FARMING posts. Each has: hook → what you're giving away → 3 bullet benefits → CTA with a keyword (must be following). Make the keyword relevant and punchy.`
  } else if (format === 'note') {
    const noteNoAngle = `Do NOT frame this through Souvik's personal journey or story ("in my experience...", "when I..."). Write it as a direct observation or point about the topic itself — no personal angle.`
    formatGuide = count === 1
      ? `Write ONE Substack Note — 1-2 short lines, punchy, a single sharp point tied to Souvik's niche/pillars. No hashtags, no thread numbering. Aim under ~400 characters — this is a quick aside, not a mini-essay. ${noteNoAngle}`
      : `Write ${count} Substack Notes — 1-2 short lines each, punchy, a single sharp point tied to Souvik's niche/pillars. No hashtags, no thread numbering. Aim under ~400 characters each. The ${count} drafts must each take a DISTINCT angle. ${noteNoAngle}`
  } else if (format === 'punch') {
    const rules = `Rules:
- 1 line, MAX 2. If it needs a 3rd line, it's not tight enough — cut it.
- Do NOT open with "I" / frame it through Souvik's personal journey or story unless the topic is
  directly about resilience, health, or building (transplant, medals) — most punch posts are a general
  sharp take, observation, or contrarian angle, not "in my journey..." framing.
- The FIRST clause has to stop the scroll: a bold claim, a contrarian take, a curiosity gap, or a sharp
  question. No throat-clearing, no setup, no soft opener.
- Built to be shared and replied to, not just read. Say the thing most people are thinking but won't say,
  or the thing that sounds obvious once said but nobody's saying it.
- Raw and direct. No hedging ("I think", "maybe", "perhaps"). State it like it's true.
- No hashtags. No generic engagement-bait tics ("Thoughts?", "Agree?", "Unpopular opinion:", "RT if...")
  unless the line is genuinely built around that mechanic, not tacked on.
- No em dashes, no filler, no AI-slop phrasing (see HOUSE STYLE above — this format is held to it strictly).`
    formatGuide = count === 1
      ? `Write ONE punch post — a raw, direct, scroll-stopping one-liner (occasionally two lines, never more). This is NOT a mini-essay and NOT a personal story post.\n\n${rules}`
      : `Write ${count} punch posts — each a raw, direct, scroll-stopping one-liner (occasionally two lines, never more). The ${count} drafts must each take a DISTINCT angle.\n\n${rules}`
  } else if (format === 'heronMid') {
    const midRules = `Rules:
- Target 80-120 words — one short paragraph, occasionally two. More room than a Note to develop a
  single thought with a concrete detail or example, but this is NOT a mini-article — one idea, not several.
- Open with a real hook (a claim, a number, a specific moment) — no throat-clearing or setup.
- Do NOT frame this through Souvik's personal journey or story ("in my experience...", "when I...").
  Write it as a direct observation, insight, or point about the topic itself — no personal angle.
- Land on one clear takeaway by the end. Don't trail off or leave it open-ended.
- No hashtags, no thread numbering, no subheaders.
- No em dashes, no filler, no AI-slop phrasing (see HOUSE STYLE above).`
    formatGuide = count === 1
      ? `Write ONE mid-length Substack post — ${midRules}`
      : `Write ${count} mid-length Substack posts, each a DISTINCT angle. ${midRules}`
  } else if (format === 'repost') {
    formatGuide = `Write the quote-repost comment. Length: 3-6 lines, roughly 400-700 characters — long
enough to properly convey the quoted post's substance, not a short reaction. Present the post's own
idea clearly and engagingly, and why it's worth a read — this is a highlight/curation, NOT personal
opinion. No first-person opinion language ("I think", "in my experience"). No hashtags, no em dashes.`
  } else if (format === 'linkedin') {
    const liRules = `Rules:
- ~150-300 words. Short paragraphs — 1-3 sentences each, blank line between them (LinkedIn's native
  reading pattern, not a wall of text).
- Professional, thought-leadership register — NOT X's punchy one-liner style. One real idea, insight, or
  observation, developed properly, not a listicle or a string of hot takes.
- Open with a hook that earns the "see more" click — a specific number, a real moment, a clear stance —
  but the body should read like someone worth following professionally, not someone farming engagement.
- Do NOT frame this through Souvik's personal journey or story ("in my experience...", "when I had my
  transplant...", "building my SaaS taught me..."). Write about the topic/idea directly — an observation,
  a take, an analysis — not a personal narrative. This applies even to career/building-in-public topics:
  write about the PRACTICE or IDEA, not Souvik's own story.
- Close with a genuine takeaway or a real question — not "Thoughts?" or "Agree?" tacked on.
- 3-5 relevant hashtags at the end is appropriate here (LinkedIn convention — unlike X, where this format
  guide's siblings ban hashtags). Keep them specific, not generic (#leadership, #motivation).
- No em dashes, no filler, no AI-slop phrasing (see HOUSE STYLE above).`
    formatGuide = count === 1
      ? `Write ONE LinkedIn post. ${liRules}`
      : `Write ${count} LinkedIn posts, each a DISTINCT angle. ${liRules}`
  }

  // Titto's instructions always take highest priority — placed first so the LLM sees them before format defaults
  if (extraInstructions) {
    return `INSTRUCTIONS (HIGHEST PRIORITY — follow these precisely, they override format defaults below):
${extraInstructions}

---
FORMAT REFERENCE: ${meta.label} — ${meta.desc}
${formatGuide}

${inputLabel}:
${input}

Write now. No preamble.`
  }

  return `${formatGuide}

${inputLabel}:
${input}

Write now. No preamble.`
}

module.exports = { buildKoelSystemPrompt, buildKoelUserPrompt, buildContextBlock, FORMAT_META, reloadKnowledge }
