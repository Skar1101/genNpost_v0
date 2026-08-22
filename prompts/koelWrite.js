const fs = require('fs')
const path = require('path')
const { HOUSE_STYLE_TEXT } = require('./styleRules')

const KOEL_DIR = path.join(__dirname, '..', 'sub-agents', 'koel')

function loadFile(...segments) {
  try { return fs.readFileSync(path.join(KOEL_DIR, ...segments), 'utf8') } catch (_) { return '' }
}

// ── Platform packs ───────────────────────────────────────────────────────────
// Every platform loads `common/` (the constant voice) plus EXACTLY ONE platform pack. Before this
// split, one prompt carried all of X's material — ~27 KB of tweet principles, 100K-view tweet
// examples and DM-giveaway templates — on every call, including LinkedIn and Substack ones, where a
// format guide at the very end then tried to countermand it. Measured: a LinkedIn call was sending
// ~9,400 prompt tokens, most of it about a platform it wasn't writing for.
//
// To change how Souvik sounds on one platform, edit that platform's directory. Nothing in a
// platform pack should ever describe another platform.
const PLATFORMS = ['x', 'linkedin', 'substack']

const PACK_FILES = {
  x: [
    { file: 'PRINCIPLES.md',                heading: 'X COPY PRINCIPLES' },
    { file: 'EXAMPLES.txt',                 heading: 'HIGH-PERFORMING TWEET EXAMPLES (100K+ VIEWS)' },
    { file: 'Engagement_Post_Templates.txt', heading: 'ENGAGEMENT POST TEMPLATES' },
    { file: 'Viral_long_form_template.txt', heading: 'VIRAL LONG-FORM TEMPLATE' },
  ],
  linkedin: [
    { file: 'PRINCIPLES.md', heading: 'LINKEDIN COPY PRINCIPLES' },
    { file: 'EXAMPLES.md',   heading: 'LINKEDIN PATTERNS THAT WORK (shape references — never reuse the wording)' },
  ],
  substack: [
    { file: 'PRINCIPLES.md', heading: 'SUBSTACK COPY PRINCIPLES' },
    { file: 'EXAMPLES.md',   heading: 'SUBSTACK PATTERNS THAT WORK (shape references — never reuse the wording)' },
  ],
}

// Cache loaded once at startup — call reloadKnowledge() after editing files
let _cache = null

function reloadKnowledge() {
  const packs = {}
  for (const p of PLATFORMS) {
    packs[p] = {
      sections: PACK_FILES[p].map(({ file, heading }) => ({ heading, body: loadFile(p, file) })).filter(s => s.body.trim()),
      outputRules: loadFile(p, 'OUTPUT_RULES.md'),
    }
  }
  _cache = {
    identity:   loadFile('common', 'IDENTITY.md'),
    writingCtx: loadFile('common', 'writing_principles_context.txt'),
    packs,
  }
  return _cache
}

// Load on first require
reloadKnowledge()

function getKnowledge() {
  return _cache
}

// ── Format descriptions shown in UI ──────────────────────────────────────────
// `platform` decides which knowledge pack loads. Every format belongs to exactly one platform, so
// the format alone is enough to resolve it — that matters because callers are reliable about
// passing `format` and were not about passing `platform` (Heron never did, so its Substack drafts
// were being written with X's full playbook loaded).
const FORMAT_META = {
  short:       { platform: 'x',        label: 'Short Form',         desc: 'Single tweet, punchy & direct, max 280 chars' },
  thread:      { platform: 'x',        label: 'Thread',             desc: '5–8 tweet thread, numbered, standalone tweets, one CTA' },
  longform:    { platform: 'x',        label: 'Long Form',          desc: 'Single detailed post, 500–900 chars' },
  motivational:{ platform: 'x',        label: 'Motivational',       desc: 'Personal story or resilience post, emotional + universal' },
  engagement:  { platform: 'x',        label: 'Engagement Farming', desc: 'DM giveaway post with CTA keyword' },
  note:        { platform: 'substack', label: 'Substack Note',      desc: '1–2 lines, punchy, tied to your niche/pillars' },
  // Daily-drop only — not a manually-selectable format (kept out of KoelPage.jsx's format list on
  // purpose). Raw, hook-driven, punchline-length; no forced personal-story framing.
  punch:       { platform: 'x',        label: 'Punch',              desc: '1–2 lines, raw hook, built to go viral — daily drop only' },
  // Heron daily-drop only (kept out of KoelPage.jsx's format list) — a step up from a Substack Note:
  // enough room to develop one thought with a concrete detail, still well short of an article.
  heronMid:    { platform: 'substack', label: 'Heron Mid-Post',     desc: '~80–120 words, one developed thought — Heron daily drop only' },
  // Quote-repost comment (Quill's repost pipeline only) — own format so its 400-700 char target
  // doesn't compete with the 'short' format's own 280-char cap (they were conflicting when reposts
  // reused 'short' + an extraInstructions override alone).
  repost:      { platform: 'x',        label: 'Quote-Repost',       desc: 'Neutral highlight of the quoted post, 400-700 chars — reposts only' },
  // Parrot (LinkedIn) only — different platform, different register: professional/thought-leadership,
  // not X's punchy one-liner style. Short hashtag use is appropriate here (unlike everywhere else).
  linkedin:    { platform: 'linkedin', label: 'LinkedIn Post',      desc: 'Professional/thought-leadership, ~150-300 words — Parrot only' },
}

