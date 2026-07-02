const G = require('../config/guardrails')
const logger = require('./logger')
const log = logger.source('llm-guard')

// Shared gate that EVERY LLM call passes through, process-wide. Bounds:
//   - concurrency  (MAX_CONCURRENT running at once)
//   - rate         (MAX_RPM requests per rolling 60s window)
// A call waits its turn; if it can't acquire a slot within MAX_WAIT_MS it fails fast with a clear error
// instead of piling onto the API. The slot is held for the WHOLE call (incl. streaming), so the limits
// are real. This is deliberately simple (poll + sleep) — plenty for single-user volume.

const WINDOW_MS = 60000
let active = 0
const recent = []          // timestamps of started requests within the window
let _logged = false

function logOnce() {
  if (_logged) return
  _logged = true
  log.info(`Guardrails: ${G.MAX_RPM} rpm · ${G.MAX_CONCURRENT} concurrent · ${G.TIMEOUT_MS}ms timeout · ${G.MAX_RETRIES} retries · ${G.MAX_OUTPUT_TOKENS} max out tokens`)
}

function prune(now) {
  while (recent.length && now - recent[0] > WINDOW_MS) recent.shift()
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function acquire() {
  logOnce()
  const start = Date.now()
  for (;;) {
    const now = Date.now()
    prune(now)
    if (active < G.MAX_CONCURRENT && recent.length < G.MAX_RPM) {
      active++
      recent.push(now)
      return
    }
    if (now - start > G.MAX_WAIT_MS) {
      throw new Error(`LLM guardrail: rate limit hit (${G.MAX_RPM}/min, ${G.MAX_CONCURRENT} concurrent) — try again shortly`)
    }
    await sleep(200)
  }
}

function release() {
  active = Math.max(0, active - 1)
}

// Run an LLM call under the shared limits. `fn` should perform the actual API call (and, for streaming,
// consume the stream) so the concurrency slot is held for the call's full lifetime.
async function runGuarded(fn) {
  await acquire()
  try {
    return await fn()
  } finally {
    release()
  }
}

// Snapshot for diagnostics / tests.
function stats() {
  prune(Date.now())
  return { active, inWindow: recent.length, maxConcurrent: G.MAX_CONCURRENT, maxRpm: G.MAX_RPM }
}

module.exports = { runGuarded, stats, config: G }
