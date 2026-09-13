// Global, rolling-24h spend circuit breaker — a last-resort ceiling so sharing this instance with
// other people (or a runaway loop) can't spend past a hard limit unnoticed. config/guardrails.js's
// MAX_DAILY_SPEND_USD existed before this file but was never actually checked anywhere; this wires it
// into the two real spend points (utils/llm.js, tools/generateImage.js).
//
// Global rather than per-account: state/costStore.js's totalForAccount() undercounts today because
// most call sites don't tag `account` on their cost entries yet (see its own comments) — a per-account
// cap would be silently wrong. A rolling 24h window (not "since local midnight") avoids any timezone
// question entirely.
const costStore = require('../state/costStore')
const G = require('../config/guardrails')

function spentLast24h() {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  return costStore.list().filter(e => e.ts >= since).reduce((s, e) => s + (e.cost || 0), 0)
}

// Throws when the cap is already met/exceeded — call BEFORE making the priced call, not after.
function assertBudget() {
  const spent = spentLast24h()
  if (spent >= G.MAX_DAILY_SPEND_USD) {
    throw new Error(`Daily spend cap reached ($${spent.toFixed(2)} of $${G.MAX_DAILY_SPEND_USD} in the last 24h) — LLM and image calls are paused. Raise MAX_DAILY_SPEND_USD in .env to lift this.`)
  }
}

module.exports = { assertBudget, spentLast24h }
