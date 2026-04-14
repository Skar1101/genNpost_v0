// Structured logger — writes to console + rotating log files
// Logs live in logs/ directory, one file per day per category

const fs = require('fs')
const path = require('path')

const LOG_DIR = path.join(__dirname, '..', 'logs')

function ensureDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function timestamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 23)
}

function write(category, level, message, extra = null) {
  ensureDir()
  const line = buildLine(level, message, extra)

  // Console output
  const colors = { INFO: '\x1b[36m', WARN: '\x1b[33m', ERROR: '\x1b[31m', DEBUG: '\x1b[90m' }
  const reset = '\x1b[0m'
  console.log(`${colors[level] || ''}${line}${reset}`)

  // Write to daily log file: logs/YYYY-MM-DD.log
  const logFile = path.join(LOG_DIR, `${today()}.log`)
  fs.appendFileSync(logFile, line + '\n')

  // Write errors to separate error log
  if (level === 'ERROR' || level === 'WARN') {
    const errFile = path.join(LOG_DIR, `${today()}-errors.log`)
    fs.appendFileSync(errFile, line + '\n')
  }

  // Write per-source scrape logs to logs/scrape/YYYY-MM-DD-{category}.log
  if (category) {
    const scrapeDir = path.join(LOG_DIR, 'scrape')
    if (!fs.existsSync(scrapeDir)) fs.mkdirSync(scrapeDir, { recursive: true })
    const srcFile = path.join(scrapeDir, `${today()}-${category}.log`)
    fs.appendFileSync(srcFile, line + '\n')
  }
}

function buildLine(level, message, extra) {
  let line = `[${timestamp()}] [${level.padEnd(5)}] ${message}`
  if (extra) {
    if (extra instanceof Error) {
      line += `\n  Error: ${extra.message}`
      if (extra.stack) {
        line += '\n  Stack:\n' + extra.stack.split('\n').slice(1, 5).map(l => '    ' + l.trim()).join('\n')
      }
      if (extra.response) {
        line += `\n  HTTP Status: ${extra.response.status}`
        line += `\n  HTTP URL: ${extra.response.config?.url || ''}`
        const body = typeof extra.response.data === 'object'
          ? JSON.stringify(extra.response.data).slice(0, 300)
          : String(extra.response.data || '').slice(0, 300)
        if (body) line += `\n  Response: ${body}`
      }
    } else if (typeof extra === 'object') {
      line += '\n  ' + JSON.stringify(extra, null, 2).split('\n').join('\n  ')
    } else {
      line += ' | ' + extra
    }
  }
  return line
}

// Public API
const logger = {
  info:  (msg, extra, cat) => write(cat || null, 'INFO',  msg, extra),
  warn:  (msg, extra, cat) => write(cat || null, 'WARN',  msg, extra),
  error: (msg, extra, cat) => write(cat || null, 'ERROR', msg, extra),
  debug: (msg, extra, cat) => write(cat || null, 'DEBUG', msg, extra),

  // Source-specific helpers — automatically tag category
  source: (sourceName) => ({
    info:  (msg, extra) => write(sourceName, 'INFO',  `[${sourceName}] ${msg}`, extra),
    warn:  (msg, extra) => write(sourceName, 'WARN',  `[${sourceName}] ${msg}`, extra),
    error: (msg, extra) => write(sourceName, 'ERROR', `[${sourceName}] ${msg}`, extra),
    debug: (msg, extra) => write(sourceName, 'DEBUG', `[${sourceName}] ${msg}`, extra),
    // Scrape result summary
    result: (count, skipped = 0) => write(sourceName, 'INFO',
      `[${sourceName}] Fetched ${count} items` + (skipped ? `, skipped ${skipped} (already seen or too old)` : '')),
    // Structured fetch error
    fetchError: (url, err) => {
      const msg = `[${sourceName}] Fetch failed${url ? ' — ' + url : ''}`
      write(sourceName, 'ERROR', msg, err)
    },
  }),

  // Log a full scrape run summary
  runSummary: (sources) => {
    const lines = sources.map(s =>
      `  ${s.name.padEnd(22)} ${s.count > 0 ? '✓' : s.skipped ? '~' : '✗'} ${s.count} items fetched${s.error ? ' | ERROR: ' + s.error : ''}`
    ).join('\n')
    write(null, 'INFO', `Scrape run summary:\n${lines}`)
  },

  // List recent log files for the web API
  listLogFiles: () => {
    ensureDir()
    return fs.readdirSync(LOG_DIR)
      .filter(f => f.endsWith('.log') && !f.includes('-errors'))
      .sort().reverse().slice(0, 14)
      .map(f => ({ file: f, path: path.join(LOG_DIR, f) }))
  },

  readLogFile: (filename) => {
    const safe = path.basename(filename)
    const file = path.join(LOG_DIR, safe)
    if (!fs.existsSync(file)) return null
    return fs.readFileSync(file, 'utf8')
  },

  readErrorLog: (date) => {
    const file = path.join(LOG_DIR, `${date || today()}-errors.log`)
    if (!fs.existsSync(file)) return ''
    return fs.readFileSync(file, 'utf8')
  },
}

module.exports = logger
