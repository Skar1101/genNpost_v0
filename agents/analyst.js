require('dotenv').config()
const OpenAI = require('openai')
const memory = require('../state/memory')
const insightsStore = require('../state/insightsStore')
const activityStore = require('../state/activityStore')
const guard = require('../utils/llmGuard')
const G = require('../config/guardrails')
const logger = require('../utils/logger')
const log = logger.source('analyst')

let _openai = null
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

const APPROVED_STATES = ['queued', 'edited', 'posted', 'measured']
const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()

// ── ChitraG learner (deterministic) ───────────────────────────────────────────
// Win-rate per research source/topic, joined from the draft queue's provenance meta
// (recorded in Phase 5). Approved = reached queued/edited/posted/measured; rejected = rejected.
function computeSourceStats(account) {
  const acct = account || memory.accounts.getActiveAccount()
  const q = memory.readQueue(acct)
  const bySource = {}
  const byTopic = {}
  const bump = (map, key, state) => {
    if (!key) return
    const b = map[key] || (map[key] = { key, drafted: 0, approved: 0, rejected: 0 })
    b.drafted++
    if (APPROVED_STATES.includes(state)) b.approved++
    else if (state === 'rejected') b.rejected++
  }
  for (const d of q) {
    const m = d.meta || {}
    // write_from_list stores researchSources (array); batch stores researchSource (string).
    const sources = m.researchSource ? [m.researchSource] : (Array.isArray(m.researchSources) ? m.researchSources : [])
    sources.forEach(s => bump(bySource, s, d.state))
    bump(byTopic, m.section, d.state)
  }
  const finish = map => Object.values(map)
    .map(b => ({ ...b, decided: b.approved + b.rejected, winRate: (b.approved + b.rejected) ? +(b.approved / (b.approved + b.rejected)).toFixed(2) : null }))
    .sort((a, b) => (b.winRate ?? -1) - (a.winRate ?? -1))
  return { sources: finish(bySource).map(s => ({ source: s.key, ...s })), topics: finish(byTopic).map(t => ({ topic: t.key, ...t })) }
}

// ── Performance ingest (manual paste) ─────────────────────────────────────────
// Souvik pastes his week's top/bottom tweets + stats. LLM parses to structured rows; each is
// matched (best-effort) to a posted draft → 'measured', else appended straight to performance-log.
async function ingestPerformance({ account = null, pastedText = '', broadcast = null } = {}) {
  const acct = account || memory.accounts.getActiveAccount()
  const text = String(pastedText || '').trim()
  if (!text) return { count: 0, entries: [] }

  const prompt = `Parse the pasted X (Twitter) performance data into JSON. Each tweet the user pasted becomes one row.
Extract the tweet text and any numbers given (impressions/views, likes, replies, retweets, bookmarks). Missing numbers → null.

PASTED DATA:
${text.slice(0, 6000)}

Return ONLY a JSON array, no markdown:
[{ "text": "the tweet text", "impressions": 12000, "likes": 340, "replies": 12, "retweets": 8, "bookmarks": 20 }]`

  const res = await guard.runGuarded(() => getOpenAI().chat.completions.create(
    { model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.1, max_tokens: 1500 },
    { maxRetries: G.MAX_RETRIES, timeout: G.TIMEOUT_MS },
  ))
  let rows = []
  try {
    const raw = res.choices[0].message.content.trim()
    const m = raw.match(/\[[\s\S]*\]/)
    rows = JSON.parse(m ? m[0] : raw)
  } catch (err) { log.warn('ingest parse failed: ' + err.message); return { count: 0, entries: [] } }
  if (!Array.isArray(rows)) rows = []

  const queue = memory.readQueue(acct)
  let measured = 0, logged = 0
  for (const r of rows) {
    if (!r || !r.text) continue
    const perf = {
      impressions: r.impressions ?? null, likes: r.likes ?? null, replies: r.replies ?? null,
      retweets: r.retweets ?? null, bookmarks: r.bookmarks ?? null,
      engagementRate: r.impressions ? +(((r.likes || 0) + (r.replies || 0) + (r.retweets || 0) + (r.bookmarks || 0)) / r.impressions * 100).toFixed(2) : null,
    }
    // Best-effort match to a posted/approved draft by text prefix.
    const key = norm(r.text).slice(0, 50)
    const hit = key && queue.find(d => APPROVED_STATES.includes(d.state) && norm(d.editedText || d.text).includes(key))
    if (hit) { memory.transition(acct, hit.id, 'measured', { performance: { text: r.text, ...perf } }); measured++ }
    else { memory.performanceLog.append(acct, { text: r.text, ...perf }); logged++ }
  }
  if (broadcast) activityStore.recordAndBroadcast(broadcast, {
    agent: 'analyst', action: 'ingest', triggerLabel: '📊 Perf',
    summary: `${measured + logged} tweets ingested`, ref: { kind: 'insights' },
  })
  log.info(`Performance ingest — ${measured} matched to drafts, ${logged} logged`)
  return { count: measured + logged, measured, logged, entries: rows }
}

