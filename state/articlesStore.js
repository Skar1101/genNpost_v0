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
function create({ topic, title, text, model, sources = [], usage = null, cost = null } = {}) {
  ensureDirs()
  const now = new Date().toISOString()
  const id = 'a-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6)
  const record = {
    id,
    title: title || topic || 'Untitled article',
    slug: slugify(title || topic),
    topic: topic || '',
    model: model || null,
    sources: sources || [],
    versions: [{ v: 1, text: text || '', instruction: null, model: model || null, usage, cost, createdAt: now }],
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
function addVersion(id, { text, instruction = null, model = null, sources = null, usage = null, cost = null } = {}) {
  const record = get(id)
  if (!record) return null
  const v = record.versions.length + 1
  record.versions.push({ v, text: text || '', instruction, model, usage, cost, createdAt: new Date().toISOString() })
  if (sources) record.sources = sources
  if (model) record.model = model
  record.updatedAt = new Date().toISOString()
  writeAtomic(recordPath(id), record)
  return record
}

// Fill in / patch the latest version (used to finalize a streamed generate or refine that was created
// with placeholder text). Also lets the final title/slug/sources be set once the text is known.
function updateLatestVersion(id, { text, usage = null, cost = null, sources = null, model = null, title = null } = {}) {
  const record = get(id)
  if (!record?.versions?.length) return null
  const ver = record.versions[record.versions.length - 1]
  if (text != null) ver.text = text
  if (usage != null) ver.usage = usage
  if (cost != null) ver.cost = cost
  if (model) ver.model = model
  if (sources) record.sources = sources
  if (model) record.model = model
  if (title) { record.title = title; record.slug = slugify(title) }
  record.updatedAt = new Date().toISOString()
  writeAtomic(recordPath(id), record)
  return record
}

// Convenience: latest version text.
function latestText(record) {
  if (!record?.versions?.length) return ''
  return record.versions[record.versions.length - 1].text || ''
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
        id: r.id, title: r.title, slug: r.slug, topic: r.topic, model: r.model,
        versionCount: r.versions?.length || 0, createdAt: r.createdAt, updatedAt: r.updatedAt,
      })
    } catch (_) {}
  }
  items.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
  return items.slice(0, limit)
}

// Write the latest version to a frontmattered .md file. Returns { file, filename, markdown }.
function exportMarkdown(id) {
  const record = get(id)
  if (!record) return null
  ensureDirs()
  const text = latestText(record)
  const date = (record.updatedAt || new Date().toISOString()).slice(0, 10)
  const filename = `${date}-${record.slug}.md`
  const srcLines = (record.sources || []).map(s => `  - ${s.url}`).join('\n')
  const fm = [
    '---',
    `title: "${(record.title || '').replace(/"/g, "'")}"`,
    `model: ${record.model || 'unknown'}`,
    `createdAt: ${record.createdAt}`,
    `updatedAt: ${record.updatedAt}`,
    'sources:' + (srcLines ? `\n${srcLines}` : ' []'),
    '---',
    '',
  ].join('\n')
  const markdown = fm + text + '\n'
  const file = path.join(FILES_DIR, filename)
  writeAtomic(file, markdown)
  return { file, filename, markdown }
}

module.exports = { create, get, addVersion, updateLatestVersion, latestText, list, exportMarkdown, slugify, ARTICLES_DIR, FILES_DIR }
