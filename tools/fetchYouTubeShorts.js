const axios = require('axios')
const strategyStore = require('../state/strategyStore')
const logger = require('../utils/logger').source('shorts')

// Trending YouTube Shorts in the account's own pillars — mined for POST IDEAS, not for reposting.
//
// The existing fetchYouTube.js only polls a fixed channel list, so it structurally cannot surface a
// Short from someone you don't already follow — and Shorts are exactly where the fast-moving
// AI/self-help/wellness ideas show up before they reach X. This searches all of YouTube instead.
//
// Two calls per query, deliberately:
//   1. search.list  — finds candidates (videoDuration=short, ordered by viewCount)
//   2. videos.list  — search results DON'T include statistics, so without this every Short would
//                     have an unknown view count and rank arbitrarily against everything else.
//
// Quota: search costs 100 units, videos.list costs 1. A few pillar queries a day is ~300 of the
// 10,000 daily units.

const SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search'
const VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos'
const AI_DOMAINS = ['ai-tools', 'ai-research', 'ai-impact']

// A Short has to be recognisably ABOUT AI to survive. Search matches on description and channel
// too, so "new AI tools" happily returns a caulking-gun review titled "Tools for Fools" — the query
// matched "tools", not "AI". Requiring an AI marker in the title is what stops that.
const AI_MARKERS = /\b(ai|a\.i\.|artificial intelligence|llm|gpt|chatgpt|claude|gemini|copilot|openai|anthropic|agent|agentic|automation|prompt|machine learning|neural)\b/i

function first20Words(text) {
  return (text || '').replace(/\s+/g, ' ').trim().split(' ').slice(0, 20).join(' ')
}

// YouTube returns titles HTML-escaped ("Brain Regeneration &amp; Mental Clarity"), which would
// otherwise be carried verbatim into a draft.
function decodeEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
}

// Shorts search is a junk magnet: a first pass ordered by view count returned AI-baby-video slop,
// a devotional clip, Free Fire gameplay and JCB-repair spam — all with millions of views, because
// mass-market virality has nothing to do with expertise. Raven's domain filter would catch most of
// it downstream, but there's no reason to spend quota and pool slots carrying it that far.
const SPAM_PATTERNS = [
  /#\w+[\s#]*#\w+[\s#]*#\w+/,        // three or more hashtags — reliably engagement-farming
  /\b(freefire|pubg|bgmi|minecraft|gta|roblox)\b/i,
  /\b(viral|trending|shorts?feed|viralshorts)\b.*#/i,
  /\b(jagannath|bhakti|mantra|astrology|horoscope|vastu)\b/i,
  /\b(prank|funny|comedy|reaction|challenge)\b/i,
]

function looksLikeSpam(title = '') {
  return SPAM_PATTERNS.some(re => re.test(title))
}

// Pillar domains → the topic bucket raven's 60/40 supply balancer uses.
function topicForDomains(domains = []) {
  return domains.some(d => d === 'self-help' || d === 'wellness') ? 'human' : 'tech'
}

