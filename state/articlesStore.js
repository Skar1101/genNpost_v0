const fs = require('fs')
const path = require('path')

// Article records with full version history. Each article is one JSON file; every generate/refine appends
// a version so the UI can view/revert. `.md` export writes a frontmattered file into files/ (assets/<id>/
// is reserved for future generated images). Atomic .tmp→rename writes, mirroring the other stores.
const DATA_DIR = path.join(__dirname, 'data')
const ARTICLES_DIR = path.join(DATA_DIR, 'articles')
const FILES_DIR = path.join(ARTICLES_DIR, 'files')

function ensureDirs() {
  for (const d of [DATA_DIR, ARTICLES_DIR, FILES_DIR]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
  }
}

function recordPath(id) { return path.join(ARTICLES_DIR, `${id}.json`) }

function writeAtomic(file, data) {
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, typeof data === 'string' ? data : JSON.stringify(data, null, 2))
  fs.renameSync(tmp, file)
}

function slugify(s) {
  return String(s || 'article').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'article'
}

// Create a new article with its first version. Returns the full record.
// `platform`: 'x' (default) | 'substack'. subtitle/subject/previewText/imagePrompt are Substack-only
// fields — always absent/null for X articles, so every existing X-article file on disk keeps parsing
// and displaying exactly as before (no migration needed).
// `id` may be supplied so a caller can hand the client an id to stream into WITHOUT persisting an
// empty record first — the record is then written once, on success. That matters because a process
// killed mid-generation (node --watch restarts on any file save) can never run a catch block, so
// anything already on disk is stranded there.
function newId() {
  return 'a-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6)
}

function create({ id = null, topic, title, text, model, sources = [], usage = null, cost = null, platform = 'x', subtitle = null, subject = null, previewText = null, imagePrompt = null } = {}) {
  ensureDirs()
  const now = new Date().toISOString()
  id = id || newId()
  const record = {
    id,
    title: title || topic || 'Untitled article',
    slug: slugify(title || topic),
    topic: topic || '',
    model: model || null,
    platform,
    sources: sources || [],
    versions: [{ v: 1, text: text || '', instruction: null, model: model || null, usage, cost, subtitle, subject, previewText, imagePrompt, createdAt: now }],
    createdAt: now,
    updatedAt: now,
  }
  writeAtomic(recordPath(id), record)
  return record
}

function get(id) {
  const file = recordPath(id)
  if (!fs.existsSync(file)) return null
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch (_) { return null }
}

// Append a new version (from a refine). Returns the updated record.
function addVersion(id, { text, instruction = null, model = null, sources = null, usage = null, cost = null, subtitle = null, subject = null, previewText = null, imagePrompt = null } = {}) {
  const record = get(id)
  if (!record) return null
  const v = record.versions.length + 1
  record.versions.push({ v, text: text || '', instruction, model, usage, cost, subtitle, subject, previewText, imagePrompt, createdAt: new Date().toISOString() })
  if (sources) record.sources = sources
  if (model) record.model = model
  record.updatedAt = new Date().toISOString()
  writeAtomic(recordPath(id), record)
  return record
}

// Fill in / patch the latest version (used to finalize a streamed generate or refine that was created
// with placeholder text). Also lets the final title/slug/sources be set once the text is known.
function updateLatestVersion(id, { text, usage = null, cost = null, sources = null, model = null, title = null, subtitle = null, subject = null, previewText = null, imagePrompt = null } = {}) {
  const record = get(id)
  if (!record?.versions?.length) return null
  const ver = record.versions[record.versions.length - 1]
  if (text != null) ver.text = text
  if (usage != null) ver.usage = usage
  if (cost != null) ver.cost = cost
  if (model) ver.model = model
  if (subtitle != null) ver.subtitle = subtitle
  if (subject != null) ver.subject = subject
  if (previewText != null) ver.previewText = previewText
  if (imagePrompt != null) ver.imagePrompt = imagePrompt
  if (sources) record.sources = sources
  if (model) record.model = model
  if (title) { record.title = title; record.slug = slugify(title) }
  record.updatedAt = new Date().toISOString()
  writeAtomic(recordPath(id), record)
  return record
}

// Convenience: latest version text.
// Drop the newest version. The refine route appends an EMPTY placeholder before doing the work so
// streamed tokens have a target; when that work fails, the placeholder must come off again or the
// article is left with a 0-char latest version and looks destroyed. That is exactly what happened
// to one real article. Never removes the last remaining version.
function removeLatestVersion(id) {
  const record = get(id)
  if (!record?.versions || record.versions.length < 2) return record
  record.versions.pop()
  record.updatedAt = new Date().toISOString()
  writeAtomic(recordPath(id), record)
  return record
}

