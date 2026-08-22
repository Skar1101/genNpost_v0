require('dotenv').config()
const fs = require('fs')
const path = require('path')
const llm = require('../utils/llm')
const models = require('../config/models')
const raven = require('./raven')
const memory = require('../state/memory')
const { ensureProfile } = require('../state/profileSeed')
const { buildContextBlock } = require('../prompts/koelWrite')
const { buildArticlePrompt } = require('../prompts/quillArticle')
const { buildSubstackArticlePrompt } = require('../prompts/heronArticle')
const articleLessonsStore = require('../state/articleLessonsStore')
const logger = require('../utils/logger')
const log = logger.source('article-writer')

// ── Article knowledge base (purpose-built — NOT Koel's tweet brain) ───────────
// Reuse only the long-form-relevant knowledge: identity + general writing principles. The tweet copy
// principles / 100K tweet examples / engagement templates are deliberately excluded — they drag long-form
// toward punchy tweet style. Article structure/anti-slop/citation rules come from buildArticlePrompt.
const KOEL_DIR = path.join(__dirname, '..', 'sub-agents', 'koel')
const QUILL_DIR = path.join(__dirname, '..', 'sub-agents', 'quill')
const HERON_DIR = path.join(__dirname, '..', 'sub-agents', 'heron')

// Returns '' when the file is missing, but SAYS SO. Silently returning empty is how this module
// ran with a 0-char identity and 0-char writing-principles block after the sub-agents/koel/ split
// moved its knowledge files — the prompt quietly lost its voice and nothing surfaced it.
// `optional` is for genuine fallbacks that are expected to miss.
function readFileSafe(p, { optional = false } = {}) {
  try {
    return fs.readFileSync(p, 'utf8')
  } catch (_) {
    if (!optional) log.warn(`Knowledge file MISSING — article prompts will be weaker without it: ${p}`)
    return ''
  }
}

// `platform`: 'x' (default, unchanged behavior) | 'substack' (Heron).
function loadArticleTemplate(platform = 'x') {
  if (platform === 'substack') return readFileSafe(path.join(HERON_DIR, 'SUBSTACK_ARTICLE_TEMPLATE.md'))
  const primary = path.join(QUILL_DIR, 'ARTICLE_TEMPLATE.md')
  const fallback = path.join(KOEL_DIR, 'x', 'Viral_long_form_template.txt')
  return readFileSafe(primary) || readFileSafe(fallback, { optional: true })
}

// Cached per platform. reload() clears it — which analyst.learnArticleLessons() calls after saving
// new rules, or the prompt would keep serving the pre-lesson version.
let _sys = {}
function buildArticleSystemPrompt(platform = 'x', account = null) {
  const lessons = articleLessonsStore.promptBlock(account)
  const key = `${platform}|${lessons.length}`   // lessons change → new cache entry
  if (_sys[key]) return _sys[key]
  const identity = readFileSafe(path.join(KOEL_DIR, 'common', 'IDENTITY.md'))
  const principles = readFileSafe(path.join(KOEL_DIR, 'common', 'writing_principles_context.txt'))
  const framing = platform === 'substack'
    ? 'You are a professional long-form writer producing Substack newsletter posts AS Souvik (first person, his voice).'
    : 'You are a professional long-form writer producing X Articles AS Souvik (first person, his voice).'
  const outputNote = platform === 'substack'
    ? ' Output ONLY the article, including the SUBJECT:/PREVIEW:/SUBTITLE: header lines and the trailing ===IMAGE PROMPT=== block exactly as specified in the user message.'
    : ' Output ONLY the article.'
  _sys[key] = `${framing}
Your job: sharp, substantive, well-structured articles a discerning reader finishes — never AI slop.

${identity}

---
## WRITING PRINCIPLES
${principles}

---
## OUTPUT RULES
-${outputNote} No preamble, no "here is your article", no meta-commentary, no DRAFT separators.
- Follow the article template, structure rules, and citation rules given in the user message exactly.
- Write in Markdown: a title line, blank lines between paragraphs, **bold** subheaders, [anchor](url) inline links.
- Never invent statistics or sources. Cite only URLs provided in the brief/related research.
- NEVER link to a tweet, an X post, or a short video. Those are not citable sources for long-form.${lessons}`
  return _sys[key]
}

