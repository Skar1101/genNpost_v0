const axios = require('axios')
const logger = require('../utils/logger').source('reddit')

function first20Words(text) {
  return (text || '').replace(/\s+/g, ' ').trim().split(' ').slice(0, 20).join(' ')
}

async function fetchReddit(config) {
  const subreddits = config.subreddits || ['artificial', 'MachineLearning', 'technology']
  const maxResults = config.maxResults || 25
  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  const results = []
  const seen = new Set()

  for (const sub of subreddits) {
    const url = `https://www.reddit.com/r/${sub}/hot.json`
    try {
      logger.info(`Fetching r/${sub}`)
      const res = await axios.get(url, {
        params: { limit: 5 },
        headers: { 'User-Agent': 'TinySparrow/1.0 research-bot' },
        timeout: 8000,
      })

      const posts = res.data?.data?.children || []
      let added = 0
      for (const { data: post } of posts) {
        if (seen.has(post.id) || post.stickied || post.over_18) continue
        const pub = post.created_utc * 1000
        if (pub < cutoff) { logger.debug(`r/${sub}: skipping "${post.title?.slice(0,40)}" — older than 24h`); continue }
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
      logger.info(`r/${sub}: ${added} items (${posts.length - added} filtered)`)
    } catch (err) {
      logger.fetchError(url, err)
    }
  }

  const sorted = results.sort((a, b) => b.engagement - a.engagement).slice(0, maxResults)
  logger.result(sorted.length)
  return sorted
}

module.exports = fetchReddit
