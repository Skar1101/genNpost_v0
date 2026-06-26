require('dotenv').config()
const OpenAI = require('openai')
const chitrag = require('./chitrag')
const koel = require('./koel')
const quill = require('./quill')
const { readLatest, findLatestRunBySource } = require('../state/researchStore')
const { getHistory, appendMessage } = require('../state/conversationStore')
const { buildIntentPrompt } = require('../prompts/tittoReason')
const { matchDomain } = require('../tools/replyDomains.config')
const replyDomainsStore = require('../state/replyDomainsStore')

let _openai = null
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}


// Simple command pre-filter — no LLM needed
const SIMPLE_COMMANDS = {
  '/latest': handleLatest,
  '/status': handleStatus,
  '/research': handleTriggerResearch,
  '/start': handleStart,
  '/help': handleStart,
}

function handleStart() {
  return {
    reply: `Hey, I'm Titto — your Chief of Staff.\n\nHere's what I can do:\n• Run research on AI, tech & startup news (auto: 6am + 6pm)\n• Rank the best topics for your X posts\n• Take your feedback and adjust ChitraG's research\n\nCommands:\n/research — trigger a research run now\n/replies — find fresh X posts to reply to (≤4h, >10K impressions, high I2C)\n/replies investment, world cup — widen the search for one run\n/replies domains — manage which domains the reply search covers\n/latest — show today's research results\n/status — system status\n\nOr just talk to me normally.`,
    action: null,
  }
}

function handleLatest() {
  const data = readLatest()
  if (!data) {
    return { reply: "No research results yet. Run /research to kick things off.", action: null }
  }
  const top = (data.results || []).slice(0, 5)
  const lines = top.map((r, i) =>
    `${i + 1}. [${r.trendingScore || '?'}] ${r.title}\n   ${r.postPotential?.toUpperCase()} · ${r.source} · ${r.url}`
  ).join('\n\n')
  return {
    reply: `Last run: ${data.rankedAt?.slice(0, 16).replace('T', ' ')} UTC\n${data.results?.length} results total. Top 5:\n\n${lines}\n\nSay "show all" or check the dashboard for the full list.`,
    action: 'show_results',
    data,
  }
}

async function handleTriggerResearch(_, broadcast, telegramSend, filterSources = null) {
  const srcLabel = filterSources?.length ? ` (${filterSources.join(', ')} only)` : ''
  const reply = `On it. ChitraG is running research${srcLabel} now — I'll let you know when it's ready.`
  const label = filterSources?.length
    ? `📱 Telegram · ${filterSources.join(', ')}`
    : '📱 Telegram · /research'
  chitrag.run({ triggeredBy: 'user', triggerLabel: label, broadcast, filterSources }).then(async results => {
    if (results) await deliverResearch(results, telegramSend, broadcast)
  }).catch(err => {
    console.error('[Titto] Research run failed:', err.message)
    if (broadcast) broadcast({ type: 'chat_reply', data: { role: 'titto', content: 'Research run hit an error. Check the logs.' } })
    if (telegramSend) telegramSend('Research run hit an error. Check the logs.')
  })
  return { reply, action: 'research_started' }
}

// ── /replies — find fresh X posts worth replying to (deterministic, no LLM) ──

// Parse the text after "/replies" into known extra domains + free-text topics.
// Comma-separated so multi-word topics like "world cup" stay intact.
function parseReplyArgs(args) {
  const adhocDomains = new Set()
  const keywords = []
  for (const seg of (args || '').split(',').map(s => s.trim()).filter(Boolean)) {
    const id = matchDomain(seg)
    if (id) adhocDomains.add(id)
    else keywords.push(seg)
  }
  return { adhocDomains: [...adhocDomains], keywords }
}

