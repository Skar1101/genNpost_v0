const fs = require('fs')
const path = require('path')

// Reply-target (I2C) runs are stored separately from ChitraG research so they never overlap or
// evict research runs from the history. Latest run only — it's a low-frequency, on-demand feature.
const DATA_DIR = path.join(__dirname, 'data')
const LATEST_FILE = path.join(DATA_DIR, 'reply-targets-latest.json')

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

function writeLatest(data) {
  ensureDir()
  const tmp = LATEST_FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, LATEST_FILE)
}

function readLatest() {
  if (!fs.existsSync(LATEST_FILE)) return null
  try { return JSON.parse(fs.readFileSync(LATEST_FILE, 'utf8')) } catch (_) { return null }
}

module.exports = { writeLatest, readLatest }