// ── Analyze (the learner) ─────────────────────────────────────────────────────
// Reads performance + approved/rejected + source win-rates → LLM extracts what's working and
// what to avoid, plus focus/downweight for ChitraG. Saves to insightsStore. Returns the insights.
async function analyze({ account = null, broadcast = null } = {}) {
  const acct = account || memory.accounts.getActiveAccount()
  const perf = memory.performanceLog.read(acct).slice(-40)
  const approved = memory.approvedDrafts.read(acct).slice(-30)
  const rejected = memory.rejectedDrafts.read(acct).slice(-30)
  const stats = computeSourceStats(acct)

  // Sources with a real sample and a poor win-rate → derank in research (deterministic floor).
  const weakSources = stats.sources.filter(s => s.decided >= 4 && s.winRate != null && s.winRate < 0.3).map(s => s.source)

  // Not enough signal yet → save stats + a note, skip the LLM.
  if (perf.length === 0 && approved.length < 3 && rejected.length < 3) {
    const insights = {
      summary: 'Not enough posted/approved data yet. Approve a few drafts and paste a week of tweet stats with /perf, then run /learned.',
      workingHooks: [], workingFormats: [], workingTopics: [], avoid: [],
      focus: [], downweight: weakSources, sourceStats: stats.sources, topicStats: stats.topics,
    }
    insightsStore.save(acct, insights)
    return insights
  }

  const fmtPerf = perf.map((p, i) => `${i + 1}. "${norm(p.text).slice(0, 100)}" — ${p.impressions ?? '?'} impr, ${p.likes ?? '?'} likes, ${p.replies ?? '?'} replies${p.engagementRate != null ? `, ${p.engagementRate}% eng` : ''}`).join('\n') || '(none pasted yet)'
  const fmtApproved = approved.map(a => `- [${a.format || 'short'}] ${norm(a.text).slice(0, 90)}`).join('\n') || '(none)'
  const fmtRejected = rejected.map(r => `- ${norm(r.text).slice(0, 80)}${r.reason ? ` (rejected: ${r.reason})` : ''}`).join('\n') || '(none)'
  const fmtStats = stats.sources.map(s => `${s.source}: ${s.approved}/${s.decided} approved (winRate ${s.winRate ?? 'n/a'})`).join(' · ') || '(no provenance yet)'

  const prompt = `You are the performance analyst for Souvik, a tech/AI creator on X. From his real data below, extract what is working so future drafts and research lean into it. Be concrete and specific — no generic advice.

POSTED TWEET PERFORMANCE (best first if sorted):
${fmtPerf}

RECENTLY APPROVED DRAFTS (he liked these):
${fmtApproved}

RECENTLY REJECTED DRAFTS (he rejected these):
${fmtRejected}

RESEARCH-SOURCE WIN RATES (which sources became approved posts):
${fmtStats}

Return ONLY JSON, no markdown:
{
  "summary": "2-3 sentences: what's landing and what isn't, in plain language",
  "workingHooks": ["specific hook styles/openers that performed"],
  "workingFormats": ["e.g. short, thread, longform — which land"],
  "workingTopics": ["specific topics/angles that resonate"],
  "avoid": ["patterns/topics/hooks to stop using — from rejections + low performers"],
  "focus": ["3-6 topic keywords to weight HIGHER in research"],
  "downweight": ["sources or topic keywords to rank LOWER in research"]
}`

  const res = await guard.runGuarded(() => getOpenAI().chat.completions.create(
    { model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.3, max_tokens: 900 },
    { maxRetries: G.MAX_RETRIES, timeout: G.TIMEOUT_MS },
  ))
  let parsed = {}
  try {
    const raw = res.choices[0].message.content.trim()
    const m = raw.match(/\{[\s\S]*\}/)
    parsed = JSON.parse(m ? m[0] : raw)
  } catch (err) { log.warn('analyze parse failed: ' + err.message) }

  const arr = v => Array.isArray(v) ? v.filter(Boolean).map(String) : []
  const downweight = [...new Set([...arr(parsed.downweight), ...weakSources])]
  const insights = {
    summary: parsed.summary || '(no summary)',
    workingHooks: arr(parsed.workingHooks), workingFormats: arr(parsed.workingFormats),
    workingTopics: arr(parsed.workingTopics), avoid: arr(parsed.avoid),
    focus: arr(parsed.focus), downweight,
    sourceStats: stats.sources, topicStats: stats.topics,
  }
  insightsStore.save(acct, insights)
  if (broadcast) activityStore.recordAndBroadcast(broadcast, {
    agent: 'analyst', action: 'analyze', triggerLabel: '📊 Learn',
    summary: `insights updated${insights.focus.length ? ' · focus: ' + insights.focus.slice(0, 3).join(', ') : ''}`,
    ref: { kind: 'insights' },
  })
  log.info(`Analyze complete — focus:[${insights.focus.join(', ')}] downweight:[${downweight.join(', ')}]`)
  return insights
}