// /replies domains  — manage the persistent domain setting
function handleReplyDomains(sub) {
  const show = () => {
    const lines = replyDomainsStore.listDomainsWithState()
      .map(d => `${d.enabled ? '✅' : '⬜'} ${d.id} — ${d.label}${d.core ? ' (core, always on)' : ''}`)
      .join('\n')
    return `Reply-search domains:\n${lines}\n\nManage: /replies domains add <id> · /replies domains remove <id>\nOr widen one run only: /replies investment, world cup`
  }
  const trimmed = (sub || '').trim()
  if (!trimmed || /^(list|show)$/i.test(trimmed)) return { reply: show(), action: null }

  const m = trimmed.match(/^(add|enable|on|remove|disable|off)\s+(.+)$/i)
  if (!m) return { reply: show(), action: null }
  const action = m[1].toLowerCase()
  const id = matchDomain(m[2].trim()) || m[2].trim().toLowerCase()
  const d = replyDomainsStore.listDomainsWithState().find(x => x.id === id)
  if (!d) return { reply: `Unknown domain "${m[2].trim()}". See the list:\n\n${show()}`, action: null }
  if (d.core) return { reply: `"${id}" is a core domain — always on, can't toggle.`, action: null }

  if (/^(add|enable|on)$/.test(action)) {
    replyDomainsStore.enableDomain(id)
    return { reply: `Enabled "${id}" — it'll be included in every /replies run now.\n\n${show()}`, action: null }
  }
  replyDomainsStore.disableDomain(id)
  return { reply: `Disabled "${id}".\n\n${show()}`, action: null }
}

async function handleReplyTargets(args, broadcast, telegramSend) {
  const { adhocDomains, keywords } = parseReplyArgs(args)
  // Ad-hoc domains widen this run on top of the persisted enabled set.
  const domains = [...new Set([...replyDomainsStore.getEnabledDomainIds(), ...adhocDomains])]
  const widenNote = (adhocDomains.length || keywords.length)
    ? ` (widening with ${[...adhocDomains, ...keywords].join(', ')})`
    : ''
  const reply = `On it — scanning X for reply targets (≤4h old, >10K impressions, high I2C)${widenNote}. I'll send the list shortly.`
  chitrag.findReplyTargets({ domains, extraKeywords: keywords, broadcast }).then(async result => {
    // Chat/Telegram get only the qualifying reply targets; the full pool is saved to the ChitraG list.
    const items = result.qualified || []
    if (!items.length) {
      const msg = `No posts met the bar this run (≤${result.windowUsedMin}m old · >10K impressions · I2C>50). All ${result.totalInList || 0} scanned posts are saved in ChitraG (Reply tag) for reference. Try widening: e.g. \`/replies investment, world cup\`, or \`/replies domains add investment\`.`
      if (broadcast) broadcast({ type: 'chat_reply', data: { role: 'titto', content: msg } })
      if (telegramSend) await telegramSend(msg)
      return
    }
    const lines = items.map((r, i) =>
      `${i + 1}. ${r.title}\n   ${r.impressions.toLocaleString()} imp · I2C ${r.i2c} · ${r.ageMinutes}m old · ${r.url}`
    ).join('\n\n')
    const header = `${items.length} reply targets (window ${result.windowUsedMin}m, sorted by I2C) · ${result.totalInList} scanned saved to ChitraG:`
    const full = `${header}\n\n${lines}`
    if (broadcast) broadcast({ type: 'chat_reply', data: { role: 'titto', content: full } })
    if (telegramSend) {
      // Telegram caps messages at 4096 — chunk on post boundaries
      let chunk = header
      for (const r of items) {
        const block = `\n\n${r.title}\n${r.impressions.toLocaleString()} imp · I2C ${r.i2c} · ${r.ageMinutes}m old\n${r.url}`
        if (chunk.length + block.length > 3800) { await telegramSend(chunk); chunk = '' }
        chunk += block
      }
      if (chunk.trim()) await telegramSend(chunk)
    }
  }).catch(err => {
    console.error('[Titto] Reply-target search failed:', err.message)
    if (broadcast) broadcast({ type: 'chat_reply', data: { role: 'titto', content: 'Reply-target search hit an error. Check the logs.' } })
    if (telegramSend) telegramSend('Reply-target search hit an error. Check the logs.')
  })
  return { reply, action: 'replies_started' }
}

// ── /quill command dispatcher ────────────────────────────────────────────────
const QUILL_HELP = `Quill commands:
/quill plan              — Find trending suggestions per pillar (opens Quill panel)
/quill <topic>           — Quick medium post
/quill thread <topic>    — 3–5 tweet thread
/quill long <topic>      — 400–900 char longform
/quill medium <topic>    — Punchy medium post (default)
/quill short <topic>     — Single short tweet
/quill article <topic>   — Structured X Article with cited stats (1500–3500 chars)
/quill help              — This list`

