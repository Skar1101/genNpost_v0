require('dotenv').config()
const path = require('path')
const OpenAI = require('openai')
const sourcesConfig = require('../tools/sources.config')
const { buildRankingPrompt } = require('../prompts/rankResults')
const fetchReplyTargets = require('../tools/fetchReplyTargets')
const { resolveQueries } = require('../tools/replyDomains.config')
const { getEnabledDomainIds } = require('../state/replyDomainsStore')
const { writeLatest, archiveRun } = require('../state/researchStore')
const replyTargetsStore = require('../state/replyTargetsStore')
const activityStore = require('../state/activityStore')
const guard = require('../utils/llmGuard')
const G = require('../config/guardrails')
const { filterNew, markSeen } = require('../state/seenUrlsStore')
const logger = require('../utils/logger')
const log = logger.source('chitrag')

let _openai = null
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

// In-memory raw cache — avoids re-fetching when user gives feedback within 2hr
let _rawCache = null
let _cacheTs = 0
const CACHE_TTL_MS = 2 * 60 * 60 * 1000

function isCacheValid() {
  return _rawCache && (Date.now() - _cacheTs) < CACHE_TTL_MS
}

// Group items by source category and day
function groupByCategory(items) {
  const groups = {}
  for (const item of items) {
    const cat = item.source || 'news'
    const day = (item.publishedAt || item.fetchedAt || new Date().toISOString()).slice(0, 10)
    if (!groups[cat]) groups[cat] = {}
    if (!groups[cat][day]) groups[cat][day] = []
    groups[cat][day].push(item)
  }
  for (const cat of Object.keys(groups)) {
    const sortedDays = {}
    for (const day of Object.keys(groups[cat]).sort().reverse()) {
      sortedDays[day] = groups[cat][day]
    }
    groups[cat] = sortedDays
  }
  return groups
}

async function fetchAllSources(broadcast, filterSources = null, searchQuery = null, skipSeenFilter = false) {
  const enabledSources = sourcesConfig.filter(s => {
    if (!s.enabled) return false
    if (filterSources && filterSources.length > 0 && !filterSources.includes(s.id)) return false
    if (s.requiresKey && !process.env[s.envKey]) {
      log.warn(`"${s.name}" skipped — missing env var ${s.envKey}`)
      return false
    }
    return true
  })

  log.info(`Starting fetch — ${enabledSources.length} sources enabled`)
  const sourceSummary = []

  const fetchers = enabledSources.map(async (src) => {
    try {
      if (broadcast) broadcast({ type: 'research_progress', data: { step: 'fetching', source: src.name } })
      const fetchFn = require(path.join(__dirname, '..', 'tools', src.fetcher))
      const results = await fetchFn({ ...src, searchQuery })
      sourceSummary.push({ name: src.name, count: results.length })
      return { source: src, results }
    } catch (err) {
      log.error(`Source "${src.name}" threw an unhandled error`, err)
      sourceSummary.push({ name: src.name, count: 0, error: err.message })
      return { source: src, results: [], error: err.message }
    }
  })

  const settled = await Promise.allSettled(fetchers)
  const allResults = []
  const failed = []

  for (const outcome of settled) {
    if (outcome.status === 'fulfilled') {
      const { source, results, error } = outcome.value
      if (error) failed.push(source.id)
      allResults.push(...results)
    } else {
      log.error('Promise.allSettled rejection (unexpected)', outcome.reason)
    }
  }

  // Log run summary
  logger.runSummary(sourceSummary)

  // Dedupe by URL within this fetch
  const seen = new Set()
  const deduped = []
  for (const item of allResults) {
    const key = (item.url || '').toLowerCase().trim()
    if (key && !seen.has(key)) { seen.add(key); deduped.push(item) }
  }

  let newItems, alreadySeenCount
  if (skipSeenFilter) {
    newItems = deduped
    alreadySeenCount = 0
    log.info(`Dedup: ${allResults.length} raw → ${deduped.length} unique (targeted run — skipping seen filter)`)
  } else {
    newItems = filterNew(deduped)
    alreadySeenCount = deduped.length - newItems.length
    log.info(`Dedup: ${allResults.length} raw → ${deduped.length} unique → ${newItems.length} new (${alreadySeenCount} already seen in past runs)`)
  }

  // Balance: cap each source so no single source dominates the LLM input pool
  const MAX_PER_SOURCE = skipSeenFilter ? 20 : 6
  const sourceBuckets = {}
  const balanced = []
  for (const item of newItems) {
    const src = item.source || 'unknown'
    if (!sourceBuckets[src]) sourceBuckets[src] = 0
    if (sourceBuckets[src] < MAX_PER_SOURCE) {
      balanced.push(item)
      sourceBuckets[src]++
    }
  }
  log.info(`Balanced pool: ${balanced.length} items (capped at ${MAX_PER_SOURCE}/source) from: ${JSON.stringify(sourceBuckets)}`)

  return { raw: balanced, failed }
}

