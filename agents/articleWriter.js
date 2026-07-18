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
const logger = require('../utils/logger')
const log = logger.source('article-writer')

// ── Article knowledge base (purpose-built — NOT Koel's tweet brain) ───────────
// Reuse only the long-form-relevant knowledge: identity + general writing principles. The tweet copy
// principles / 100K tweet examples / engagement templates are deliberately excluded — they drag long-form
// toward punchy tweet style. Article structure/anti-slop/citation rules come from buildArticlePrompt.
const KOEL_DIR = path.join(__dirname, '..', 'sub-agents', 'koel')
const QUILL_DIR = path.join(__dirname, '..', 'sub-agents', 'quill')

function readFileSafe(p) { try { return fs.readFileSync(p, 'utf8') } catch (_) { return '' } }

function loadArticleTemplate() {
  const primary = path.join(QUILL_DIR, 'ARTICLE_TEMPLATE.md')
  const fallback = path.join(KOEL_DIR, 'Viral_long_form_template.txt')
  return readFileSafe(primary) || readFileSafe(fallback)
}

let _sys = null
function buildArticleSystemPrompt() {
  if (_sys) return _sys
  const identity = readFileSafe(path.join(KOEL_DIR, 'IDENTITY.md'))
  const principles = readFileSafe(path.join(KOEL_DIR, 'writing_principles_context.txt'))
  _sys = `You are a professional long-form writer producing X Articles AS Souvik (first person, his voice).
Your job: sharp, substantive, well-structured articles a discerning reader finishes — never AI slop.

${identity}

---
## WRITING PRINCIPLES
${principles}

---
## OUTPUT RULES
- Output ONLY the article. No preamble, no "here is your article", no meta-commentary, no DRAFT separators.
- Follow the article template, structure rules, and citation rules given in the user message exactly.
- Write in Markdown: a title line, blank lines between paragraphs, **bold** subheaders, [anchor](url) inline links.
- Never invent statistics or sources. Cite only URLs provided in the brief/related research.`
  return _sys
}

function reload() { _sys = null }

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
// Returns { text, title, sources, usage, cost, modelUsed, modelId }.
async function generate({ topic, model = models.articleDefaultModel(), account = null, onToken = null, doResearch = true, relatedItems = null } = {}) {
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
  const template = loadArticleTemplate()
  const articleBrief = buildArticlePrompt({ suggestion, template, userOverride: '', relatedItems })
  const contextBlock = buildContextBlock(memory.loadContext(acct))

  const messages = [{ role: 'system', content: buildArticleSystemPrompt() }]
  if (contextBlock) messages.push({ role: 'system', content: contextBlock })
  messages.push({ role: 'user', content: articleBrief })

  // 3. Write (stream if a token callback was given, else one-shot).
  const opts = { modelId, messages, temperature: 0.8, maxTokens: 4000 }
  const res = onToken ? await llm.stream({ ...opts, onToken }) : await llm.complete(opts)

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
// Returns { text, sources, usage, cost, modelUsed, modelId }.
async function refine({ currentText, instruction, model = models.DEFAULT_MODEL_ID, account = null, sources = [], onToken = null } = {}) {
  if (!currentText?.trim()) throw new Error('articleWriter.refine: currentText required')
  if (!instruction?.trim()) throw new Error('articleWriter.refine: instruction required')
  const acct = account || memory.accounts.getActiveAccount()
  ensureProfile(acct)
  const modelId = models.byId(model) ? model : models.DEFAULT_MODEL_ID

  const contextBlock = buildContextBlock(memory.loadContext(acct))
  const userMsg = `Rewrite the article below per this instruction, keeping it a professional long-form X Article in Souvik's voice. Keep valid existing citations; do not invent new stats or URLs.

INSTRUCTION:
${instruction}

CURRENT ARTICLE:
${currentText}

Output ONLY the rewritten article — no preamble, no explanation.`

  const messages = [{ role: 'system', content: buildArticleSystemPrompt() }]
  if (contextBlock) messages.push({ role: 'system', content: contextBlock })
  messages.push({ role: 'user', content: userMsg })

  const opts = { modelId, messages, temperature: 0.7, maxTokens: 4000 }
  const res = onToken ? await llm.stream({ ...opts, onToken }) : await llm.complete(opts)

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

module.exports = { generate, refine, reload, titleFromText, slugify }
