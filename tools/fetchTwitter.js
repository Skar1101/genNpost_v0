const axios = require('axios')
const logger = require('../utils/logger').source('twitter')

// Top viral queries in AI/tech/startup domain
// Using 'Top' type to get high-engagement posts (not just latest)
// 5 queries × 5 tweets = 25 candidates → deduped → top 20
const QUERIES = [
  '(AI OR LLM OR "artificial intelligence") (launch OR release OR breakthrough) lang:en',
  '(ChatGPT OR Claude OR Gemini OR GPT) lang:en',
  '(AI agent OR AI tool OR automation) lang:en',
  '(startup OR "venture capital" OR funding) AI lang:en',
  '(GitHub OR "open source") AI model lang:en',
  // Self-help, productivity, mindfulness — top viral posts
  '(productivity OR "deep work" OR "morning routine" OR "time management") tip lang:en',
  '(mindfulness OR meditation OR stoicism OR "mental clarity" OR "calming") lang:en',
]

function first20Words(text) {
  return (text || '').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim().split(' ').slice(0, 20).join(' ')
}

async function fetchTwitter(config) {
  const apiKey = process.env.RAPIDAPI_KEY
  if (!apiKey) {
    logger.warn('RAPIDAPI_KEY not set — skipping Twitter fetch')
    return []
  }

  const maxResults = config.maxResults || 20
  const searchQuery = config.searchQuery || null
  // Use 7-day window for Top posts — viral content from last week is still highly relevant
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
  const results = []
  const seen = new Set()

  // Targeted query: search exactly what user asked; otherwise use default AI/tech queries
  const queries = searchQuery ? [`${searchQuery} lang:en`] : QUERIES

  for (const query of queries) {
    try {
      logger.info(`Querying X (Top): "${query.slice(0, 60)}…"`)
      const res = await axios.get('https://twitter-api45.p.rapidapi.com/search.php', {
        params: { query, count: searchQuery ? 15 : 5, type: 'Top' },
        headers: {
          'x-rapidapi-host': 'twitter-api45.p.rapidapi.com',
          'x-rapidapi-key': apiKey,
        },
        timeout: 10000,
      })

      const tweets = res.data?.timeline || []
      logger.info(`Got ${tweets.length} tweets`)
      let added = 0

      for (const tweet of tweets) {
        if (tweet.type !== 'tweet') continue
        if (seen.has(tweet.tweet_id)) continue

        const pub = tweet.created_at ? new Date(tweet.created_at).getTime() : Date.now()
        if (pub < cutoff) continue

        seen.add(tweet.tweet_id)
        added++

        const engagement = (tweet.favorites || 0) + (tweet.retweets || 0) * 3 + (tweet.replies || 0)
        const cleanText = tweet.text.replace(/https?:\/\/\S+/g, '').trim()

        results.push({
          title: cleanText.slice(0, 100),
          url: `https://x.com/${tweet.screen_name}/status/${tweet.tweet_id}`,
          snippet: first20Words(tweet.text),
          source: 'twitter',
          publisher: `@${tweet.screen_name}`,
          publishedAt: new Date(tweet.created_at || Date.now()).toISOString(),
          engagement,
          views: parseInt(tweet.views) || 0,
          fetchedAt: new Date().toISOString(),
        })
      }
      logger.info(`Added ${added} new items from this query`)
    } catch (err) {
      logger.fetchError('twitter-api45.p.rapidapi.com/search.php', err)
    }
  }

  // Sort by engagement (virality), take top 20
  const top20 = results
    .sort((a, b) => b.engagement - a.engagement)
    .slice(0, maxResults)

  logger.result(top20.length, results.length - top20.length)
  return top20
}

module.exports = fetchTwitter
