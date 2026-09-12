// LLM cost/safety guardrails. All values are env-overridable so you can tune spend without code changes.
// These bound how often and how large LLM calls can be, so no agent accidentally floods the API or
// runs away with tokens. Defaults are generous enough to keep quality for single-user usage.

function intEnv(name, def) {
  const v = parseInt(process.env[name])
  return Number.isFinite(v) && v > 0 ? v : def
}

module.exports = {
  // Max LLM requests allowed in any rolling 60s window (across ALL agents combined).
  MAX_RPM: intEnv('LLM_MAX_RPM', 20),
  // Max LLM requests running at the same time (parallelism cap).
  MAX_CONCURRENT: intEnv('LLM_MAX_CONCURRENT', 3),
  // Hard per-call execution timeout (ms) — a hung/slow call is aborted, freeing the slot.
  TIMEOUT_MS: intEnv('LLM_TIMEOUT_MS', 120000),
  // SDK-level automatic retries per call (kept low to avoid silent cost multiplication).
  MAX_RETRIES: intEnv('LLM_MAX_RETRIES', 2),
  // Absolute ceiling on output tokens per call (caps the most expensive dimension).
  MAX_OUTPUT_TOKENS: intEnv('LLM_MAX_OUTPUT_TOKENS', 4000),
  // How long a call will wait in the rate-limit queue before failing fast (ms).
  MAX_WAIT_MS: intEnv('LLM_MAX_WAIT_MS', 30000),
  // Soft per-account daily spend cap in USD, checked against state/costStore.totalForAccount().
  // Generous by default since there's one real account today; tighten (or enforce it at a call site)
  // before opening the bot to a second tenant. Not yet wired into the LLM/image call path itself —
  // see costStore.totalForAccount, ready for a caller to check before/after a run.
  MAX_DAILY_SPEND_USD: Number(process.env.MAX_DAILY_SPEND_USD) > 0 ? Number(process.env.MAX_DAILY_SPEND_USD) : 10,
}
