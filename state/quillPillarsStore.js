const fs = require('fs')
const path = require('path')

const PILLARS_FILE = path.join(__dirname, '..', 'sub-agents', 'quill', 'PILLARS.md')

// Parse `## Heading\n<body until next ## or end>` into pillar objects.
// Anything before the first `## ` is treated as the file preamble and ignored.
function parsePillarsMarkdown(md) {
  if (!md) return []
  const lines = md.split(/\r?\n/)
  const pillars = []
  let current = null

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+?)\s*$/)
    if (headingMatch) {
      if (current) {
        current.notes = current.notes.trim()
        pillars.push(current)
      }
      current = {
        id: 'pillar-' + headingMatch[1].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        label: headingMatch[1].trim(),
        notes: '',
      }
    } else if (current) {
      current.notes += line + '\n'
    }
  }
  if (current) {
    current.notes = current.notes.trim()
    pillars.push(current)
  }
  return pillars
}

function listPillars() {
  if (!fs.existsSync(PILLARS_FILE)) return []
  try {
    const md = fs.readFileSync(PILLARS_FILE, 'utf8')
    return parsePillarsMarkdown(md)
  } catch (_) { return [] }
}

// Pillars are edited by the user directly in PILLARS.md.
// setPillars exists for API compatibility but is a no-op (read-only from UI's perspective).
function setPillars() {
  throw new Error('Pillars are edited in sub-agents/quill/PILLARS.md. Save the file and reload.')
}

module.exports = { listPillars, setPillars }