async function rankWithLLM(rawItems, instructions, broadcast) {
  if (broadcast) broadcast({ type: 'research_progress', data: { step: 'ranking', source: 'LLM' } })
  log.info(`Sending ${rawItems.length} items to LLM for ranking`)

  // Build URL→item map so we can restore original metadata after LLM ranking
  const urlMap = {}
  for (const item of rawItems) {
    if (item.url) urlMap[item.url.toLowerCase().trim()] = item
  }

  const truncated = rawItems.map(item => ({
    ...item,
    snippet: (item.snippet || '').slice(0, 120),
    title: (item.title || '').slice(0, 120),
  }))

  const prompt = buildRankingPrompt(truncated, instructions || {})

  let response
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      response = await guard.runGuarded(() => getOpenAI().chat.completions.create(
        { model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.3, max_tokens: 4000 },
        { maxRetries: 0, timeout: G.TIMEOUT_MS },   // this loop handles retries; guard bounds rate/concurrency
      ))
      break
    } catch (err) {
      const retryable = err.status === 500 || err.status === 503 || err.status === 429
      if (retryable && attempt < 3) {
        const wait = attempt * 5000
        log.warn(`OpenAI error ${err.status} on attempt ${attempt} — retrying in ${wait/1000}s`)
        await new Promise(r => setTimeout(r, wait))
      } else {
        throw err
      }
    }
  }

  try {
    const usage = response.usage
    log.info(`LLM ranking complete — tokens used: ${usage?.prompt_tokens} in / ${usage?.completion_tokens} out`)

    const text = response.choices[0].message.content.trim()
    let ranked
    try {
      ranked = JSON.parse(text)
    } catch (_) {
      const match = text.match(/\[[\s\S]*\]/)
      if (match) ranked = JSON.parse(match[0])
      else {
        log.error('LLM returned non-JSON response', { preview: text.slice(0, 200) })
        throw new Error('LLM returned non-JSON for ranking')
      }
    }

    // Restore correct metadata from original items — LLM hallucinates dates/publishers
    const rankedUrls = new Set()
    ranked = ranked.map(item => {
      const key = (item.url || '').toLowerCase().trim()
      const orig = urlMap[key]
      rankedUrls.add(key)
      if (!orig) {
        log.warn(`LLM hallucinated item not in source data — discarding: ${item.url || item.title}`)
        return null
      }
      return {
        ...item,
        publishedAt: orig.publishedAt || item.publishedAt,
        fetchedAt: orig.fetchedAt,
        engagement: orig.engagement,
        views: orig.views,
        publisher: orig.publisher || item.publisher,
        source: orig.source || item.source,
      }
    }).filter(Boolean)

    // Guarantee: inject top items from any source the LLM skipped entirely
    const rankedSources = new Set(ranked.map(r => r.source))
    const allSources = new Set(rawItems.map(r => r.source))
    let nextRank = ranked.length + 1
    for (const src of allSources) {
      if (rankedSources.has(src)) continue
      // Find best unranked item from this source (first = highest engagement after sorting)
      const candidate = rawItems.find(r => r.source === src && !rankedUrls.has((r.url || '').toLowerCase().trim()))
      if (candidate) {
        log.info(`Injecting skipped source "${src}" — LLM excluded it entirely`)
        ranked.push({ rank: nextRank++, ...candidate, trendingScore: 50, postPotential: 'long', why: 'Auto-included: source skipped by LLM' })
        rankedUrls.add((candidate.url || '').toLowerCase().trim())
      }
    }

    return ranked
  } catch (err) {
    log.error('OpenAI API call failed during ranking', err)
    throw err
  }
}

