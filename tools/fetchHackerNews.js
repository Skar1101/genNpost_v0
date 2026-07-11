const axios = require('axios')
const logger = require('../utils/logger').source('hackernews')

const QUERIES = ['artificial intelligence', 'LLM', 'machine learning', 'startup', 'OpenAI', 'Claude', 'Gemini', 'agent']

function first20Words(text) {
  return (text || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().split(' ').slice(0, 20).join(' ')
}

async function fetchHackerNews(config) {
  const maxResults = config.maxResults || 20
  const searchQuery = config.searchQuery || null
  const cutoff = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000)
  const results = []
  const seen = new Set()

  // When user specifies a topic, search that directly; otherwise use default AI/tech queries
  const queries = searchQuery ? [searchQuery] : QUERIES.slice(0, 4)
  // For targeted queries, extend time window to 7 days so more results are available
  const effectiveCutoff = searchQuery ? Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000) : cutoff

  for (const query of queries) {
    const url = 'https://hn.algolia.com/api/v1/search'
    try {
      logger.info(`Querying: "${query}"`)
      const res = await axios.get(url, {
        // NOTE: HN Algolia no longer allows `points` in numericFilters (returns 400 —
        // "invalid numeric attribute(points)"). Keep the server-side recency filter only and
        // filter by points client-side below.
        params: { query, tags: 'story', hitsPerPage: searchQuery ? 20 : 15, numericFilters: `created_at_i>${effectiveCutoff}` },
        timeout: 8000,
      })

      let added = 0
      for (const hit of res.data.hits) {
        if (seen.has(hit.objectID)) continue
        if ((hit.points || 0) < 5) continue   // client-side quality floor (was server-side points>5)
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
