const fs = require('fs')
const path = require('path')

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
  thread:      { label: 'Thread',             desc: '5–10 tweet thread, numbered, story or how-to' },
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
## OUTPUT RULES (CRITICAL)
- Always produce EXACTLY 3 drafts unless told otherwise
- Separate drafts with: --- DRAFT 2 --- and --- DRAFT 3 ---
- Start with DRAFT 1 (no header needed, just start writing)
- Never explain your choices, never add notes or meta-commentary
- Never number lines inside a tweet
- Keep threads clearly separated: Tweet 1/, Tweet 2/ etc.
- Motivational posts: ground them in Souvik's real story (transplant, medals, building)
- Engagement posts: always end with Comment "[KEYWORD]" + follow → I'll DM it (must be following)
- Do not add hashtags unless asked
- Write as Souvik in first person always`
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
    formatGuide = 'Write 3 SHORT FORM tweets (single tweet each, max 280 chars). Hook in line 1. Punchy close or CTA at end.'
  } else if (format === 'thread') {
    formatGuide = 'Write a THREAD. 6-10 tweets. Tweet 1 is the hook + promise. Number each: "Tweet 1/" "Tweet 2/" etc. Last tweet has CTA.'
  } else if (format === 'longform') {
    formatGuide = 'Write 3 LONG FORM posts (single post, 400-900 chars each). Personal/build-in-public voice. Line breaks every 1-2 sentences.'
  } else if (format === 'motivational') {
    formatGuide = 'Write 3 MOTIVATIONAL posts. Ground each in Souvik\'s real story (transplant comeback, medals, building). Universal lesson at end. Emotional but not cringey.'
  } else if (format === 'engagement') {
    formatGuide = 'Write 3 ENGAGEMENT FARMING posts. Each has: hook → what you\'re giving away → 3 bullet benefits → CTA with a keyword (must be following). Make the keyword relevant and punchy.'
  }

  const countNote = count !== 3 ? `Produce ${count} drafts instead of 3.` : ''

  // Titto's instructions always take highest priority — placed first so the LLM sees them before format defaults
  if (extraInstructions) {
    return `INSTRUCTIONS (HIGHEST PRIORITY — follow these precisely, they override format defaults below):
${extraInstructions}

---
FORMAT REFERENCE: ${meta.label} — ${meta.desc}
${formatGuide}
${countNote}

${inputLabel}:
${input}

Write now. No preamble.`
  }

  return `${formatGuide}
${countNote}

${inputLabel}:
${input}

Write now. No preamble.`
}

module.exports = { buildKoelSystemPrompt, buildKoelUserPrompt, buildContextBlock, FORMAT_META, reloadKnowledge }
