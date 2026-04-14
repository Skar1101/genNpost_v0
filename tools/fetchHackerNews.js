const axios = require('axios')
const logger = require('../utils/logger').source('hackernews')

const QUERIES = ['artificial intelligence', 'LLM', 'machine learning', 'startup', 'OpenAI', 'Claude', 'Gemini', 'agent']

function first20Words(text) {
  return (text || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().split(' ').slice(0, 20).join(' ')
}

async function fetchHackerNews(config) {
  const maxResults = config.maxResults || 20
  const cutoff = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000)
  const results = []
  const seen = new Set()

  for (const query of QUERIES.slice(0, 4)) {
    const url = 'https://hn.algolia.com/api/v1/search'
    try {
      logger.info(`Querying: "${query}"`)
      const res = await axios.get(url, {
        params: { query, tags: 'story', hitsPerPage: 8, numericFilters: `points>10,created_at_i>${cutoff}` },
        timeout: 8000,
      })

      let added = 0
      for (const hit of res.data.hits) {
        if (seen.has(hit.objectID)) continue
        seen.add(hit.objectID)
        added++
        results.push({
          title: hit.title,
          url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
          snippet: first20Words(hit.story_text || hit.title),
          source: 'hackernews',
          publisher: 'Hacker News',
          publishedAt: new Date(hit.created_at_i * 1000).toISOString(),
          engagement: hit.points,
          comments: hit.num_comments,
          fetchedAt: new Date().toISOString(),
        })
      }
      logger.info(`Query "${query}": ${added} new items`)
    } catch (err) {
      logger.fetchError(url + '?query=' + query, err)
    }
  }

  const sorted = results.sort((a, b) => b.engagement - a.engagement).slice(0, maxResults)
  logger.result(sorted.length)
  return sorted
}

module.exports = fetchHackerNews