async function run({ triggeredBy = 'user', triggerLabel = null, instructions = null, broadcast = null, forceRefetch = false, filterSources = null, topN = null, searchQuery = null } = {}) {
  log.info(`Run started — triggeredBy: ${triggeredBy}${triggerLabel ? ` [${triggerLabel}]` : ''}${instructions ? ' (with instruction delta)' : ''}${filterSources ? ` (sources: ${filterSources.join(',')})` : ''}${searchQuery ? ` (query: "${searchQuery}")` : ''}`)
  const runId = new Date().toISOString().slice(0, 16).replace('T', '-').replace(/:/g, '')

  let raw, failed

  // Targeted runs (specific source or query) bypass seen-URL filter so user always gets results
  const isTargeted = !!(filterSources?.length || searchQuery)

  // Skip cache if filterSources or searchQuery is set — always re-fetch for targeted runs
  if (!forceRefetch && !isTargeted && instructions && isCacheValid()) {
    log.info('Using cached raw results for re-ranking (cache still valid)')
    raw = _rawCache
    failed = []
  } else {
    ;({ raw, failed } = await fetchAllSources(broadcast, filterSources, searchQuery, isTargeted))
    if (!isTargeted) { _rawCache = raw; _cacheTs = Date.now() }
  }

  if (raw.length === 0) {
    log.warn('No items found after fetch.')
    return { runId, triggeredBy, rankedAt: new Date().toISOString(), results: [], byCategory: {}, totalFetched: 0 }
  }

  // Only mark seen on full scheduled/manual runs — not on targeted searches
  if (!isTargeted) markSeen(raw.map(r => r.url))

  let ranked = await rankWithLLM(raw, instructions, broadcast)

  // Apply topN cap — slice after ranking so we rank everything, then trim
  if (topN && topN > 0) ranked = ranked.slice(0, Math.min(topN, ranked.length))

  const byCategory = groupByCategory(ranked)

  const output = {
    runId,
    triggeredBy,
    triggerLabel: triggerLabel || null,
    rankedAt: new Date().toISOString(),
    instructions: instructions || null,
    filterSources: filterSources || null,
    topN: topN || null,
    sourcesRun: filterSources ? filterSources : sourcesConfig.filter(s => s.enabled).map(s => s.id),
    sourcesFailed: failed,
    totalFetched: raw.length,
    results: ranked,
    byCategory,
  }

  writeLatest(output)
  archiveRun(output)
  activityStore.recordAndBroadcast(broadcast, {
    agent: 'chitrag', action: 'research', triggerLabel: triggerLabel || '🖱 Manual',
    summary: `${ranked.length} ranked` + (filterSources ? ` · ${filterSources.join(', ')}` : ''),
    ref: { kind: 'research', id: runId },
  })
  log.info(`Run complete — ${ranked.length} items ranked across ${Object.keys(byCategory).length} categories`)
  return output
}

