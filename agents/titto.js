require('dotenv').config()
const OpenAI = require('openai')
const chitrag = require('./chitrag')
const koel = require('./koel')
const { readLatest } = require('../state/researchStore')
const { getHistory, appendMessage } = require('../state/conversationStore')
const { buildIntentPrompt } = require('../prompts/tittoReason')

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
    reply: `Hey, I'm Titto — your Chief of Staff.\n\nHere's what I can do:\n• Run research on AI, tech & startup news (auto: 6am + 6pm)\n• Rank the best topics for your X posts\n• Take your feedback and adjust ChitraG's research\n\nCommands:\n/research — trigger a research run now\n/latest — show today's research results\n/status — system status\n\nOr just talk to me normally.`,
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

  // Handle intent
  if (parsed.intent === 'redo_research') {
    const filterSources = parsed.filterSources?.length ? parsed.filterSources : null
    const srcLabel = filterSources ? ` (${filterSources.join(', ')} only)` : ''
    const confirmReply = parsed.reply + `\n\nStarting re-research${srcLabel}...`
    const tLabel = filterSources
      ? `💬 Titto · ${filterSources.join(', ')} · "${input.slice(0, 40)}"`
      : `💬 Titto · "${input.slice(0, 50)}"`
    chitrag.run({ triggeredBy: 'feedback-redo', triggerLabel: tLabel, instructions: parsed.instructionDelta || null, broadcast, filterSources }).then(async results => {
      if (results) await deliverResearch(results, telegramSend, broadcast)
    }).catch(err => {
      console.error('[Titto] Re-research failed:', err.message)
      if (telegramSend) telegramSend('Re-research hit an error. Check the logs.')
    })
    return { reply: confirmReply, action: 'research_started' }
  }

  if (parsed.intent === 'show_latest') {
    return handleLatest()
  }

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