function reload() { _sys = {} }

// Pulls the SUBJECT:/PREVIEW:/SUBTITLE: header lines and a trailing ===IMAGE PROMPT=== block off a
// Substack-mode generation, returning the clean article body separately from the metadata. No-op-safe
// (missing markers just leave the corresponding field null) — never throws on malformed output.
function parseSubstackOutput(text) {
  let body = String(text || '')
  let subject = null, previewText = null, subtitle = null, imagePrompt = null

  const subjectMatch = body.match(/^SUBJECT:\s*(.+)$/m)
  if (subjectMatch) { subject = subjectMatch[1].trim(); body = body.replace(subjectMatch[0], '') }

  const previewMatch = body.match(/^PREVIEW:\s*(.+)$/m)
  if (previewMatch) { previewText = previewMatch[1].trim(); body = body.replace(previewMatch[0], '') }

  const subtitleMatch = body.match(/^SUBTITLE:\s*(.+)$/m)
  if (subtitleMatch) { subtitle = subtitleMatch[1].trim(); body = body.replace(subtitleMatch[0], '') }

  const imageMatch = body.match(/===\s*IMAGE PROMPT\s*===\s*([\s\S]*)$/i)
  if (imageMatch) { imagePrompt = imageMatch[1].trim(); body = body.slice(0, imageMatch.index) }

  body = body.replace(/^\s+/, '').replace(/\n{3,}/g, '\n\n').trimEnd()
  return { text: body, subject, previewText, subtitle, imagePrompt }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function slugify(s) {
  return String(s || 'article').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'article'
}

function titleFromText(text, fallback) {
  const first = String(text || '').split('\n').map(l => l.trim()).find(Boolean) || ''
  return first.replace(/^#+\s*/, '').replace(/\*\*/g, '').slice(0, 120) || (fallback || 'Untitled article')
}

// Long-form citations must be CITABLE. Research is now mostly Twitter and YouTube Shorts, and
// feeding those in as grounding sources is what produced articles citing x.com/…/status/… and
// youtube.com/shorts/… — a tweet is not a reference. Social items can still inspire a topic; they
// just stop being offered as things to link.
const NON_CITABLE_SOURCES = ['twitter', 'youtube-shorts']
const NON_CITABLE_URL = /(^|\/\/)(www\.)?(x\.com|twitter\.com|t\.co)\/|youtube\.com\/shorts\//i

function citableOnly(items) {
  return (items || []).filter(r => {
    if (NON_CITABLE_SOURCES.includes(r?.source)) return false
    if (NON_CITABLE_URL.test(String(r?.url || ''))) return false
    return true
  })
}

// Sources = related research items + any inline markdown links found in the article text (deduped by url).
function extractSources(text, relatedItems) {
  const map = new Map()
  for (const r of relatedItems || []) {
    if (r?.url && !map.has(r.url)) map.set(r.url, { title: r.title || r.url, url: r.url, source: r.source || null })
  }
  const linkRe = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g
  let m
  while ((m = linkRe.exec(text || '')) !== null) {
    const url = m[2]
    if (NON_CITABLE_URL.test(url)) continue   // model linked a tweet/Short despite the rules
    if (!map.has(url)) map.set(url, { title: m[1], url, source: 'inline' })
  }
  return [...map.values()]
}

// ── Generate a fresh article ──────────────────────────────────────────────────
// Returns { text, title, sources, usage, cost, modelUsed, modelId } — plus, when platform==='substack',
// { subtitle, subject, previewText, imagePrompt } (all null for platform 'x').
// Turn a brief into something a keyword search can actually use. Short input is already a topic;
// anything longer gets reduced to keywords by one cheap call, falling back to a naive trim.
const STOPWORDS = /^(write|draft|create|make|an?|the|about|on|for|me|please|article|post|blog|piece|word|words|long|form|longform|essay|and|with|in|of|to|is|it|that|this|using|based|style|tone|section|sections|paragraph|paragraphs)$/i

async function deriveSearchQuery(raw) {
  const text = String(raw || '').trim()
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length <= 8) return text

  try {
    const res = await llm.complete({
      modelId: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: `Extract the searchable SUBJECT of this article request as 2-6 keywords. No formatting rules, no length instructions, no verbs like "write". Reply with the keywords only.\n\nREQUEST:\n${text.slice(0, 1000)}` }],
      temperature: 0,
      maxTokens: 40,
    })
    const q = (res.text || '').replace(/^["']|["']$/g, '').trim()
    if (q && q.split(/\s+/).length <= 10) return q
  } catch (err) {
    log.warn(`Search-query extraction failed, falling back to keyword trim: ${err.message}`)
  }

  return words.filter((w) => !STOPWORDS.test(w.replace(/[^\w-]/g, ''))).slice(0, 6).join(' ') || text.slice(0, 60)
}

// Fills the "USER OVERRIDE (HIGHEST PRIORITY)" slot the prompt has always rendered as
// "(none — follow template)".
function buildOverrideBlock(spec, referenceText) {
  const parts = []
  if (spec) {
    parts.push(`${spec}

These are Souvik's own instructions for THIS article. Where they conflict with the template above —
length, structure, tone, whether to cite — HIS INSTRUCTIONS WIN. Do not fall back to the template
defaults for anything he specified.`)
  }
  const ref = String(referenceText || '').trim()
  if (ref) {
    parts.push(`REFERENCE MATERIAL Souvik supplied (an article/page he linked or pasted). Use it as
source material and, if he asked for "something like this", match its structure and tone. Do not copy
its sentences.

${ref.slice(0, 8000)}`)
  }
  return parts.join('\n\n')
}

// An explicit word count in the brief must beat the template's floor/ceiling.
function requestedWordCount(spec) {
  const m = String(spec || '').match(/(\d{2,5})\s*(?:\+\s*)?words?\b/i)
  if (!m) return null
  const n = parseInt(m[1], 10)
  return Number.isFinite(n) && n >= 50 && n <= 10000 ? n : null
}

async function generate({
  topic, model = models.articleDefaultModel(), account = null, onToken = null,
  doResearch = true, relatedItems = null, platform = 'x',
  // The prompt builders have always had a top-priority `userOverride` slot; every call site passed ''.
  // These three finally fill it: what you asked for, any page/example you pasted, and a clean keyword
  // query so a prose brief is never fired at GitHub/arXiv as a literal search string.
  instructions = '', referenceText = '', searchQuery = null, signal = null,
} = {}) {
  if (!topic?.trim()) throw new Error('articleWriter.generate: topic required')
  const acct = account || memory.accounts.getActiveAccount()
  ensureProfile(acct)
  const modelId = models.byId(model) ? model : models.articleDefaultModel()
  const spec = String(instructions || '').trim()

  // 1. Grounding sources. If the caller passed relatedItems (e.g. the article picker reusing the day's
  //    research), use them and DON'T fire a fresh search. Otherwise, best-effort research the topic.
  if (Array.isArray(relatedItems)) {
    const before = relatedItems.length
    relatedItems = citableOnly(relatedItems).slice(0, 6)
    log.info(`Article using ${relatedItems.length} citable related items (dropped ${before - relatedItems.length} social)`)
  } else if (doResearch) {
    try {
      // Never send the raw brief: `searchQuery` reaches fetchers verbatim (GitHub
      // `in:name,description,readme`, arXiv `ti:/abs:`), so a sentence returned nothing and the
      // article ended up grounded on garbage.
      const query = await deriveSearchQuery(searchQuery || topic)
      const research = await raven.run({
        triggeredBy: 'article-research',
        triggerLabel: `🪶 Article research · "${query.slice(0, 40)}"`,
        searchQuery: query,
        broadcast: null,
      })
      const all = research?.results || []
      relatedItems = citableOnly(all).slice(0, 6)
      log.info(`Article research found ${all.length} items -> ${relatedItems.length} citable (social excluded)`)
    } catch (err) {
      log.warn(`Article research failed (proceeding without): ${err.message}`)
      relatedItems = []
    }
  } else {
    relatedItems = []
  }

  // 2. Build the prompt: system (identity + principles) + voice block + article brief (template + rules + research).
  const suggestion = { title: topic, angle: spec || topic, snippet: '', url: '' }
  const template = loadArticleTemplate(platform)
  const buildBrief = platform === 'substack' ? buildSubstackArticlePrompt : buildArticlePrompt
  const userOverride = buildOverrideBlock(spec, referenceText)
  const articleBrief = buildBrief({ suggestion, template, userOverride, relatedItems })
  // Calibrate against work from the platform this article is for — a Substack piece shown a pile of
  // approved tweets as its voice reference drifts toward tweet rhythm.
  const contextBlock = buildContextBlock(memory.loadContext(acct), platform)

  const messages = [{ role: 'system', content: buildArticleSystemPrompt(platform) }]
  if (contextBlock) messages.push({ role: 'system', content: contextBlock })
  messages.push({ role: 'user', content: articleBrief })

  // 3. Write (stream if a token callback was given, else one-shot).
  // Substack articles run up to 2200 words (~2900 tokens) + header/image-prompt overhead — extra
  // headroom vs X's 4000 cap so token truncation is never why an article comes in short.
  const opts = { modelId, messages, temperature: 0.8, maxTokens: platform === 'substack' ? 5500 : 4000, signal }
  const res = onToken ? await llm.stream({ ...opts, onToken }) : await llm.complete(opts)

  if (platform === 'substack') {
    let parsed = parseSubstackOutput(res.text)
    let usage = res.usage
    const wordCount = parsed.text.trim().split(/\s+/).filter(Boolean).length

    // Automatic expand passes (up to 2) if the model undershot the 900-word floor — the prompt alone
    // can't guarantee it (confirmed via real samples landing at 875 and 524 despite an explicit
    // hard-floor instruction), so this is deterministic insurance rather than more prompt-begging. Not
    // streamed (plain complete, no onToken) so a re-ask doesn't double-print in the live UI —
    // article_done always carries the final authoritative text regardless.
    // ...unless YOU asked for a specific length. Force-expanding a deliberate "600 words" request up
    // to 900 is exactly the "it ignores what I typed" problem, so an explicit count sets the floor.
    const asked = requestedWordCount(spec)
    const floor = asked ? Math.max(50, Math.round(asked * 0.85)) : 900
    if (asked) log.info(`Substack length floor set to ${floor} words from your brief ("${asked} words") instead of the 900 default`)

    let attempts = 0
    let lastText = res.text
    let count = wordCount
    while (count > 0 && count < floor && attempts < 2 && !(signal && signal.aborted)) {
      attempts++
      const short = floor - count + 150
      log.warn(`Substack article came in at ${count} words (floor ${floor}) — expand pass ${attempts}`)
      try {
        const expandMessages = [...messages, { role: 'assistant', content: lastText }, { role: 'user', content:
          `Your draft above is only ${count} words — this task requires at least ${floor}${asked ? '' : ', ideally closer to 1400'}. Expand it by at least ${short} more words: add 1-2 more body sections (a concrete example, a counterpoint, or a deeper dive on an existing point) and flesh out thin paragraphs — don't just pad sentences. Keep the SUBJECT:/PREVIEW:/SUBTITLE: header lines, the title, and the ===IMAGE PROMPT=== block exactly as before — only grow the body. Output the FULL updated article again in the exact same format, starting with SUBJECT:.` }]
        const res2 = await llm.complete({ modelId, messages: expandMessages, temperature: 0.7, maxTokens: 5500 })
        const parsedTry = parseSubstackOutput(res2.text)
        const newCount = parsedTry.text.trim().split(/\s+/).filter(Boolean).length
        usage = {
          prompt_tokens: (usage?.prompt_tokens || 0) + (res2.usage?.prompt_tokens || 0),
          completion_tokens: (usage?.completion_tokens || 0) + (res2.usage?.completion_tokens || 0),
        }
        if (newCount > count) { parsed = parsedTry; lastText = res2.text; count = newCount }
        else break // didn't help — stop rather than burn another call
      } catch (err) {
        log.warn(`Expand pass failed (keeping ${count}-word draft): ${err.message}`)
        break
      }
    }

    const sources = extractSources(parsed.text, relatedItems)
    return {
      text: parsed.text,
      title: titleFromText(parsed.text, topic),
      subtitle: parsed.subtitle, subject: parsed.subject, previewText: parsed.previewText, imagePrompt: parsed.imagePrompt,
      sources,
      usage,
      cost: models.costFor(modelId, usage),
      modelUsed: res.modelUsed,
      modelId,
    }
  }

  const sources = extractSources(res.text, relatedItems)
  return {
    text: res.text,
    title: titleFromText(res.text, topic),
    sources,
    usage: res.usage,
    cost: models.costFor(modelId, res.usage),
    modelUsed: res.modelUsed,
    modelId,
  }
}

// ── Refine an existing article conversationally ───────────────────────────────
// Returns { text, sources, usage, cost, modelUsed, modelId } — plus, when platform==='substack',
// { subtitle, subject, previewText, imagePrompt }, regenerated fresh to fit the rewritten piece.
async function refine({ currentText, instruction, model = models.DEFAULT_MODEL_ID, account = null, sources = [], onToken = null, platform = 'x', signal = null } = {}) {
  if (!currentText?.trim()) throw new Error('articleWriter.refine: currentText required')
  if (!instruction?.trim()) throw new Error('articleWriter.refine: instruction required')
  const acct = account || memory.accounts.getActiveAccount()
  ensureProfile(acct)
  const modelId = models.byId(model) ? model : models.DEFAULT_MODEL_ID

  const contextBlock = buildContextBlock(memory.loadContext(acct), platform)
  const platformLabel = platform === 'substack' ? 'Substack newsletter post' : 'long-form X Article'
  const formatNote = platform === 'substack'
    ? ' Regenerate the SUBJECT:/PREVIEW:/SUBTITLE: header lines and the trailing ===IMAGE PROMPT=== block fresh, to fit the rewritten piece.'
    : ''
  const userMsg = `Rewrite the article below per this instruction, keeping it a professional ${platformLabel} in Souvik's voice. Keep valid existing citations; do not invent new stats or URLs.${formatNote}

INSTRUCTION:
${instruction}

CURRENT ARTICLE:
${currentText}

Output ONLY the rewritten article — no preamble, no explanation.`

  const messages = [{ role: 'system', content: buildArticleSystemPrompt(platform) }]
  if (contextBlock) messages.push({ role: 'system', content: contextBlock })
  messages.push({ role: 'user', content: userMsg })

  const opts = { modelId, messages, temperature: 0.7, maxTokens: platform === 'substack' ? 5500 : 4000, signal }
  const res = onToken ? await llm.stream({ ...opts, onToken }) : await llm.complete(opts)

  if (platform === 'substack') {
    const parsed = parseSubstackOutput(res.text)
    const merged = extractSources(parsed.text, sources)
    return {
      text: parsed.text,
      subtitle: parsed.subtitle, subject: parsed.subject, previewText: parsed.previewText, imagePrompt: parsed.imagePrompt,
      sources: merged,
      usage: res.usage,
      cost: models.costFor(modelId, res.usage),
      modelUsed: res.modelUsed,
      modelId,
    }
  }

  const merged = extractSources(res.text, sources)
  return {
    text: res.text,
    sources: merged,
    usage: res.usage,
    cost: models.costFor(modelId, res.usage),
    modelUsed: res.modelUsed,
    modelId,
  }
}

module.exports = { generate, refine, reload, titleFromText, slugify, parseSubstackOutput }