// Delete an article record outright. Used when generation fails before any text exists — the route
// pre-creates an empty placeholder so the client has an id to stream into, and without this a failed
// generation leaves a permanent 0-word article in the list.
function remove(id) {
  const file = recordPath(id)
  try { if (fs.existsSync(file)) { fs.unlinkSync(file); return true } } catch (_) { /* ignore */ }
  return false
}

// The newest version that actually HAS text. Falling back matters: if a version is ever empty
// (a pre-2026-08-19 failed refine left them behind), returning '' made every subsequent rewrite
// fail with "currentText required" — one bad refine permanently bricked the article. Skipping back
// to the last real text makes that self-healing.
function latestText(record) {
  const versions = record?.versions || []
  for (let i = versions.length - 1; i >= 0; i--) {
    const t = versions[i].text || ''
    if (t.trim()) return t
  }
  return ''
}

// List all articles, newest first (lightweight — no full version text).
function list(limit = 50) {
  ensureDirs()
  const files = fs.readdirSync(ARTICLES_DIR).filter(f => f.endsWith('.json'))
  const items = []
  for (const f of files) {
    try {
      const r = JSON.parse(fs.readFileSync(path.join(ARTICLES_DIR, f), 'utf8'))
      items.push({
        id: r.id, title: r.title, slug: r.slug, topic: r.topic, model: r.model, platform: r.platform || 'x',
        versionCount: r.versions?.length || 0, createdAt: r.createdAt, updatedAt: r.updatedAt,
      })
    } catch (_) {}
  }
  items.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
  return items.slice(0, limit)
}

// Flatten every priced version across every article into cost-log-shaped entries, for the Expenses
// aggregator. Article costs already persist here (per-version) — this is a read-only view, not a
// second store, so nothing can drift out of sync.
function listCostEntries() {
  ensureDirs()
  const files = fs.readdirSync(ARTICLES_DIR).filter(f => f.endsWith('.json'))
  const entries = []
  for (const f of files) {
    try {
      const r = JSON.parse(fs.readFileSync(path.join(ARTICLES_DIR, f), 'utf8'))
      for (const v of r.versions || []) {
        if (v.cost == null) continue
        entries.push({
          ts: v.createdAt, agent: r.platform === 'substack' ? 'heron' : 'article', action: 'write', model: v.model || r.model,
          cost: v.cost, promptTokens: v.usage?.prompt_tokens ?? null, completionTokens: v.usage?.completion_tokens ?? null,
        })
      }
    } catch (_) {}
  }
  return entries
}

// Write the latest version to a frontmattered .md file. Returns { file, filename, markdown }.
function exportMarkdown(id) {
  const record = get(id)
  if (!record) return null
  ensureDirs()
  const ver = record.versions?.[record.versions.length - 1] || {}
  const text = latestText(record)
  const date = (record.updatedAt || new Date().toISOString()).slice(0, 10)
  const filename = `${date}-${record.slug}.md`
  const srcLines = (record.sources || []).map(s => `  - ${s.url}`).join('\n')
  const fmLines = [
    '---',
    `title: "${(record.title || '').replace(/"/g, "'")}"`,
    `model: ${record.model || 'unknown'}`,
    `createdAt: ${record.createdAt}`,
    `updatedAt: ${record.updatedAt}`,
  ]
  if (ver.subtitle) fmLines.push(`subtitle: "${ver.subtitle.replace(/"/g, "'")}"`)
  if (ver.subject) fmLines.push(`subject: "${ver.subject.replace(/"/g, "'")}"`)
  if (ver.previewText) fmLines.push(`previewText: "${ver.previewText.replace(/"/g, "'")}"`)
  fmLines.push('sources:' + (srcLines ? `\n${srcLines}` : ' []'), '---', '')
  const fm = fmLines.join('\n')
  const imageSection = ver.imagePrompt ? `\n\n## Image prompt\n${ver.imagePrompt}\n` : ''
  const markdown = fm + text + imageSection + '\n'
  const file = path.join(FILES_DIR, filename)
  writeAtomic(file, markdown)
  return { file, filename, markdown }
}

module.exports = { create, newId, get, addVersion, updateLatestVersion, removeLatestVersion, remove, latestText, list, listCostEntries, exportMarkdown, slugify, ARTICLES_DIR, FILES_DIR }
