const fs = require('fs')
const path = require('path')

const DATA_DIR = path.join(__dirname, 'data')
const FILE = path.join(DATA_DIR, 'scheduler.json')

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

function getStatus() {
  if (!fs.existsSync(FILE)) return { enabled: true }   // default ON
  try {
    const data = JSON.parse(fs.readFileSync(FILE, 'utf8'))
    return { enabled: data?.enabled !== false }
  } catch (_) { return { enabled: true } }
}

function setEnabled(enabled) {
  ensureDir()
  const data = { enabled: !!enabled, updatedAt: new Date().toISOString() }
  const tmp = FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, FILE)
  return data
}

function isEnabled() { return getStatus().enabled }

module.exports = { getStatus, setEnabled, isEnabled }
