// Read/write the article preference files that were already driving article generation but had no
// UI — you could only change them by editing markdown on disk.
//
//   X articles → sub-agents/quill/ARTICLE_TEMPLATE.md
//   Substack   → sub-agents/heron/SUBSTACK_ARTICLE_TEMPLATE.md
//
// agents/articleWriter.js reads these fresh on every generation (loadArticleTemplate() is called
// inside generate(), not cached), so a save takes effect on the next article with no restart.
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')

const FILES = {
  x: {
    label: 'X articles',
    file: path.join(ROOT, 'sub-agents', 'quill', 'ARTICLE_TEMPLATE.md'),
    rel: 'sub-agents/quill/ARTICLE_TEMPLATE.md',
  },
  substack: {
    label: 'Substack posts',
    file: path.join(ROOT, 'sub-agents', 'heron', 'SUBSTACK_ARTICLE_TEMPLATE.md'),
    rel: 'sub-agents/heron/SUBSTACK_ARTICLE_TEMPLATE.md',
  },
}

function platforms() {
  return Object.entries(FILES).map(([id, f]) => ({ id, label: f.label, rel: f.rel }))
}

// Split on `## Heading` into editable sections. Same approach as state/quillPillarsStore.js's
// parsePillarsMarkdown — everything before the first `## ` is the preamble and is preserved
// verbatim, so the file's own explanatory header survives editing.
function parseSections(md) {
  const lines = String(md || '').split(/\r?\n/)
  const sections = []
  let preamble = []
  let current = null

  for (const line of lines) {
    const h = line.match(/^##\s+(.+?)\s*$/)
    if (h) {
      if (current) { current.body = current.body.replace(/\s+$/, ''); sections.push(current) }
      current = { heading: h[1].trim(), body: '' }
    } else if (current) {
      current.body += line + '\n'
    } else {
      preamble.push(line)
    }
  }
  if (current) { current.body = current.body.replace(/\s+$/, ''); sections.push(current) }
  return { preamble: preamble.join('\n').replace(/\s+$/, ''), sections }
}

function buildMarkdown({ preamble, sections }) {
  const parts = []
  if (preamble && preamble.trim()) parts.push(preamble.trim(), '')
  for (const s of sections || []) {
    if (!s.heading?.trim()) continue
    parts.push(`## ${s.heading.trim()}`, (s.body || '').trim(), '')
  }
  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}

function get(platform = 'x') {
  const f = FILES[platform]
  if (!f) throw new Error(`unknown platform: ${platform}`)
  let content = ''
  try { content = fs.readFileSync(f.file, 'utf8') } catch (_) { /* missing → empty */ }
  return { platform, label: f.label, rel: f.rel, exists: !!content, content, ...parseSections(content) }
}

function save(platform, { content = null, preamble = null, sections = null } = {}) {
  const f = FILES[platform]
  if (!f) throw new Error(`unknown platform: ${platform}`)

  const md = content != null ? String(content) : buildMarkdown({ preamble, sections })
  // An empty template silently degrades every future article — the exact failure mode that just
  // cost days of bad output. Never let a text box produce it.
  if (!md.trim() || md.trim().length < 80) {
    throw new Error('Template looks empty or far too short — refusing to save. Every future article depends on this file.')
  }

  const tmp = f.file + '.tmp'
  fs.writeFileSync(tmp, md)
  fs.renameSync(tmp, f.file)
  return get(platform)
}

module.exports = { get, save, platforms, parseSections, buildMarkdown, FILES }
