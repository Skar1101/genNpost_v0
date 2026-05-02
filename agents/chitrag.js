require('dotenv').config()
const path = require('path')
const OpenAI = require('openai')
const sourcesConfig = require('../tools/sources.config')
const { buildRankingPrompt } = require('../prompts/rankResults')
const { writeLatest, archiveRun } = require('../state/researchStore')
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

async function fetchAllSources(broadcast, filterSources = null) {
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
      const results = await fetchFn(src)
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

  const newItems = filterNew(deduped)
  log.info(`Dedup: ${allResults.length} raw → ${deduped.length} unique → ${newItems.length} new (${deduped.length - newItems.length} already seen in past runs)`)

  // Balance: cap each source so no single source dominates the LLM input pool
  const MAX_PER_SOURCE = 6
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
      response = await getOpenAI().chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 4000,
      })
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
      if (!orig) return item
      return {
        ...item,
        publishedAt: orig.publishedAt || item.publishedAt,
        fetchedAt: orig.fetchedAt,
        engagement: orig.engagement,
        views: orig.views,
        publisher: orig.publisher || item.publisher,
        source: orig.source || item.source,
      }
    })

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

async function run({ triggeredBy = 'user', triggerLabel = null, instructions = null, broadcast = null, forceRefetch = false, filterSources = null } = {}) {
  log.info(`Run started — triggeredBy: ${triggeredBy}${triggerLabel ? ` [${triggerLabel}]` : ''}${instructions ? ' (with instruction delta)' : ''}${filterSources ? ` (sources: ${filterSources.join(',')})` : ''}`)
  const runId = new Date().toISOString().slice(0, 16).replace('T', '-').replace(/:/g, '')

  let raw, failed

  // Skip cache if filterSources is set — always re-fetch for filtered runs
  if (!forceRefetch && !filterSources && instructions && isCacheValid()) {
    log.info('Using cached raw results for re-ranking (cache still valid)')
    raw = _rawCache
    failed = []
  } else {
    ;({ raw, failed } = await fetchAllSources(broadcast, filterSources))
    _rawCache = raw
    _cacheTs = Date.now()
  }

  if (raw.length === 0) {
    log.warn('No new items found after dedup — nothing to rank. All content may already have been seen.')
    return { runId, triggeredBy, rankedAt: new Date().toISOString(), results: [], byCategory: {}, totalFetched: 0 }
  }

  markSeen(raw.map(r => r.url))

  const ranked = await rankWithLLM(raw, instructions, broadcast)
  const byCategory = groupByCategory(ranked)

  const output = {
    runId,
    triggeredBy,
    triggerLabel: triggerLabel || null,
    rankedAt: new Date().toISOString(),
    instructions: instructions || null,
    filterSources: filterSources || null,
    sourcesRun: filterSources ? filterSources : sourcesConfig.filter(s => s.enabled).map(s => s.id),
    sourcesFailed: failed,
    totalFetched: raw.length,
    results: ranked,
    byCategory,
  }

  writeLatest(output)
  archiveRun(output)
  log.info(`Run complete — ${ranked.length} items ranked across ${Object.keys(byCategory).length} categories`)
  return output
}

module.exports = { run }