async function fetchYouTubeShorts(config = {}) {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) {
    logger.warn('YOUTUBE_API_KEY not set — skipping Shorts fetch')
    return []
  }

  // Shorts are mined for AI ONLY — AI tools, AI/model updates, practical AI workflow, and AI
  // experts on the tech industry. Nothing else.
  //
  // This is deliberate, not an oversight: a live pass across all pillars returned devotional clips
  // for the wellness queries and guru/viral-bait for self-help. Short-form is where AI moves fastest
  // and where its useful material lives; for the other pillars it is a slop magnet. Toggle per
  // pillar in Settings → Content strategy (the `shorts` flag).
  const pillars = strategyStore.activePillars(null).filter(p => p.shorts)
  const queries = []
  if (config.searchQuery) {
    queries.push({ q: config.searchQuery, domains: [], label: 'adhoc' })
  } else {
    for (const p of pillars) {
      // Belt and braces: even with the flag on, only AI-domain pillars contribute queries, so a
      // mis-set flag can't quietly reintroduce non-AI Shorts.
      if (!p.domains.some(d => AI_DOMAINS.includes(d))) {
        logger.warn(`Pillar "${p.label}" has shorts:true but no AI domain — skipping (Shorts are AI-only)`)
        continue
      }
      for (const q of (p.sources?.youtubeQueries || []).slice(0, 4)) {
        queries.push({ q, domains: p.domains, label: p.label })
      }
    }
  }
  if (!queries.length) {
    logger.info('No AI pillar with shorts enabled — skipping Shorts fetch')
    return []
  }

  const perQuery = config.perQuery || 6
  const days = config.days || 7
  const publishedAfter = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString()

  const found = []
  for (const { q, domains, label } of queries) {
    try {
      const res = await axios.get(SEARCH_URL, {
        params: {
          key: apiKey, q, part: 'snippet', type: 'video',
          videoDuration: 'short',        // <4 minutes — the Shorts-shaped bucket
          // relevance, NOT viewCount: ordering a broad query by views returns whatever is
          // mass-market viral, which correlates with slop rather than expertise. View counts are
          // still fetched below and used for RANKING — they just don't decide what gets considered.
          order: 'relevance',
          maxResults: perQuery,
          publishedAfter,
          relevanceLanguage: 'en',
        },
        timeout: 10000,
      })
      const items = res.data.items || []
      let spam = 0
      let notAI = 0
      logger.info(`"${q}" (${label}): ${items.length} shorts`)
      for (const it of items) {
        if (!it.id?.videoId) continue
        const cleanTitle = decodeEntities(it.snippet?.title)
        if (looksLikeSpam(cleanTitle)) { spam++; continue }
        if (!AI_MARKERS.test(cleanTitle)) { notAI++; continue }
        found.push({
          videoId: it.id.videoId,
          title: cleanTitle,
          description: decodeEntities(it.snippet.description),
          channel: it.snippet.channelTitle,
          publishedAt: it.snippet.publishedAt,
          domains, pillarLabel: label,
        })
      }
      if (spam || notAI) logger.info(`  ↳ dropped ${spam} spam, ${notAI} not-about-AI before ranking`)
    } catch (err) {
      logger.fetchError(`shorts q="${q}"`, err)
    }
  }
  if (!found.length) return []

  // Second call: real view counts. Batched 50 at a time (the API's id limit), 1 quota unit each.
  const stats = {}
  const ids = [...new Set(found.map(f => f.videoId))]
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50)
    try {
      const res = await axios.get(VIDEOS_URL, {
        params: { key: apiKey, id: chunk.join(','), part: 'statistics' },
        timeout: 10000,
      })
      for (const v of res.data.items || []) {
        stats[v.id] = {
          views: parseInt(v.statistics?.viewCount) || 0,
          likes: parseInt(v.statistics?.likeCount) || 0,
          comments: parseInt(v.statistics?.commentCount) || 0,
        }
      }
    } catch (err) {
      logger.fetchError('shorts statistics', err)
    }
  }

  const results = found.map(f => {
    const s = stats[f.videoId] || {}
    return {
      title: f.title,
      url: `https://www.youtube.com/shorts/${f.videoId}`,
      snippet: first20Words(f.description || f.title),
      source: 'youtube-shorts',
      publisher: f.channel,
      topic: topicForDomains(f.domains),
      // Hint only — the ranker still classifies independently, but this stops a Short from being
      // scored blind when the title is terse.
      domainHint: f.domains[0] || null,
      views: s.views || 0,
      engagement: s.views || 0,     // ranks honestly against other sources' engagement numbers
      publishedAt: f.publishedAt,
      fetchedAt: new Date().toISOString(),
    }
  })

  // Highest view count first, deduped by video.
  const seen = new Set()
  const sorted = results
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .filter(r => (seen.has(r.url) ? false : (seen.add(r.url), true)))

  const top = sorted.slice(0, config.maxResults || 12)
  logger.result(top.length, results.length - top.length)
  return top
}

module.exports = fetchYouTubeShorts
