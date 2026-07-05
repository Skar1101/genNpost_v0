const fs = require('fs')
const path = require('path')

const DATA_DIR = path.join(__dirname, 'data')
const LATEST_FILE = path.join(DATA_DIR, 'research-latest.json')
const ARCHIVE_DIR = path.join(DATA_DIR, 'research-archive')

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  if (!fs.existsSync(ARCHIVE_DIR)) fs.mkdirSync(ARCHIVE_DIR, { recursive: true })
}

function readLatest() {
  ensureDirs()
  if (!fs.existsSync(LATEST_FILE)) return null
  try {
    return JSON.parse(fs.readFileSync(LATEST_FILE, 'utf8'))
  } catch (_) {
    return null
  }
}

function writeLatest(data) {
  ensureDirs()
  const tmp = LATEST_FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, LATEST_FILE)
}

function archiveRun(data) {
  ensureDirs()
  const filename = (data.runId || new Date().toISOString().replace(/[:.]/g, '-')) + '.json'
  fs.writeFileSync(path.join(ARCHIVE_DIR, filename), JSON.stringify(data, null, 2))
}

function listArchive() {
  ensureDirs()
  return fs.readdirSync(ARCHIVE_DIR)
    .filter(f => f.endsWith('.json') && !f.startsWith('reply-'))  // reply targets live in their own store
    .sort()
    .reverse()
    .slice(0, 30)
    .map(f => ({ file: f, runId: f.replace('.json', '') }))
}

function readArchive(filename) {
  // Sanitize: strip any path components so a request can never escape ARCHIVE_DIR (e.g. ../../.env).
  const safe = path.basename(String(filename || ''))
  const file = path.join(ARCHIVE_DIR, safe)
  if (!fs.existsSync(file)) return null
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

// Find the most recent archived run explicitly filtered to a given source.
// Falls back to the most recent run that simply contains results from that source.
function findLatestRunBySource(sourceId) {
  if (!sourceId) return null
  const archive = listArchive()
  // Pass 1: run was explicitly targeted at this source
  for (const { file } of archive) {
    const run = readArchive(file)
    if (!run) continue
    if (run.filterSources?.includes(sourceId)) return run
  }
  // Pass 2: full run that included results from this source
  for (const { file } of archive) {
    const run = readArchive(file)
    if (!run) continue
    if ((run.results || []).some(r => r.source === sourceId)) return run
  }
  return null
}

module.exports = { readLatest, writeLatest, archiveRun, listArchive, readArchive, findLatestRunBySource }
