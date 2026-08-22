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
const keywordsStore = require('../state/keywordsStore')
const { readUrlsIn, extractUrls } = require('../tools/readUrl')
const strategyStore = require('../state/strategyStore')
const logger = require('../utils/logger')
const costTracker = require('../utils/costTracker')
const log = logger.source('raven')

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

const FIT_PLATFORMS = ['x', 'linkedin', 'substack']

// Domains come from the editable content strategy (state/strategyStore.js), not from a constant
// here — that's what lets a positioning change be a Settings edit rather than a code change.
// `other` is never postable: it's the label the ranker gives something that should have been
// excluded, and it gets dropped in code rather than trusted to prompt discipline alone.
const DOMAINS = strategyStore.ALL_DOMAINS
const AI_DOMAINS = ['ai-tools', 'ai-research', 'ai-impact']

function onTopicDomains() {
  const d = strategyStore.onTopicDomains(null)
  return d.length ? d : DOMAINS.filter(x => x !== 'other')
}

function normalizeDomain(d) {
  const v = String(d || '').toLowerCase().trim()
  return DOMAINS.includes(v) ? v : 'other'
}

// Classify arbitrary items into the same domains the ranker uses. Needed for anything that reaches
// the pipeline WITHOUT going through ranking — watchlist posts fetched directly, for instance,
// which would otherwise skip the topic filter entirely and could be reposted off-subject.
// One cheap call for the whole batch.
async function classifyDomains(items, { loose = false } = {}) {
  const rows = (items || []).filter(i => i?.title)
  if (!rows.length) return items || []

  const list = rows.map((r, i) => `${i + 1}. ${String(r.title).replace(/\s+/g, ' ').slice(0, 180)}`).join('\n')

  // Loose mode is for CURATED sources — the watchlist. Those accounts were hand-picked because they
  // post these subjects, so the filter should not fight that curation: strict mode was dropping 85%
  // of watchlist posts, including plainly on-subject self-help. Here only clear violations drop.
  const prompt = loose
    ? `These posts come from accounts the user deliberately follows for AI, self-help and wellness content. Assume a post belongs UNLESS it clearly does not.

Label each "ok" or "violation".

"violation" ONLY for: politics/policy, religion or devotional practice, finance/crypto/trading/get-rich, sports, celebrity gossip, or pure self-promotion (course/product sales pitch with no substance).

Everything else is "ok" — including general life advice, mindset, motivation, productivity, business lessons and personal reflection. When unsure, answer "ok".

POSTS:
${list}

Return ONLY a JSON array of ${rows.length} strings ("ok" or "violation"), in order.`
    : `Label each post with the ONE domain it belongs to.

Domains:
- "ai-tools"     a usable AI tool, agent, product, model release, or practical how-to
- "ai-research"  AI papers / academic work
- "ai-impact"    how AI changes work, jobs, daily life, society
- "self-help"    discipline, habits, focus, mindset, consistency, resilience
- "wellness"     sleep, energy, recovery, meditation, mental and physical health
- "building"     solo SaaS, indie business, building in public
- "other"        anything else — politics, religion, finance/economics, sports, trivia, lifestyle, general commentary

Be strict. If a post is general life/business commentary rather than clearly one of the first six, label it "other".

POSTS:
${list}

Return ONLY a JSON array of ${rows.length} domain strings, in order.`

  try {
    const res = await guard.runGuarded(() => getOpenAI().chat.completions.create(
      { model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.1, max_tokens: 600 },
      { maxRetries: G.MAX_RETRIES, timeout: G.TIMEOUT_MS },
    ))
    costTracker.priceAndRecord({ agent: 'raven', action: loose ? 'classify_loose' : 'classify_domains', modelId: 'openai/gpt-4o-mini', usage: res.usage })
    const raw = res.choices[0].message.content.trim()
    const m = raw.match(/\[[\s\S]*\]/)
    const labels = JSON.parse(m ? m[0] : raw)
    if (loose) {
      // Anything not an explicit violation passes. Default to keeping when the label is unreadable —
      // for a curated source, a missed classification should not silently discard a good post.
      rows.forEach((r, i) => { r.violation = String(labels[i] || '').toLowerCase().trim() === 'violation' })
    } else {
      rows.forEach((r, i) => { r.domain = normalizeDomain(labels[i]) })
    }
  } catch (err) {
    log.warn(`classifyDomains failed (${err.message}) — leaving items unclassified`)
  }
  return items
}

