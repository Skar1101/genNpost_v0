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
