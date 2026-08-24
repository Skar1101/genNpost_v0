require('dotenv').config()
const OpenAI = require('openai')
const memory = require('../state/memory')
const insightsStore = require('../state/insightsStore')
const brandAuditStore = require('../state/brandAuditStore')
const focusStore = require('../state/focusStore')
const keywordsStore = require('../state/keywordsStore')
const strategyStore = require('../state/strategyStore')
const articlesStore = require('../state/articlesStore')
const articleLessonsStore = require('../state/articleLessonsStore')
const articleWriter = require('./articleWriter')
const activityStore = require('../state/activityStore')
const researchStore = require('../state/researchStore')
const llm = require('../utils/llm')
const guard = require('../utils/llmGuard')
const G = require('../config/guardrails')
const logger = require('../utils/logger')
const log = logger.source('analyst')
const costTracker = require('../utils/costTracker')
const fetchUserTweets = require('../tools/fetchUserTweets')
const { buildBrandAuditPrompt } = require('../prompts/brandAudit')

let _openai = null
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

const APPROVED_STATES = ['queued', 'edited', 'posted', 'measured']
const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()

// ── Raven learner (deterministic) ───────────────────────────────────────────
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

  const res = await llm.chat({ model: 'openai/gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.1, max_tokens: 1500 })
  costTracker.priceAndRecord({ agent: 'analyst', action: 'parse_tweets', modelId: 'openai/gpt-4o-mini', usage: res.usage })
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
// what to avoid, plus focus/downweight for Raven. Saves to insightsStore. Returns the insights.
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

  // Rejection REASONS as their own block. They were previously only inline per-draft, where a
  // repeated complaint reads as a detail rather than a pattern — the live data has "wrong topic"
  // as 7 of 19 rejections, which is the single clearest instruction the user has ever given the
  // system, and it was invisible.
  const reasonCounts = {}
  for (const r of memory.rejectedDrafts.read(acct)) {
    const key = String(r.reason || 'unspecified').trim().toLowerCase()
    reasonCounts[key] = (reasonCounts[key] || 0) + 1
  }
  const totalRejections = Object.values(reasonCounts).reduce((a, b) => a + b, 0)
  const fmtReasons = totalRejections
    ? Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])
        .map(([k, n]) => `${k}: ${n} (${Math.round((n / totalRejections) * 100)}%)`).join(' · ')
    : '(none yet)'

  // The pillars are a DECISION, not a hypothesis to test against noisy history. Without this, the
  // analyst reads a run of "wrong topic" rejections (which came from off-target AI items in the
  // pre-fix era) as "AI is the wrong subject" and emits `downweight: AI-related topics` — actively
  // suppressing the account's primary pillar. That happened on the very first real run.
  const strategy = strategyStore.get(acct)
  const pillarLines = strategy.pillars.filter(p => p.active)
    .map(p => `- ${p.label}: ${p.notes || p.domains.join(', ')}`).join('\n')

  const prompt = `You are the performance analyst for Souvik, positioned as: ${strategy.positioning}.

HIS CONTENT PILLARS ARE FIXED — these are a strategic decision, not something to re-litigate:
${pillarLines}

**Never recommend moving away from a pillar subject.** If rejections cluster around one, the problem
is the ANGLE, FRAMING or QUALITY of those posts — never the subject itself. Say "AI posts need
sharper, more practical angles", never "downweight AI". The focus/downweight fields steer research
WITHIN these pillars; they must not be used to abandon one.

From his real data below, extract what is working so future drafts and research lean into it. Be concrete and specific — no generic advice.

POSTED TWEET PERFORMANCE (best first if sorted):
${fmtPerf}

RECENTLY APPROVED DRAFTS (he liked these):
${fmtApproved}

RECENTLY REJECTED DRAFTS (he rejected these):
${fmtRejected}

WHY HE REJECTS — the reason distribution across ALL ${totalRejections} rejections:
${fmtReasons}

This is the most direct feedback he gives. Treat a dominant reason as an instruction, not a
statistic. If "wrong topic" leads, the research focus is off and the focus/downweight fields must
change to correct it. If "off-voice" leads, the voice rules are being missed. If "weak hook" leads,
the openers need work. Say so explicitly in the summary and act on it in the fields below.

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

  const res = await llm.chat({ model: 'openai/gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.3, max_tokens: 900 })
  costTracker.priceAndRecord({ agent: 'analyst', action: 'insights', modelId: 'openai/gpt-4o-mini', usage: res.usage })
  let parsed = {}
  try {
    const raw = res.choices[0].message.content.trim()
    const m = raw.match(/\{[\s\S]*\}/)
    parsed = JSON.parse(m ? m[0] : raw)
  } catch (err) { log.warn('analyze parse failed: ' + err.message) }

  const arr = v => Array.isArray(v) ? v.filter(Boolean).map(String) : []

  // Code-level guard behind the prompt rule above: strip any downweight term that would suppress an
  // active pillar. A prompt instruction is not a guarantee, and the cost of this one slipping
  // through is the account quietly abandoning its own positioning.
  const pillarTerms = strategy.pillars.filter(p => p.active).flatMap(p => [
    p.label.toLowerCase(), ...p.domains.map(d => d.toLowerCase()), ...p.keywords.map(k => k.toLowerCase()),
  ])
  const suppressesPillar = (term) => {
    const t = String(term).toLowerCase()
    return pillarTerms.some(pt => t.includes(pt) || pt.includes(t))
  }
  const rawDownweight = arr(parsed.downweight)
  const blocked = rawDownweight.filter(suppressesPillar)
  if (blocked.length) {
    log.warn(`Ignoring downweight terms that would suppress an active pillar: ${blocked.join(' | ')}`)
  }
  const downweight = [...new Set([...rawDownweight.filter(t => !suppressesPillar(t)), ...weakSources])]
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

// Learned research bias for Raven scheduled runs. Returns { focus, downweight } or null.
function learnedInstructions(account) {
  const ins = insightsStore.get(account)
  if (!ins) return null
  const focus = ins.focus || [], downweight = ins.downweight || []
  if (!focus.length && !downweight.length) return null
  return { focus, downweight }
}

// Standing human-angle focus so research reinforces the ~60% human / 40% tech mix instead of
// re-tilting to pure AI. Matches the buckets in raven's pool balancer + the ranking prompt.
const STANDING_HUMAN_FOCUS = [
  'discipline', 'habits', 'meditation', 'mindfulness', 'self-development',
  'AI in daily life', 'how AI is impacting humans',
]

// Default research focus from the creator profile: pillar labels (the area of interest) plus the
// standing human-angle terms above.
function profileFocus(account) {
  const p = memory.getProfile(account) || {}
  const pillars = (p.pillars || [])
    .map(pl => (typeof pl === 'string' ? pl : (pl.label || pl.name || pl.title)))
    .map(s => String(s || '').trim())
    .filter(Boolean)
  return [...new Set([...STANDING_HUMAN_FOCUS, ...pillars])]
}

// The effective Raven instructions for scheduled/automated runs:
//   focus = manual /focus override if set, else profile niche + learned focus
//   downweight = learned downweight (always)
// Keeps "all data in my area of interest, until I specify otherwise".
// `platform` (optional) folds that platform's own keyword priorities into the focus set — used when
// research is being run for one platform specifically. Omit it for the shared daily run, which
// feeds all three; per-platform ordering there comes from raven's platformFit scores instead.
function researchInstructions(account, platform = null) {
  const acct = account || memory.accounts.getActiveAccount()
  const override = focusStore.get(acct)
  const learned = insightsStore.get(acct) || {}
  const platformTerms = platform ? keywordsStore.terms(acct, platform) : []
  const focus = override && override.length
    ? [...new Set([...override, ...platformTerms])]
    : [...new Set([...profileFocus(acct), ...((learned.focus) || []), ...platformTerms])]
  const downweight = learned.downweight || []
  if (!focus.length && !downweight.length) return null
  const source = override && override.length ? 'override' : 'profile+learned'
  return { focus, downweight, source: platform ? `${source}+${platform}` : source }
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

// ── Real brand-gap audit — pulls Souvik's ACTUAL X timeline (via tools/fetchUserTweets.js, the RapidAPI
// user-timeline endpoint, real engagement numbers) and compares it against real high-performing niche
// posts already sitting in Raven's own research pool. No manual /perf paste needed for this one — it's
// the first fully-automated real-data path this app has ever had. ──────────────────────────────────────
async function auditBrand({ account = null, screenname = 'skar_connect', broadcast = null } = {}) {
  const acct = account || memory.accounts.getActiveAccount()

  const { tweets, user } = await fetchUserTweets({ screenname, count: 40 })
  const ownTweets = tweets.filter(t => t.text && !t.text.startsWith('RT @'))
  if (!ownTweets.length) throw new Error('No original tweets found — check the screenname or RAPIDAPI_KEY.')

  const sorted = [...ownTweets].sort((a, b) => b.engagement - a.engagement)
  const top = sorted.slice(0, 8)
  const bottom = sorted.slice(-8).reverse()
  const avgEngagement = ownTweets.reduce((s, t) => s + t.engagement, 0) / ownTweets.length
  const avgViews = ownTweets.reduce((s, t) => s + t.views, 0) / ownTweets.length

  const research = researchStore.readLatest()
  const niche = (research?.results || [])
    .filter(r => r.source === 'twitter')
    .sort((a, b) => (b.trendingScore || 0) - (a.trendingScore || 0))
    .slice(0, 8)

  log.info(`auditBrand: analyzing ${ownTweets.length} real tweets (avg engagement ${avgEngagement.toFixed(1)}) vs ${niche.length} niche comparisons`)

  const prompt = buildBrandAuditPrompt({ user, top, bottom, avgEngagement, avgViews, niche })
  const res = await llm.chat({ model: 'openai/gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.4, max_tokens: 2000 })
  costTracker.priceAndRecord({ agent: 'analyst', action: 'brand_audit', modelId: 'openai/gpt-4o-mini', usage: res.usage })

  const raw = res.choices[0].message.content.trim()
  const m = raw.match(/\{[\s\S]*\}/)
  let parsed
  try {
    parsed = JSON.parse(m ? m[0] : raw)
  } catch (e) {
    log.error('Brand audit JSON parse failed', e)
    throw new Error('Brand audit: LLM returned invalid JSON')
  }

  const audit = {
    screenname,
    profile: { followers: user?.sub_count ?? null, totalTweets: user?.statuses_count ?? null, following: user?.friends ?? null, createdAt: user?.created_at || null },
    ownStats: { avgEngagement: Math.round(avgEngagement * 100) / 100, avgViews: Math.round(avgViews * 10) / 10, sampleSize: ownTweets.length },
    topPerformers: top.map(t => ({ text: t.text, engagement: t.engagement, views: t.views, url: t.url })),
    bottomPerformers: bottom.map(t => ({ text: t.text, engagement: t.engagement, views: t.views, url: t.url })),
    nicheComparison: niche.map(n => ({ text: n.title, engagement: n.engagement, views: n.views, publisher: n.publisher })),
    summary: parsed.summary || '', gaps: parsed.gaps || [], recommendations: parsed.recommendations || [],
  }
  const saved = brandAuditStore.save(acct, audit)

  activityStore.recordAndBroadcast(broadcast, {
    agent: 'analyst', action: 'brand_audit', triggerLabel: '🖱 Brand audit',
    summary: `real audit — ${ownTweets.length} tweets analyzed, avg engagement ${avgEngagement.toFixed(1)}/post`,
    ref: { kind: 'koel' },
  })

  return saved
}

// Text summary for the /brand-audit command (web + Telegram) — mirrors formatLearnedSummary()'s style.
function formatBrandAuditSummary(account) {
  const audit = brandAuditStore.get(account)
  if (!audit) return "No brand audit yet. Run /brand-audit to pull your real X data and compare it against what's actually going viral in your niche."
  const lines = [
    `*Brand Audit* (updated ${String(audit.updatedAt || '').slice(0, 10)})`,
    '',
    `${audit.profile?.followers ?? '?'} followers · avg ${audit.ownStats?.avgEngagement ?? '?'} engagement / ${audit.ownStats?.avgViews ?? '?'} views per post (${audit.ownStats?.sampleSize ?? '?'} real posts analyzed)`,
    '',
    audit.summary || '',
  ]
  if (audit.gaps?.length) lines.push(`\n*Gaps:*\n${audit.gaps.map(g => '• ' + g).join('\n')}`)
  if (audit.recommendations?.length) lines.push(`\n*Recommendations:*\n${audit.recommendations.map(r => '• ' + r).join('\n')}`)
  lines.push('\nFull breakdown (top/bottom real tweets + niche comparison) is on the Analyst page.')
  return lines.join('\n')
}

// ── Article lessons ───────────────────────────────────────────────────────────
// Turn the corrections Souvik makes to articles into standing rules. Every "refine" instruction was
// already stored in the article version history and never read — 12 of them repeating the same three
// complaints (links, weak opening, weak headline) while the writer kept making the same mistakes.
async function learnArticleLessons({ account = null, broadcast = null } = {}) {
  const acct = account || memory.accounts.getActiveAccount()

  const instructions = []
  for (const meta of articlesStore.list(200)) {
    const rec = articlesStore.get(meta.id)
    for (const v of rec?.versions || []) {
      if (v.instruction && v.instruction.trim()) {
        instructions.push({ at: v.createdAt, text: v.instruction.replace(/\s+/g, ' ').trim() })
      }
    }
  }
  if (instructions.length < 2) {
    log.info(`learnArticleLessons: only ${instructions.length} correction(s) so far — nothing to distil yet`)
    return articleLessonsStore.get(acct)
  }

  // Newest last, so recent corrections read as the most current preference.
  instructions.sort((a, b) => new Date(a.at) - new Date(b.at))
  const list = instructions.map((i, n) => `${n + 1}. ${i.text.slice(0, 220)}`).join('\n')

  const prompt = `Below are the edits Souvik has asked for on his own articles, oldest first. Turn them into a SHORT list of standing rules his writer should follow from now on, so he stops having to ask twice.