// Items in one domain group, best first. Used by Quill to guarantee a themed thread and by the
// repost picker to stay inside AI + wellness.
function topForDomains(research, domains, n = 10) {
  const want = new Set(domains)
  return (research?.results || [])
    .filter(r => r.tag !== 'reply' && want.has(normalizeDomain(r.domain)))
    .sort((a, b) => (b.trendingScore || 0) - (a.trendingScore || 0))
    .slice(0, n)
}

// Coerce the LLM's platformFit into a full {x,linkedin,substack} of 0-100 ints. Falls back to the
// item's overall trendingScore when the model omitted the field entirely, so a missing score never
// silently reads as 0 and buries an otherwise strong item.
function normalizeFit(fit, trendingScore) {
  const fallback = Number.isFinite(trendingScore) ? Math.max(0, Math.min(100, trendingScore)) : 50
  const out = {}
  for (const p of FIT_PLATFORMS) {
    const v = fit && fit[p]
    out[p] = Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : fallback
  }
  return out
}

// Items ordered by their fit for ONE platform. This is what Quill/Parrot/Heron should call instead
// of all three slicing the same `results` array and competing for the same top items.
function topForPlatform(research, platform, n = 15) {
  const plat = FIT_PLATFORMS.includes(platform) ? platform : 'x'
  const rows = (research?.results || []).filter(r => r.tag !== 'reply')
  return [...rows]
    .sort((a, b) => (b.platformFit?.[plat] ?? 0) - (a.platformFit?.[plat] ?? 0))
    .slice(0, n)
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

  const MAX_PER_SOURCE = skipSeenFilter ? 20 : 10
  const sourceCounts = {}
  const bump = src => { sourceCounts[src] = (sourceCounts[src] || 0) + 1 }
  let balanced

  if (skipSeenFilter) {
    // Targeted run (specific source/query) — user asked for one topic; skip the 60/40 quota,
    // just cap per source so no single one floods the pool.
    balanced = []
    for (const item of newItems) {
      const src = item.source || 'unknown'
      if ((sourceCounts[src] || 0) >= MAX_PER_SOURCE) continue
      balanced.push(item); bump(src)
    }
    log.info(`Balanced pool: ${balanced.length} items (targeted — ${MAX_PER_SOURCE}/source) from: ${JSON.stringify(sourceCounts)}`)
  } else {
    // Scheduled/manual full run — enforce Souvik's ~60% human / ~40% tech mix at the SUPPLY layer,
    // so engagement-sorted AI can't bury discipline/meditation/self-dev/AI-for-humans items.
    // Each item is tagged `topic` by its fetcher; anything untagged (HN/GitHub/arXiv) = 'tech'.
    const POOL_SIZE = 40
    // The supply mix follows the PILLAR WEIGHTS, not a constant. This used to be a hardcoded
    // 60% human / 40% tech written before pillars existed — a second, contradictory setting that
    // silently fought whatever the strategy said. Now changing a weight in Settings moves the
    // research supply too, in one place.
    const techShare = strategyStore.aiShare(null)          // AI domains -> the 'tech' bucket
    const techTarget = Math.round(POOL_SIZE * techShare)
    const targets = { human: POOL_SIZE - techTarget, tech: techTarget }
    const bucketOf = it => (it.topic === 'human' ? 'human' : 'tech')
    const bucketCount = { human: 0, tech: 0 }
    balanced = []
    const chosen = new Set()

    // Reserve room for the AI-TOOLS sources before anything else claims it. GitHub/HN/YouTube are
    // where actual tools and releases come from, and they return far fewer items than Twitter and
    // Reddit — so without a floor they get crowded out entirely and the drop turns into whatever
    // social happened to surface. This is the supply-side half of the fix; the seen-URL TTL in
    // state/seenUrlsStore.js is the other half.
    const TOOL_SOURCES = ['github', 'hackernews', 'youtube']
    const TOOL_FLOOR = 10
    let toolCount = 0
    for (const item of newItems) {
      if (toolCount >= TOOL_FLOOR) break
      if (!TOOL_SOURCES.includes(item.source)) continue
      const src = item.source || 'unknown'
      if ((sourceCounts[src] || 0) >= MAX_PER_SOURCE) continue
      balanced.push(item); chosen.add(item.url); bump(src); toolCount++
      bucketCount[bucketOf(item)]++
    }
    if (toolCount) log.info(`Reserved ${toolCount} AI-tool item(s) from ${TOOL_SOURCES.join('/')} before balancing`)
    // Human bucket first so it gets first claim on each source's budget; then tech.
    for (const bucket of ['human', 'tech']) {
      for (const item of newItems) {
        if (bucketCount[bucket] >= targets[bucket]) break
        if (bucketOf(item) !== bucket) continue
        if (chosen.has(item.url)) continue      // already reserved by the AI-tools floor above
        const src = item.source || 'unknown'
        if ((sourceCounts[src] || 0) >= MAX_PER_SOURCE) continue
        balanced.push(item); chosen.add(item.url); bump(src); bucketCount[bucket]++
      }
    }
    // Backfill if a bucket ran thin — fill up to POOL_SIZE from leftovers (source cap only) so the
    // drop never ships short.
    if (balanced.length < POOL_SIZE) {
      for (const item of newItems) {
        if (balanced.length >= POOL_SIZE) break
        if (chosen.has(item.url)) continue
        const src = item.source || 'unknown'
        if ((sourceCounts[src] || 0) >= MAX_PER_SOURCE) continue
        balanced.push(item); chosen.add(item.url); bump(src)
      }
    }
    log.info(`Balanced pool: ${balanced.length} items (${bucketCount.human} human / ${bucketCount.tech} tech, target ${targets.human}/${targets.tech}) from: ${JSON.stringify(sourceCounts)}`)
  }

  return { raw: balanced, failed }
}

