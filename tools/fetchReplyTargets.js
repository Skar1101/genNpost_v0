const axios = require('axios')
const logger = require('../utils/logger').source('replies')
const { resolveQueries, coreIds } = require('./replyDomains.config')

// Quality bars for a post to count as a reply target
const MIN_IMPRESSIONS = 5000  // post must have >10K views
const MIN_I2C = 50             // impressions ÷ comments must be >50

// A small `min_faves` floor surfaces posts already gaining traction WITHOUT skewing the pool toward
// old posts: high floors (e.g. 200) force results 5h+ old, since accruing that many faves takes time.
// 20 is the empirical sweet spot — lets ~2–4h-old viral posts into the pool while the >10K-impression
// filter still does the real selecting.
const MIN_FAVES = 20

function firstWords(text, n = 16) {
  return (text || '').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim().split(' ').slice(0, n).join(' ')
}

// Fetch a broad pool of recent (Latest) domain posts with their impression/comment metrics.
// `queries` is the list of search strings to run (built from the selected domains by ChitraG).
// Returns the FULL unfiltered candidate pool — ChitraG applies the age/impression/I2C filters so
// the window-widening fallback can re-filter the same pool without extra API calls.
async function fetchReplyTargets(queries, onProgress) {
  const apiKey = process.env.RAPIDAPI_KEY
  if (!apiKey) {
    logger.warn('RAPIDAPI_KEY not set — skipping reply-target fetch')
    return []
  }

  // Fall back to the core domains if no queries were passed.
  const queryList = (queries && queries.length) ? queries : resolveQueries(coreIds())

  const candidates = []
  const seen = new Set()
  const now = Date.now()

  for (let i = 0; i < queryList.length; i++) {
    const baseQuery = queryList[i]
    if (typeof onProgress === 'function') onProgress(i + 1, queryList.length, candidates.length)
    const query = `${baseQuery} min_faves:${MIN_FAVES}`
    try {
      logger.info(`Querying X (Latest): "${baseQuery.slice(0, 50)}…"`)
      const res = await axios.get('https://twitter-api45.p.rapidapi.com/search.php', {
        params: { query, count: 20, type: 'Latest' },
        headers: {
          'x-rapidapi-host': 'twitter-api45.p.rapidapi.com',
          'x-rapidapi-key': apiKey,
        },
        timeout: 10000,
      })

      const tweets = res.data?.timeline || []
      logger.info(`Got ${tweets.length} tweets`)

      for (const tweet of tweets) {
        if (tweet.type !== 'tweet') continue
        if (seen.has(tweet.tweet_id)) continue
        seen.add(tweet.tweet_id)

        const createdMs = tweet.created_at ? new Date(tweet.created_at).getTime() : now
        const ageMinutes = Math.round((now - createdMs) / 60000)
        const impressions = parseInt(tweet.views) || 0
        const comments = parseInt(tweet.replies) || 0
        // Zero-comment + high-reach post is the BEST reply target, not a divide-by-zero.
        const i2c = comments > 0 ? impressions / comments : impressions

        candidates.push({
          headline: (tweet.text || '').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim().slice(0, 100),
          snippet: firstWords(tweet.text),
          url: `https://x.com/${tweet.screen_name}/status/${tweet.tweet_id}`,
          publisher: `@${tweet.screen_name}`,
          impressions,
          comments,
          i2c: Math.round(i2c),
          ageMinutes,
          createdAt: new Date(createdMs).toISOString(),
        })
      }
    } catch (err) {
      logger.fetchError('twitter-api45.p.rapidapi.com/search.php', err)
    }
  }

  logger.info(`Built candidate pool of ${candidates.length} unique posts`)
  return candidates
}

module.exports = fetchReplyTargets
module.exports.MIN_IMPRESSIONS = MIN_IMPRESSIONS
module.exports.MIN_I2C = MIN_I2C