async function handleQuillCommand(args, broadcast) {
  const trimmed = (args || '').trim()

  // /quill help
  if (!trimmed || trimmed.toLowerCase() === 'help') {
    if (!trimmed) {
      // bare /quill → default to plan
    } else {
      return { reply: QUILL_HELP, action: null }
    }
  }

  // /quill plan  (or bare /quill)
  if (!trimmed || trimmed.toLowerCase() === 'plan') {
    try {
      const result = await quill.planSuggestions({ broadcast, triggerLabel: '💬 Titto /quill plan' })
      const pillarNames = result.suggestions.map(s => s.pillar).join(', ') || '(none)'
      return {
        reply: `Quill planned: ${result.totalSuggestions} suggestions across ${result.suggestions.length} pillars (${pillarNames}). Open the Quill panel to pick what to write.`,
        action: 'quill_plan_done',
      }
    } catch (err) {
      return { reply: `Quill plan failed: ${err.message}`, action: null }
    }
  }

  // /quill <format> <topic>  or  /quill <topic>
  const fmtMatch = trimmed.match(/^(thread|long|medium|short|article)\s+(.+)$/i)
  const format = fmtMatch ? fmtMatch[1].toLowerCase() : 'medium'
  const topic = fmtMatch ? fmtMatch[2].trim() : trimmed
  if (!topic) return { reply: 'Give me a topic. Try /quill help', action: null }

  try {
    const result = await quill.quickWrite({ topic, format, broadcast })
    return { reply: result.draft, action: 'quill_draft' }
  } catch (err) {
    return { reply: `Quill write failed: ${err.message}`, action: null }
  }
}

// Map common source names/aliases to source IDs
const SOURCE_NAME_MAP = {
  reddit: ['reddit'], github: ['github'], twitter: ['twitter'], x: ['twitter'],
  hackernews: ['hackernews'], hn: ['hackernews'], youtube: ['youtube'], yt: ['youtube'],
  arxiv: ['ai_research'], research: ['ai_research'], ai: ['ai_research'],
  news: ['news'],
}

function handleStatus() {
  const data = readLatest()
  const lastRun = data?.rankedAt ? data.rankedAt.slice(0, 16).replace('T', ' ') + ' UTC' : 'Never'
  const now = new Date()
  const next6am = new Date(now)
  next6am.setHours(6, 0, 0, 0)
  if (next6am <= now) next6am.setDate(next6am.getDate() + 1)
  const next6pm = new Date(now)
  next6pm.setHours(18, 0, 0, 0)
  if (next6pm <= now) next6pm.setDate(next6pm.getDate() + 1)
  const nextRun = next6am < next6pm ? next6am : next6pm

  return {
    reply: `System status:\n• Last research run: ${lastRun}\n• Results available: ${data?.results?.length || 0}\n• Next scheduled run: ${nextRun.toISOString().slice(0, 16).replace('T', ' ')} UTC\n• ChitraG: ready`,
    action: null,
  }
}

function formatResearchSummary(data) {
  if (!data || !data.results?.length) return "Research completed but no results were returned."
  const top = data.results[0]
  return `Research done. ${data.results.length} results ranked.\n\nTop pick: "${top.title}" [Score: ${top.trendingScore}] — ${top.postPotential} · ${top.source}\n\nCheck the ChitraG panel for the full list.`
}