// ── Consumers ─────────────────────────────────────────────────────────────────
function getInsights(account) { return insightsStore.get(account) }

// Learned research bias for ChitraG scheduled runs. Returns { focus, downweight } or null.
function learnedInstructions(account) {
  const ins = insightsStore.get(account)
  if (!ins) return null
  const focus = ins.focus || [], downweight = ins.downweight || []
  if (!focus.length && !downweight.length) return null
  return { focus, downweight }
}

// Text summary for the /learned command (web + Telegram).
function formatLearnedSummary(account) {
  const ins = insightsStore.get(account)
  if (!ins) return "No insights yet. Approve some drafts, then paste a week of tweet stats with `/perf <tweets>` and run `/learned`."
  const lines = [`*What's working* (updated ${String(ins.updatedAt || '').slice(0, 10)})`, '', ins.summary || '']
  const sec = (label, arr) => { if (arr && arr.length) lines.push(`\n*${label}:*\n${arr.map(x => '• ' + x).join('\n')}`) }
  sec('Hooks landing', ins.workingHooks)
  sec('Formats landing', ins.workingFormats)
  sec('Topics landing', ins.workingTopics)
  sec('Avoid', ins.avoid)
  if (ins.focus?.length) lines.push(`\n*Research focus →* ${ins.focus.join(', ')}`)
  if (ins.downweight?.length) lines.push(`*Research downweight →* ${ins.downweight.join(', ')}`)
  const s = (ins.sourceStats || []).filter(x => x.decided >= 2)
  if (s.length) lines.push(`\n*Source win-rates:* ${s.map(x => `${x.source} ${Math.round((x.winRate || 0) * 100)}%`).join(' · ')}`)
  return lines.join('\n')
}

module.exports = { computeSourceStats, ingestPerformance, analyze, getInsights, learnedInstructions, formatLearnedSummary }
