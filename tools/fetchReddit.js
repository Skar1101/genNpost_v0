const axios = require('axios')
const logger = require('../utils/logger').source('reddit')

function first20Words(text) {
  return (text || '').replace(/\s+/g, ' ').trim().split(' ').slice(0, 20).join(' ')
}

async function fetchReddit(config) {
  const subreddits = config.subreddits || ['artificial', 'MachineLearning', 'technology']
  const maxResults = config.maxResults || 25
  const searchQuery = config.searchQuery || null
  // Targeted searches extend to 7 days; default is 24h
  const cutoff = searchQuery
    ? Date.now() - 7 * 24 * 60 * 60 * 1000
    : Date.now() - 24 * 60 * 60 * 1000
  const results = []
  const seen = new Set()

  for (const sub of subreddits) {
    // When searchQuery is provided, use Reddit search endpoint instead of hot feed
    const url = searchQuery
      ? `https://www.reddit.com/r/${sub}/search.json`
      : `https://www.reddit.com/r/${sub}/hot.json`
    try {
      logger.info(searchQuery ? `Searching r/${sub} for "${searchQuery}"` : `Fetching r/${sub}`)
      const params = searchQuery
        ? { q: searchQuery, sort: 'top', t: 'week', restrict_sr: 1, limit: 10 }
        : { limit: 5 }
      const res = await axios.get(url, {
        params,
        headers: { 'User-Agent': 'TinySparrow/1.0 research-bot' },
        timeout: 8000,
      })

      const posts = res.data?.data?.children || []
      let added = 0
      for (const { data: post } of posts) {
        if (seen.has(post.id) || post.stickied || post.over_18) continue
        const pub = post.created_utc * 1000
        if (!searchQuery && pub < cutoff) { logger.debug(`r/${sub}: skipping "${post.title?.slice(0,40)}" — older than 24h`); continue }
        seen.add(post.id)
        added++
        results.push({
          title: post.title,
          url: post.url.startsWith('http') ? post.url : `https://reddit.com${post.permalink}`,
          snippet: first20Words(post.selftext || post.title),
          source: 'reddit',
          publisher: `r/${sub}`,
          publishedAt: new Date(pub).toISOString(),
          engagement: post.score,
          comments: post.num_comments,
          fetchedAt: new Date().toISOString(),
        })
      }
      logger.info(`r/${sub}: ${added} items`)
    } catch (err) {
      logger.fetchError(url, err)
    }
  }

  const sorted = results.sort((a, b) => b.engagement - a.engagement).slice(0, maxResults)
  logger.result(sorted.length)
  return sorted
}

module.exports = fetchReddit
