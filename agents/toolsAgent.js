require('dotenv').config()
const axios = require('axios')
const fetchTools = require('../tools/fetchTools')
const { filterNew, markSeen } = require('../state/seenToolsStore')
const { writeLatest, readLatest } = require('../state/toolsStore')
const logger = require('../utils/logger')
const log = logger.source('tools-agent')

const TOP_N = 3   // tools to surface per run

// ── YouTube: search for a video about the tool ───────────────────────────────
async function findYouTubeVideo(toolName) {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) return null
  try {
    const res = await axios.get('https://www.googleapis.com/youtube/v3/search', {
      params: {
        key: apiKey,
        q: `${toolName} AI tool review tutorial`,
        part: 'snippet',
        type: 'video',
        order: 'relevance',
        maxResults: 1,
        publishedAfter: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(), // last 30 days
      },
      timeout: 8000,
    })
    const item = res.data.items?.[0]
    if (!item) return null
    return {
      title: item.snippet.title,
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
      channel: item.snippet.channelTitle,
      publishedAt: item.snippet.publishedAt,
    }
  } catch (err) {
    log.warn(`YouTube search failed for "${toolName}": ${err.message}`)
    return null
  }
}

// ── Twitter: build a search URL (no API call needed) ─────────────────────────
function buildTwitterSearchUrl(toolName) {
  const q = encodeURIComponent(`"${toolName}" AI tool`)
  return `https://twitter.com/search?q=${q}&f=live`
}

// ── Main run ─────────────────────────────────────────────────────────────────
async function run({ broadcast = null } = {}) {
  log.info('Tools run started')
  if (broadcast) broadcast({ type: 'tools_progress', data: { step: 'fetching' } })

  const raw = await fetchTools({ maxResults: 30 })
  log.info(`Fetched ${raw.length} tools total`)

  const newTools = filterNew(raw)
  log.info(`${newTools.length} new tools after dedup`)

  const top = newTools.slice(0, TOP_N)

  if (top.length === 0) {
    log.warn('No new tools found — all already seen or no sources returned results')
    const existing = readLatest()
    return existing || { tools: [], fetchedAt: new Date().toISOString() }
  }

  if (broadcast) broadcast({ type: 'tools_progress', data: { step: 'enriching' } })

  // Enrich each tool with YouTube video + Twitter search link
  const enriched = await Promise.all(top.map(async (tool) => {
    const [ytVideo] = await Promise.allSettled([findYouTubeVideo(tool.name)])
    return {
      ...tool,
      youtube: ytVideo.status === 'fulfilled' ? ytVideo.value : null,
      twitterSearchUrl: buildTwitterSearchUrl(tool.name),
    }
  }))

  markSeen(enriched.map(t => t.url))

  const output = {
    fetchedAt: new Date().toISOString(),
    tools: enriched,
  }

  writeLatest(output)
  log.info(`Tools run complete — ${enriched.length} tools saved`)
  if (broadcast) broadcast({ type: 'tools_complete', data: output })
  return output
}

module.exports = { run }
