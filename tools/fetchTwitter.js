const axios = require('axios')
const logger = require('../utils/logger').source('twitter')

// Top viral queries, weighted ~60% HUMAN (discipline, meditation, self-dev, AI-in-daily-life,
// AI's impact on humans) / ~40% TECH (trending AI). Each query carries a `topic` used by the
// 60/40 pool balancer in chitrag. Using 'Top' type to get high-engagement posts (not just latest).
const QUERIES = [
  // HUMAN — discipline, meditation, self-development, AI for people
  { q: '(discipline OR "self discipline" OR habits OR "deep work" OR consistency) lang:en', topic: 'human' },
  { q: '(meditation OR mindfulness OR stoicism OR "mental clarity" OR calm) lang:en', topic: 'human' },
  { q: '("self improvement" OR "personal growth" OR "self development" OR "become better") lang:en', topic: 'human' },
  { q: '(AI OR ChatGPT OR Claude) ("daily life" OR "personal life" OR "use it to" OR "changed how i") lang:en', topic: 'human' },
  { q: '(AI) ("impact on" OR "future of work" OR society OR humanity OR "how we live" OR jobs) lang:en', topic: 'human' },
  // TECH — trending AI news + flagship models
  { q: '(AI OR LLM OR "artificial intelligence") (launch OR release OR breakthrough) lang:en', topic: 'tech' },
  { q: '(ChatGPT OR Claude OR Gemini OR GPT OR "AI agent") lang:en', topic: 'tech' },
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

  // Targeted query: search exactly what user asked (topic 'tech' — a targeted search bypasses the
  // 60/40 balancer anyway); otherwise use the default balanced query set.
  const queries = searchQuery ? [{ q: `${searchQuery} lang:en`, topic: 'tech' }] : QUERIES

  for (const { q: query, topic } of queries) {
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
          topic,   // 'human' vs 'tech' — feeds the 60/40 pool balancer
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

  const byEng = arr => arr.sort((a, b) => b.engagement - a.engagement)

  // Targeted search → straight top-by-engagement. Default → keep ~60% human / 40% tech within
  // twitter's own budget, so viral AI tweets don't bury the human-angle ones before chitrag ranks.
  let top
  if (searchQuery) {
    top = byEng(results).slice(0, maxResults)
  } else {
    const human = byEng(results.filter(r => r.topic === 'human')).slice(0, Math.ceil(maxResults * 0.6))
    const tech = byEng(results.filter(r => r.topic !== 'human')).slice(0, Math.floor(maxResults * 0.4))
    top = [...human, ...tech]
  }

  logger.result(top.length, results.length - top.length)
  return top
}

module.exports = fetchTwitter