// Which knowledge pack a request should load. Format wins when it maps to a platform (it always
// does today); the explicit `platform` argument is the fallback for anything unrecognised.
function platformForFormat(format, fallback = 'x') {
  const p = FORMAT_META[format]?.platform
  if (p) return p
  return PLATFORMS.includes(fallback) ? fallback : 'x'
}

// ── Build the system prompt from cached knowledge ────────────────────────────
// Composed per platform: shared identity + shared writing principles + THAT platform's pack +
// house style + shared output rules + that platform's own output rules.
const PLATFORM_LABEL = { x: 'X (Twitter)', linkedin: 'LinkedIn', substack: 'Substack' }

function buildKoelSystemPrompt(platform = 'x') {
  const plat = PLATFORMS.includes(platform) ? platform : 'x'
  const k = getKnowledge()
  const pack = k.packs[plat]

  const packBlocks = pack.sections.map(s => `---\n## ${s.heading}\n${s.body}`).join('\n\n')

  return `${k.identity}

---
## YOU ARE WRITING FOR: ${PLATFORM_LABEL[plat]}

Everything below is specific to ${PLATFORM_LABEL[plat]}. Do not import mechanics, formats, or
conventions from any other platform — the rules that win on one lose on another.

---
## WRITING PRINCIPLES
${k.writingCtx}

${packBlocks}

---
${HOUSE_STYLE_TEXT}

---
## OUTPUT RULES (CRITICAL)
- Produce EXACTLY the number of drafts stated in the instructions below — no more, no fewer
- Separate drafts with: --- DRAFT 2 ---, --- DRAFT 3 ---, etc. (one separator per additional draft,
  matching the requested count)
- Start with DRAFT 1 (no header needed, just start writing)
- Never explain your choices, never add notes or meta-commentary
- Write as Souvik in first person always
- Use standard sentence casing — capitalize the start of sentences and proper nouns (AI, product/brand
  names, etc.). Do not write in all-lowercase unless the profile explicitly opts in via a line that
  says "CASE: write everything in lowercase"

---
## ${PLATFORM_LABEL[plat].toUpperCase()} OUTPUT RULES (CRITICAL — these override any habit from another platform)
${pack.outputRules}`
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

// Entries written before platform packs existed carry no `platform` — every one of them is an X
// post, since X was the only platform Koel wrote for at the time.
function entryPlatform(e) { return e?.platform || 'x' }

function buildContextBlock(ctx, platform = 'x') {
  if (!ctx) return ''
  const plat = PLATFORMS.includes(platform) ? platform : 'x'
  // Calibrate against work from the SAME platform. A LinkedIn draft used to be shown "YOUR BEST
  // TWEETS (the gold standard — match THIS voice)", which is precisely the wrong target.
  const samePlatform = arr => (arr || []).filter(e => entryPlatform(e) === plat)
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
  // Best tweets are the gold-standard voice reference on X — and ONLY on X. They are tweets; held
  // up as the quality bar for a LinkedIn or Substack draft they actively pull the writing wrong.
  const best = (p && p.bestTweets ? p.bestTweets : []).map(bestTweetText).filter(Boolean)
  if (plat === 'x' && best.length) {
    out.push('\n=== YOUR BEST TWEETS (the gold standard — match THIS voice, rhythm, and quality bar) ===')
    best.slice(0, 5).forEach(t => out.push('- ' + t.replace(/\s+/g, ' ').trim().slice(0, 320)))
  }
  // Voice examples come from drafts Souvik edited by hand — the strongest voice signal there is.
  // Same-platform first; fall back to all of them when this platform has none yet, since the
  // underlying voice is constant even where the craft isn't.
  const voice = ctx.voiceExamples || []
  const voiceScoped = samePlatform(voice).length ? samePlatform(voice) : voice
  if (voiceScoped.length) {
    out.push('\n=== VOICE EXAMPLES (mirror the rhythm & phrasing, not the topic) ===')
    voiceScoped.slice(-8).forEach(e => out.push('- ' + oneLine(e.text)))
  }
  const approvedHere = samePlatform(ctx.approved)
  if (approvedHere.length) {
    out.push(`\n=== RECENTLY APPROVED ${PLATFORM_LABEL[plat].toUpperCase()} POSTS (what resonates here — lean toward these patterns) ===`)
    approvedHere.slice(-6).forEach(e => out.push('- ' + oneLine(e.text)))
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
  const rejectedHere = samePlatform(ctx.rejected)
  if (rejectedHere.length) {
    out.push('\n=== REJECTED ANGLES — DO NOT REPEAT THESE (avoid the angle and its reason) ===')
    rejectedHere.slice(-10).forEach(e => out.push(`- ${oneLine(e.text)}${e.reason ? '  (reason: ' + e.reason + ')' : ''}`))
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
enough to properly convey the quoted post's substance, not a short reaction. Take a real, sharp stance —
bigger than it looks, overhyped, the part everyone's missing. "Not personal opinion" means not about
Souvik's own life/story, NOT hedged or explainer-toned — a comment with no real point of view is not
acceptable output. Never write like a press release or product description ("marking a pivotal moment",
"this insight highlights", "essential reading for anyone") — if it could be swapped onto a different
announcement unchanged, rewrite it. No first-person opinion framed as personal experience ("in my
experience", "when I..."). No hashtags, no em dashes.`
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
- 3-5 relevant hashtags at the end (see the LinkedIn output rules above). Keep them specific, not
  generic — never #leadership or #motivation.
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

module.exports = { buildKoelSystemPrompt, buildKoelUserPrompt, buildContextBlock, FORMAT_META, reloadKnowledge, platformForFormat, PLATFORMS }
