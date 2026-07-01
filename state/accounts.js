// Account-keyed storage layer. Everything the content engine learns is namespaced per X account,
// so adding a second account later is a new folder — no code change. Single account today.
const fs = require('fs')
const path = require('path')

const DATA_DIR = path.join(__dirname, 'data')
const ACCOUNTS_DIR = path.join(DATA_DIR, 'accounts')
const ACTIVE_FILE = path.join(ACCOUNTS_DIR, '_active.json')
const DEFAULT_ACCOUNT = 'skar_connect'

function ensure(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

// Filesystem-safe account id (used as the folder name)
function slug(s) {
  return String(s || '').toLowerCase().replace(/^@/, '').replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'default'
}

function getActiveAccount() {
  ensure(ACCOUNTS_DIR)
  try {
    if (fs.existsSync(ACTIVE_FILE)) {
      const j = JSON.parse(fs.readFileSync(ACTIVE_FILE, 'utf8'))
      if (j && j.active) return j.active
    }
  } catch (_) { /* fall through */ }
  return DEFAULT_ACCOUNT
}

function setActiveAccount(id) {
  ensure(ACCOUNTS_DIR)
  const a = slug(id)
  const tmp = ACTIVE_FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify({ active: a, updatedAt: new Date().toISOString() }, null, 2))
  fs.renameSync(tmp, ACTIVE_FILE)
  return a
}

function accountDir(account) {
  const d = path.join(ACCOUNTS_DIR, slug(account || getActiveAccount()))
  ensure(d)
  return d
}

function accountFile(account, name) {
  return path.join(accountDir(account), name)
}

function listAccounts() {
  ensure(ACCOUNTS_DIR)
  return fs.readdirSync(ACCOUNTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
}

module.exports = { slug, getActiveAccount, setActiveAccount, accountDir, accountFile, listAccounts, DEFAULT_ACCOUNT }
