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
  const extra = extraInstructions ? `\nADDITIONAL INSTRUCTIONS: ${extraInstructions}` : ''

  return `${formatGuide}
${countNote}
${extra}

${inputLabel}:
${input}

Write now. No preamble.`
}

module.exports = { buildKoelSystemPrompt, buildKoelUserPrompt, FORMAT_META, reloadKnowledge }