HIS CORRECTIONS:
${list}

Rules for your output:
- Maximum 6 rules. Fewer is better.
- Only include something he asked for MORE THAN ONCE, or that is clearly a standing preference rather than a one-off for a specific article.
- Write each as a direct instruction to the writer ("Open with...", "Never..."), not a description of what he said.
- Be specific and testable. "Write better openings" is useless; "Open with a concrete moment or a specific number, never a definition or a general observation" is usable.
- Ignore anything tied to one article's subject matter.

Return ONLY a JSON array of strings.`

  try {
    const res = await llm.chat({ model: 'openai/gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.2, max_tokens: 700 })
    costTracker.priceAndRecord({ agent: 'analyst', action: 'article_lessons', modelId: 'openai/gpt-4o-mini', usage: res.usage })
    const raw = res.choices[0].message.content.trim()
    const m = raw.match(/\[[\s\S]*\]/)
    const rules = JSON.parse(m ? m[0] : raw)
    const saved = articleLessonsStore.save(acct, { rules, learnedFrom: instructions.length })
    articleWriter.reload()   // the system prompt is cached per platform; it must pick these up
    log.info(`learnArticleLessons: ${saved.rules.length} rule(s) from ${instructions.length} corrections`)
    if (broadcast) activityStore.recordAndBroadcast(broadcast, {
      agent: 'article', action: 'lessons', triggerLabel: '📝 Learned',
      summary: `${saved.rules.length} standing rule(s) from ${instructions.length} corrections`,
      ref: { kind: 'article' },
    })
    return saved
  } catch (err) {
    log.warn(`learnArticleLessons failed: ${err.message}`)
    return articleLessonsStore.get(acct)
  }
}

module.exports = { computeSourceStats, ingestPerformance, analyze, getInsights, learnedInstructions, researchInstructions, profileFocus, formatLearnedSummary, auditBrand, formatBrandAuditSummary, learnArticleLessons }
