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
const logger = require('../utils/logger')
const log = logger.source('article-writer')

// ── Article knowledge base (purpose-built — NOT Koel's tweet brain) ───────────
// Reuse only the long-form-relevant knowledge: identity + general writing principles. The tweet copy
// principles / 100K tweet examples / engagement templates are deliberately excluded — they drag long-form
// toward punchy tweet style. Article structure/anti-slop/citation rules come from buildArticlePrompt.
const KOEL_DIR = path.join(__dirname, '..', 'sub-agents', 'koel')
const QUILL_DIR = path.join(__dirname, '..', 'sub-agents', 'quill')
const HERON_DIR = path.join(__dirname, '..', 'sub-agents', 'heron')

function readFileSafe(p) { try { return fs.readFileSync(p, 'utf8') } catch (_) { return '' } }

// `platform`: 'x' (default, unchanged behavior) | 'substack' (Heron).
function loadArticleTemplate(platform = 'x') {
  if (platform === 'substack') return readFileSafe(path.join(HERON_DIR, 'SUBSTACK_ARTICLE_TEMPLATE.md'))
  const primary = path.join(QUILL_DIR, 'ARTICLE_TEMPLATE.md')
  const fallback = path.join(KOEL_DIR, 'Viral_long_form_template.txt')
  return readFileSafe(primary) || readFileSafe(fallback)
}

let _sys = {}
function buildArticleSystemPrompt(platform = 'x') {
  if (_sys[platform]) return _sys[platform]
  const identity = readFileSafe(path.join(KOEL_DIR, 'IDENTITY.md'))
  const principles = readFileSafe(path.join(KOEL_DIR, 'writing_principles_context.txt'))
  const framing = platform === 'substack'
    ? 'You are a professional long-form writer producing Substack newsletter posts AS Souvik (first person, his voice).'
    : 'You are a professional long-form writer producing X Articles AS Souvik (first person, his voice).'
  const outputNote = platform === 'substack'
    ? ' Output ONLY the article, including the SUBJECT:/PREVIEW:/SUBTITLE: header lines and the trailing ===IMAGE PROMPT=== block exactly as specified in the user message.'
    : ' Output ONLY the article.'
  _sys[platform] = `${framing}
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
- Never invent statistics or sources. Cite only URLs provided in the brief/related research.`
  return _sys[platform]
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
    if (!map.has(url)) map.set(url, { title: m[1], url, source: 'inline' })
  }
  return [...map.values()]
}

// ── Generate a fresh article ──────────────────────────────────────────────────
// Returns { text, title, sources, usage, cost, modelUsed, modelId } — plus, when platform==='substack',
// { subtitle, subject, previewText, imagePrompt } (all null for platform 'x').
async function generate({ topic, model = models.articleDefaultModel(), account = null, onToken = null, doResearch = true, relatedItems = null, platform = 'x' } = {}) {
  if (!topic?.trim()) throw new Error('articleWriter.generate: topic required')
  const acct = account || memory.accounts.getActiveAccount()
  ensureProfile(acct)
  const modelId = models.byId(model) ? model : models.articleDefaultModel()

  // 1. Grounding sources. If the caller passed relatedItems (e.g. the article picker reusing the day's
  //    research), use them and DON'T fire a fresh search. Otherwise, best-effort research the topic.
  if (Array.isArray(relatedItems)) {
    relatedItems = relatedItems.slice(0, 6)
    log.info(`Article using ${relatedItems.length} provided related items (no fresh search)`)
  } else if (doResearch) {
    try {
      const research = await raven.run({
        triggeredBy: 'article-research',
        triggerLabel: `🪶 Article research · "${topic.slice(0, 40)}"`,
        searchQuery: topic,
        broadcast: null,
      })
      relatedItems = (research?.results || []).slice(0, 6)
      log.info(`Article research found ${relatedItems.length} related items`)
    } catch (err) {
      log.warn(`Article research failed (proceeding without): ${err.message}`)
      relatedItems = []
    }
  } else {
    relatedItems = []
  }

  // 2. Build the prompt: system (identity + principles) + voice block + article brief (template + rules + research).
  const suggestion = { title: topic, angle: topic, snippet: '', url: '' }
  const template = loadArticleTemplate(platform)
  const buildBrief = platform === 'substack' ? buildSubstackArticlePrompt : buildArticlePrompt
  const articleBrief = buildBrief({ suggestion, template, userOverride: '', relatedItems })
  const contextBlock = buildContextBlock(memory.loadContext(acct))

  const messages = [{ role: 'system', content: buildArticleSystemPrompt(platform) }]
  if (contextBlock) messages.push({ role: 'system', content: contextBlock })
  messages.push({ role: 'user', content: articleBrief })

  // 3. Write (stream if a token callback was given, else one-shot).
  // Substack articles run up to 2200 words (~2900 tokens) + header/image-prompt overhead — extra
  // headroom vs X's 4000 cap so token truncation is never why an article comes in short.
  const opts = { modelId, messages, temperature: 0.8, maxTokens: platform === 'substack' ? 5500 : 4000 }
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
    let attempts = 0
    let lastText = res.text
    let count = wordCount
    while (count > 0 && count < 900 && attempts < 2) {
      attempts++
      const short = 900 - count + 150
      log.warn(`Substack article came in at ${count} words (floor 900) — expand pass ${attempts}`)
      try {
        const expandMessages = [...messages, { role: 'assistant', content: lastText }, { role: 'user', content:
          `Your draft above is only ${count} words — this task requires at least 900, ideally closer to 1400. Expand it by at least ${short} more words: add 1-2 more body sections (a concrete example, a counterpoint, or a deeper dive on an existing point) and flesh out thin paragraphs — don't just pad sentences. Keep the SUBJECT:/PREVIEW:/SUBTITLE: header lines, the title, and the ===IMAGE PROMPT=== block exactly as before — only grow the body. Output the FULL updated article again in the exact same format, starting with SUBJECT:.` }]
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
async function refine({ currentText, instruction, model = models.DEFAULT_MODEL_ID, account = null, sources = [], onToken = null, platform = 'x' } = {}) {
  if (!currentText?.trim()) throw new Error('articleWriter.refine: currentText required')
  if (!instruction?.trim()) throw new Error('articleWriter.refine: instruction required')
  const acct = account || memory.accounts.getActiveAccount()
  ensureProfile(acct)
  const modelId = models.byId(model) ? model : models.DEFAULT_MODEL_ID

  const contextBlock = buildContextBlock(memory.loadContext(acct))
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

  const opts = { modelId, messages, temperature: 0.7, maxTokens: platform === 'substack' ? 5500 : 4000 }
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