async function rankWithLLM(rawItems, instructions, broadcast, platformKeywords = null) {
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

  const prompt = buildRankingPrompt(truncated, instructions || {}, platformKeywords)

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
    costTracker.priceAndRecord({ agent: 'raven', action: 'rank', modelId: 'openai/gpt-4o-mini', usage })
    log.info(`LLM ranking complete — tokens used: ${usage?.prompt_tokens} in / ${usage?.completion_tokens} out`)

    const text = response.choices[0].message.content.trim()
    // gpt-4o-mini occasionally emits a stray backslash (e.g. before an apostrophe) that isn't a
    // valid JSON escape — "Bad escaped character" from JSON.parse. Escape any backslash that
    // isn't already starting a valid escape sequence before parsing.
    const fixEscapes = (s) => s.replace(/\\(?!["\\/bfnrtu])/g, '\\\\')
    let ranked
    try {
      ranked = JSON.parse(text)
    } catch (_) {
      try {
        ranked = JSON.parse(fixEscapes(text))
      } catch (__) {
        const match = text.match(/\[[\s\S]*\]/)
        if (match) {
          try {
            ranked = JSON.parse(match[0])
          } catch (___) {
            ranked = JSON.parse(fixEscapes(match[0]))
          }
        } else {
          log.error('LLM returned non-JSON response', { preview: text.slice(0, 200) })
          throw new Error('LLM returned non-JSON for ranking')
        }
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
        domain: normalizeDomain(item.domain),
        platformFit: normalizeFit(item.platformFit, item.trendingScore),
      }
    }).filter(Boolean)

    // Drop anything the ranker itself labelled off-topic. The prompt already bans these, but a
    // prompt rule is not a guarantee — and off-topic filler (cannabis history, etymology, ASMR,
    // game-playing AI) reaching the drop is exactly the failure this exists to stop.
    // Dropped items are RETURNED, not just logged, so the Raven page can show what was filtered and
    // why — when a drop feels wrong you need to see whether the filter was too tight or the
    // sources were thin, without reading logs.
    const onTopic = onTopicDomains()
    const offTopic = ranked.filter(r => !onTopic.includes(r.domain))
    if (offTopic.length) {
      log.warn(`Dropping ${offTopic.length} off-topic item(s): ${offTopic.map(r => String(r.title).slice(0, 40)).join(' | ')}`)
      ranked = ranked.filter(r => onTopic.includes(r.domain))
    }
    ranked._dropped = offTopic.map(r => ({
      title: r.title, source: r.source, url: r.url, domain: r.domain,
      reason: `off-topic — labelled "${r.domain}", not one of: ${onTopic.join(', ')}`,
    }))

    // NOTE — the old "inject top items from any source the LLM skipped entirely" guarantee was
    // REMOVED here (2026-08-11). It re-added RAW, unclassified items after the off-topic filter had
    // already run, so they defaulted to domain 'other' and slipped straight through: a live run
    // produced a YouTube monetisation-policy story and a Dark-Souls-adjacent arXiv paper that way,
    // right after the filter had correctly cleared the list.
    //
    // Its purpose was source diversity when the ranker ignored a whole source. That is now handled
    // better and earlier, at the supply layer, by the AI-tools floor in fetchAllSources() — which
    // reserves slots for github/hackernews/youtube BEFORE ranking, instead of bolting an
    // unvetted item on afterwards.

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

  // Only mark seen on full scheduled/manual runs — not on targeted searches.
  // Pass whole items, not bare URLs: the source decides how long the URL stays blocked
  // (state/seenUrlsStore.js — slow-moving AI-tool sources forget sooner).
  if (!isTargeted) markSeen(raw.map(r => ({ url: r.url, source: r.source })))

  // Per-platform keyword priorities ride into the same ranking call — no extra LLM requests.
  const platformKeywords = {}
  for (const p of FIT_PLATFORMS) platformKeywords[p] = keywordsStore.terms(null, p)

  let ranked = await rankWithLLM(raw, instructions, broadcast, platformKeywords)
  // Carried off the array before any slicing loses it — surfaced in the output so the Raven page
  // can show WHAT the filter removed and why, instead of it only existing in the logs.
  const dropped = ranked._dropped || []

  // Apply topN cap — slice after ranking so we rank everything, then trim
  if (topN && topN > 0) ranked = ranked.slice(0, Math.min(topN, ranked.length))

  const byCategory = groupByCategory(ranked)
  // Same pool, ordered three ways. Each platform manager reads its own list so they stop competing
  // for the identical top items.
  const byPlatform = {}
  for (const p of FIT_PLATFORMS) byPlatform[p] = topForPlatform({ results: ranked }, p, 15).map(r => r.url)

  // Raw items fetched per source (BEFORE ranking) — lets /health flag a source that silently returned 0
  // even when it didn't throw (e.g. an API that started 400ing but the fetcher swallowed the error).
  const sourceCounts = {}
  for (const it of raw) { if (it.source) sourceCounts[it.source] = (sourceCounts[it.source] || 0) + 1 }

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
    sourceCounts,
    totalFetched: raw.length,
    results: ranked,
    byCategory,
    byPlatform,
    platformKeywords,
    // What the topic filter removed, and why. When a drop feels thin or wrong, this is how you tell
    // whether the filter was too tight or the sources simply had nothing on-subject.
    dropped,
    strategy: { positioning: strategyStore.get(null).positioning, onTopicDomains: onTopicDomains() },
  }

  writeLatest(output)
  archiveRun(output)
  activityStore.recordAndBroadcast(broadcast, {
    agent: 'raven', action: 'research', triggerLabel: triggerLabel || '🖱 Manual',
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
    results: allRows,                   // full list saved + shown in the Raven panel
    qualified: qualifiedRows,           // subset Titto delivers to chat/Telegram
  }

  // Store in the SEPARATE reply-targets store (its own tab) — never the research archive, so it can't
  // overlap or evict Raven research runs. Broadcast a dedicated event for the Replies tab.
  replyTargetsStore.writeLatest(output)
  if (broadcast) broadcast({ type: 'reply_targets_complete', data: output })
  activityStore.recordAndBroadcast(broadcast, {
    agent: 'raven-replies', action: 'reply_targets', triggerLabel: '💬 Reply Targets',
    summary: `${qualifiedRows.length} targets · ${allRows.length} scanned · ${windowUsedMin}m window`,
    ref: { kind: 'replies' },
  })
  return output
}

// ── Read one specific page ────────────────────────────────────────────────────
// run() is a query-and-rank pipeline across configured sources; it has no notion of "go get this
// exact URL". But fetching from the outside world is Raven's job, so when Souvik pastes a link the
// request belongs here rather than in Titto — Titto asks, Raven fetches, the same as every other
// source. tools/readUrl.js is the implementation, exactly as tools/fetchGitHub.js backs the github
// source.
//
// Returns [{ url, title, text, truncated }] — empty when nothing readable came back.
async function readLinks(text, { limit = 2, broadcast = null, triggerLabel = '🔗 Link' } = {}) {
  const urls = extractUrls(text)
  if (!urls.length) return []

  const pages = await readUrlsIn(text, limit)
  const ok = pages.length
  log.info(`Link read — ${ok}/${Math.min(urls.length, limit)} readable${ok ? ` (${pages.reduce((n, p) => n + p.text.length, 0)} chars)` : ''}`)

  activityStore.recordAndBroadcast(broadcast, {
    agent: 'raven',
    action: 'read-link',
    status: ok ? 'done' : 'error',
    triggerLabel,
    summary: ok
      ? `read ${ok} page${ok === 1 ? '' : 's'}: ${pages.map(p => p.title || p.url).join(' · ').slice(0, 140)}`
      : `could not read: ${urls.slice(0, limit).join(' · ').slice(0, 140)}`,
    ref: { kind: 'link-read', urls: urls.slice(0, limit) },
  })

  return pages
}

module.exports = {
  run, readLinks, findReplyTargets, topForPlatform, FIT_PLATFORMS,
  topForDomains, normalizeDomain, classifyDomains, DOMAINS, AI_DOMAINS, onTopicDomains,
}