// ── Reply Targets section ──────────────────────────────────────────────────────
// Deterministic (no LLM): find fresh X posts worth replying to.
// Qualify only if: age ≤ window, impressions > 10K, I2C (impressions/comments) > 100.
// Sorted by highest I2C. Falls back by widening the age window 1hr → 2hr → 3hr until
// it reaches `target`, never relaxing the impression/I2C bars.
async function findReplyTargets({ target = 30, domains = null, extraKeywords = null, broadcast = null } = {}) {
  const { MIN_IMPRESSIONS, MIN_I2C } = fetchReplyTargets

  // Domains: explicit list (ad-hoc override) OR the persisted enabled set (core + enabled extras).
  const domainIds = (domains && domains.length) ? domains : getEnabledDomainIds()
  const queries = [...resolveQueries(domainIds)]
  // Ad-hoc free-text topics ("world cup") become their own one-off queries for this run.
  const keywords = (extraKeywords || []).map(k => k.trim()).filter(Boolean)
  for (const kw of keywords) queries.push(`(${kw}) lang:en`)

  log.info(`Reply-target search started — target: ${target}, bars: >${MIN_IMPRESSIONS} imp, I2C >${MIN_I2C}, domains: [${domainIds.join(', ')}]${keywords.length ? ` + adhoc: [${keywords.join(', ')}]` : ''}`)
  if (broadcast) {
    broadcast({ type: 'research_progress', data: { step: 'fetching', source: 'Reply Targets' } })
    broadcast({ type: 'reply_progress', data: { message: `Searching ${queries.length} queries across X…` } })
  }

  // Live per-query progress so the chat shows the search is actually running.
  const onProgress = (i, total, found) => {
    if (broadcast) broadcast({ type: 'reply_progress', data: { message: `Scanning X… query ${i}/${total} (${found} candidates so far)` } })
  }
  const pool = await fetchReplyTargets(queries, onProgress)
  if (broadcast) broadcast({ type: 'reply_progress', data: { message: `Filtering ${pool.length} posts — ≤4h, >${(MIN_IMPRESSIONS/1000)}K impressions, I2C>${MIN_I2C}…` } })

  // Progressive window: keep the quality bars fixed, widen the freshness window only if short.
  // Tries the tightest (freshest) window first; widens to a 4h ceiling, since posts rarely cross
  // 10K impressions within 1h — qualifying viral posts are typically 2–4h old.
  const WINDOWS = [60, 120, 180, 240]
  let qualified = []
  let windowUsedMin = WINDOWS[WINDOWS.length - 1]
  for (const windowMin of WINDOWS) {
    qualified = pool.filter(p =>
      p.ageMinutes <= windowMin && p.impressions > MIN_IMPRESSIONS && p.i2c > MIN_I2C
    )
    windowUsedMin = windowMin
    if (qualified.length >= target) break
  }

  const qualifiedUrls = new Set(qualified.map(p => p.url))

  // Keep the WHOLE fetched pool in the saved list (nothing discarded). Each post is flagged
  // `qualified` if it cleared all bars within the chosen window. Order: qualified first (by I2C
  // desc, the actual reply targets), then the rest (also by I2C desc) for context.
  const inWindow = p => p.ageMinutes <= windowUsedMin
  const allSorted = [...pool].sort((a, b) => {
    const qa = qualifiedUrls.has(a.url) ? 1 : 0
    const qb = qualifiedUrls.has(b.url) ? 1 : 0
    if (qa !== qb) return qb - qa
    return b.i2c - a.i2c
  })

  const toRow = (r, i) => {
    const isQ = qualifiedUrls.has(r.url)
    return {
      rank: i + 1,
      title: r.headline,
      fullText: r.fullText || r.headline,   // full post — used to draft a reply on demand
      author: r.author || r.publisher,
      url: r.url,
      source: 'twitter',
      publisher: r.publisher,
      snippet: `${r.impressions.toLocaleString()} imp · I2C ${r.i2c} · ${r.comments} replies · ${r.ageMinutes}m old`,
      why: isQ ? 'Reply target' : `Below bar (${r.impressions <= MIN_IMPRESSIONS ? '<10K imp' : r.i2c <= MIN_I2C ? 'I2C low' : !inWindow(r) ? 'too old' : 'n/a'})`,
      tag: 'reply',
      qualified: isQ,
      trendingScore: r.i2c,
      postPotential: 'short',
      impressions: r.impressions,
      comments: r.comments,
      i2c: r.i2c,
      ageMinutes: r.ageMinutes,
      publishedAt: r.createdAt,
    }
  }

  const allRows = allSorted.map(toRow)
  const qualifiedRows = allRows.filter(r => r.qualified).slice(0, target)
  log.info(`Reply-target search done — pool ${pool.length}, window ${windowUsedMin}min, qualified ${qualified.length}, list ${allRows.length}, chat ${qualifiedRows.length}`)

  const runId = 'reply-' + new Date().toISOString().slice(0, 19).replace('T', '-').replace(/:/g, '')
  const output = {
    runId,
    section: 'reply',
    triggeredBy: 'user',
    triggerLabel: '💬 Reply Targets',
    rankedAt: new Date().toISOString(),
    generatedAt: new Date().toISOString(),
    windowUsedMin,
    target,
    count: qualifiedRows.length,        // qualifying reply targets
    totalInList: allRows.length,        // full saved pool
    domains: domainIds,
    adhocKeywords: keywords,
    sourcesRun: ['twitter'],
    sourcesFailed: [],
    totalFetched: pool.length,
    results: allRows,                   // full list saved + shown in ChitraG panel
    qualified: qualifiedRows,           // subset Titto delivers to chat/Telegram
  }

  // Store in the SEPARATE reply-targets store (its own tab) — never the research archive, so it can't
  // overlap or evict ChitraG research runs. Broadcast a dedicated event for the Replies tab.
  replyTargetsStore.writeLatest(output)
  if (broadcast) broadcast({ type: 'reply_targets_complete', data: output })
  activityStore.recordAndBroadcast(broadcast, {
    agent: 'chitrag-replies', action: 'reply_targets', triggerLabel: '💬 Reply Targets',
    summary: `${qualifiedRows.length} targets · ${allRows.length} scanned · ${windowUsedMin}m window`,
    ref: { kind: 'replies' },
  })
  return output
}

module.exports = { run, findReplyTargets }
