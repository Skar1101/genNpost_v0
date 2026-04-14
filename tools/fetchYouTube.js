const axios = require('axios')
const logger = require('../utils/logger').source('youtube')

function first20Words(text) {
  return (text || '').replace(/\s+/g, ' ').trim().split(' ').slice(0, 20).join(' ')
}

async function fetchYouTube(config) {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) {
    logger.warn('YOUTUBE_API_KEY not set — skipping YouTube fetch')
    return []
  }

  const channels = config.channels || []
  const results = []
  // Last 72 hours — gives enough window to catch recent uploads
  const publishedAfter = new Date(Date.now() - 72 * 3600 * 1000).toISOString()
  logger.info(`Fetching ${channels.length} channels (publishedAfter: ${publishedAfter.slice(0, 16)})`)

  for (const channel of channels) {
    try {
      const res = await axios.get('https://www.googleapis.com/youtube/v3/search', {
        params: {
          key: apiKey,
          channelId: channel.id,
          part: 'snippet',
          order: 'date',
          maxResults: 3,
          type: 'video',
          publishedAfter,
          // Prefer shorter videos (under 20min) — videoDuration: medium covers 4-20min, short = <4min
          // We fetch all and note duration via title heuristics
        },
        timeout: 8000,
      })

      const items = res.data.items || []
      logger.info(`${channel.name}: ${items.length} videos in last 72hr`)

      for (const item of items) {
        const snippet = item.snippet
        results.push({
          title: snippet.title,
          url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
          snippet: first20Words(snippet.description || snippet.title),
          source: 'youtube',
          publisher: channel.name,
          channelTier: channel.tier,
          publishedAt: snippet.publishedAt || new Date().toISOString(),
          // Tier 1 channels get higher base engagement score
          engagement: channel.tier === 1 ? 1500 : 800,
          fetchedAt: new Date().toISOString(),
        })
      }
    } catch (err) {
      logger.fetchError(`channelId=${channel.id} (${channel.name})`, err)
    }
  }

  // Sort: tier 1 first, then by recency
  const sorted = results.sort((a, b) => {
    if (a.channelTier !== b.channelTier) return a.channelTier - b.channelTier
    return new Date(b.publishedAt) - new Date(a.publishedAt)
  })

  // Return top 10
  const top10 = sorted.slice(0, 10)
  logger.result(top10.length, results.length - top10.length)
  return top10
}

module.exports = fetchYouTube