async function handleMessage({ text, sessionId = 'default', broadcast = null, telegramSend = null }) {
  const input = text.trim()

  // Simple command routing — no LLM
  const commandFn = SIMPLE_COMMANDS[input.toLowerCase()]
  if (commandFn) {
    const result = await commandFn(input, broadcast, telegramSend)
    appendMessage(sessionId, 'user', input)
    appendMessage(sessionId, 'assistant', result.reply)
    return result
  }

  // /research <source> shorthand — no LLM, direct filtered run
  const researchMatch = input.match(/^\/research\s+(.+)/i)
  if (researchMatch) {
    const alias = researchMatch[1].trim().toLowerCase()
    const filterSources = SOURCE_NAME_MAP[alias] || null
    return handleTriggerResearch(null, broadcast, telegramSend, filterSources)
  }

  // Reply targets — /replies [extra domains] · /replies domains ... · natural phrasing. No LLM.
  const replyMatch = input.match(/^\/replies(?:\s+([\s\S]+))?$/i)
  if (replyMatch || /reply targets|posts? to reply|tweets? to reply/i.test(input)) {
    const args = (replyMatch && replyMatch[1] || '').trim()
    let result
    if (/^domains\b/i.test(args)) {
      result = handleReplyDomains(args.replace(/^domains\b\s*/i, ''))
    } else {
      result = await handleReplyTargets(args, broadcast, telegramSend)
    }
    appendMessage(sessionId, 'user', input)
    appendMessage(sessionId, 'assistant', result.reply)
    return result
  }

  // /quill — dispatch to Quill (plan, write, help). No LLM intent parsing.
  const quillMatch = input.match(/^\/quill(?:\s+(.+))?$/i)
  if (quillMatch) {
    const result = await handleQuillCommand((quillMatch[1] || '').trim(), broadcast)
    appendMessage(sessionId, 'user', input)
    appendMessage(sessionId, 'assistant', result.reply)
    return result
  }

  // Show all command — no LLM
  if (/show all|all results|full list/i.test(input)) {
    const result = handleLatest()
    const data = readLatest()
    if (data) {
      result.data = data
      result.reply = `All ${data.results?.length} results from the last run:`
    }
    return result
  }

  // Ambiguous — use LLM to parse intent
  const history = getHistory(sessionId)
  const prompt = buildIntentPrompt(input, history)

  const response = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
    max_tokens: 400,
  })

  let parsed
  try {
    const raw = response.choices[0].message.content.trim()
    const match = raw.match(/\{[\s\S]*\}/)
    parsed = JSON.parse(match ? match[0] : raw)
  } catch (_) {
    parsed = { intent: 'other', reply: "Got it. What else do you need?", instructionDelta: null }
  }

  appendMessage(sessionId, 'user', input)
  appendMessage(sessionId, 'assistant', parsed.reply)

  // ── redo_research ────────────────────────────────────────────────
  if (parsed.intent === 'redo_research') {
    const filterSources = parsed.filterSources?.length ? parsed.filterSources : null
    const topN = parsed.topN ? Math.min(parseInt(parsed.topN), 20) : null
    const showList = !!parsed.showList
    const searchQuery = parsed.searchQuery || null
    const srcLabel = filterSources ? ` (${filterSources.join(', ')} only)` : ''
    const nLabel = topN ? ` top ${topN}` : ''
    const confirmReply = parsed.reply
    const tLabel = filterSources
      ? `💬 Titto · ${filterSources.join(', ')} · "${input.slice(0, 40)}"`
      : `💬 Titto · "${input.slice(0, 50)}"`

    chitrag.run({
      triggeredBy: 'feedback-redo',
      triggerLabel: tLabel,
      instructions: parsed.instructionDelta || null,
      broadcast,
      filterSources,
      topN,
      searchQuery,
    }).then(async results => {
      if (!results) return
      // Always update the web UI
      if (broadcast) broadcast({ type: 'research_complete', data: results })
      // Show inline list in chat if requested
      if (showList || topN) {
        const items = results.results || []
        const lines = items.map((r, i) =>
          `${i + 1}. [${r.trendingScore}] ${r.title}\n   ${r.source?.toUpperCase()} · ${r.url}`
        ).join('\n\n')
        const listReply = `${nLabel ? `Top ${items.length}` : `${items.length} results`}${srcLabel}:\n\n${lines}`
        if (broadcast) broadcast({ type: 'chat_reply', data: { role: 'titto', content: listReply } })
        if (telegramSend) await telegramSend(listReply.slice(0, 4000))
      } else {
        await deliverResearch(results, telegramSend, broadcast)
      }
    }).catch(err => {
      console.error('[Titto] Re-research failed:', err.message)
      if (telegramSend) telegramSend('Re-research hit an error. Check the logs.')
    })
    return { reply: confirmReply, action: 'research_started' }
  }

  // ── show_latest ──────────────────────────────────────────────────
  if (parsed.intent === 'show_latest') {
    return handleLatest()
  }

  // ── write_post (specific topic Souvik named) ─────────────────────
  if (parsed.intent === 'write_post' && parsed.koelRequest) {
    const req = parsed.koelRequest
    const confirmReply = parsed.reply + `\n\nAsking Koel to write a ${req.format} post now…`
    koel.write({ ...req, broadcast }).then(result => {
      if (broadcast) broadcast({ type: 'koel_complete', data: result })
    }).catch(err => {
      console.error('[Titto] Koel write failed:', err.message)
      if (broadcast) broadcast({ type: 'chat_reply', data: { role: 'titto', content: 'Koel hit an error writing that post. Try again.' } })
    })
    return { reply: confirmReply, action: 'koel_writing' }
  }

  // ── write_from_list (write posts based on last research results) ─
  if (parsed.intent === 'write_from_list') {
    const req = parsed.koelRequest || {}
    const fmt = req.format || 'short'
    const writingMode = req.writingMode || 'per_item'
    const count = Math.min(parseInt(req.count) || 3, writingMode === 'combined' ? 1 : 8)
    const filterSrc = req.filterSource || null

    // Option A: if a source is named, find the most recent run explicitly targeted at that source
    const sourceRun = filterSrc ? findLatestRunBySource(filterSrc) : null
    const run = sourceRun || readLatest()

    if (!run?.results?.length) {
      return { reply: "No research results yet — run /research first, then ask me to write posts.", action: null }
    }

    const runLabel = sourceRun
      ? (sourceRun.triggerLabel || filterSrc)
      : 'the latest run'

    let items = run.results
    if (filterSrc) items = items.filter(r => r.source === filterSrc)
    // For per_item: slice to count. For combined/multi_version: take all available (up to 8)
    const itemLimit = writingMode === 'per_item' ? count : Math.min(items.length, 8)
    items = items.slice(0, itemLimit)

    if (!items.length) {
      return { reply: `No ${filterSrc || ''} results found in ${runLabel}. Try running a search first.`, action: null }
    }

    // Items list is the primary input — titles, URLs, context
    const listInput = items.map((r, i) =>
      `${i + 1}. ${r.title}\nURL: ${r.url}\n${r.why ? 'Why: ' + r.why : ''}${r.snippet ? '\nContext: ' + r.snippet.slice(0, 200) : ''}`
    ).join('\n\n')

    // Build writing instruction based on mode
    const styleNote = req.extraInstructions ? `\nStyle/tone note: ${req.extraInstructions}` : ''
    let writingInstruction
    if (writingMode === 'combined') {
      writingInstruction = `Write ONE ${fmt} post that covers ALL the items below together. Include each source URL inline or at the end as a reference. Write in Souvik's voice — substantive, not a generic list dump. Make it feel like a curated recommendation or insight, not a directory.${styleNote}`
    } else if (writingMode === 'multi_version') {
      writingInstruction = `Write ${count} different versions/drafts of ONE ${fmt} post about the items below. Each version should have a different hook or angle. Use all items as context/inspiration — don't have to mention every one. Separate each with --- DRAFT N ---.${styleNote}`
    } else {
      // per_item
      writingInstruction = `Write ${count} separate ${fmt} posts, one per item below. Each post covers only its item. Follow Souvik's voice and your knowledge base — substantive, not a generic summary. Include the source URL at the end of each as "Source: [URL]". Separate each with --- DRAFT N ---.${styleNote}`
    }

    const modeLabel = writingMode === 'combined' ? '1 combined post' : writingMode === 'multi_version' ? `${count} versions` : `${count} posts (one per item)`
    const confirmReply = parsed.reply + `\n\nAsking Koel to write ${modeLabel} from ${runLabel}…`
    koel.write({
      format: fmt,
      input: listInput,
      inputType: 'freetext',
      count: writingMode === 'combined' ? 1 : count,
      extraInstructions: writingInstruction,
      broadcast,
    }).then(result => {
      if (broadcast) broadcast({ type: 'koel_complete', data: result })
    }).catch(err => {
      console.error('[Titto] Koel write_from_list failed:', err.message)
      if (broadcast) broadcast({ type: 'chat_reply', data: { role: 'titto', content: 'Koel hit an error. Try again.' } })
    })
    return { reply: confirmReply, action: 'koel_writing' }
  }

  return { reply: parsed.reply, action: parsed.intent }
}

async function deliverResearch(results, telegramFn = null, broadcast = null) {
  const summary = formatResearchSummary(results)
  if (broadcast) {
    broadcast({ type: 'research_complete', data: results })
    broadcast({ type: 'chat_reply', data: { role: 'titto', content: summary } })
  }
  if (telegramFn) {
    await telegramFn(summary)
    // Send top 5 as individual messages
    const top5 = (results.results || []).slice(0, 5)
    for (const r of top5) {
      await telegramFn(`*${r.rank}. [${r.trendingScore}] ${r.title}*\n${r.summary}\n_${r.postPotential?.toUpperCase()} · ${r.source}_\n${r.url}`)
    }
  }
}

module.exports = { handleMessage, deliverResearch }
