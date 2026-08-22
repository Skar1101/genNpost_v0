const axios = require('axios')
const logger = require('../utils/logger').source('twitter')

// Pulls a SPECIFIC account's own tweet history (not a topic search) — same RapidAPI provider/key as
// tools/fetchTwitter.js (twitter-api45.p.rapidapi.com), same tweet-object normalization, so downstream
// code never has to handle two different shapes. Used for the brand audit (agents/analyst.js
// auditBrand()) to get Souvik's own real engagement numbers, which nothing else in this app has ever
// pulled before (the app's only performance path until now was the manual /perf paste).
function first20Words(text) {
  return (text || '').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim().split(' ').slice(0, 20).join(' ')
}

function normalizeTweet(tweet, screenname) {
  const engagement = (tweet.favorites || 0) + (tweet.retweets || 0) * 3 + (tweet.replies || 0)
  const cleanText = tweet.text.replace(/https?:\/\/\S+/g, '').trim()
  return {
    text: cleanText,
    snippet: first20Words(tweet.text),
    url: tweet.tweet_id ? `https://x.com/${screenname}/status/${tweet.tweet_id}` : null,
    tweetId: tweet.tweet_id || null,
    publishedAt: tweet.created_at ? new Date(tweet.created_at).toISOString() : null,
    favorites: tweet.favorites || 0,
    retweets: tweet.retweets || 0,
    replies: tweet.replies || 0,
    views: parseInt(tweet.views) || 0,
    engagement,
    fetchedAt: new Date().toISOString(),
  }
}

// Returns { tweets, user } — user carries real profile stats (sub_count = followers, statuses_count =
// total tweets, friends = following, created_at) straight from the API, a real replacement for
// profile.json's manually-guessed `baseline`. Paginates via next_cursor up to `count` tweets (the API
// returns ~20/page).
async function fetchUserTweets({ screenname, count = 40 } = {}) {
  const apiKey = process.env.RAPIDAPI_KEY
  if (!apiKey) {
    logger.warn('RAPIDAPI_KEY not set — skipping user timeline fetch')
    return { tweets: [], user: null }
  }
  if (!screenname) throw new Error('fetchUserTweets needs a screenname')

  logger.info(`Fetching @${screenname}'s own timeline (up to ${count})…`)
  const results = []
  let cursor = null
  let user = null

  while (results.length < count) {
    const params = { screenname }
    if (cursor) params.cursor = cursor
    const res = await axios.get('https://twitter-api45.p.rapidapi.com/timeline.php', {
      params,
      headers: {
        'x-rapidapi-host': 'twitter-api45.p.rapidapi.com',
        'x-rapidapi-key': apiKey,
      },
      timeout: 15000,
    })

    if (!user && res.data?.user) user = res.data.user
    const page = res.data?.timeline || []
    if (!page.length) break

    for (const tweet of page) {
      if (tweet.type && tweet.type !== 'tweet') continue // skip retweets/pinned markers if the API tags them
      if (!tweet.text) continue
      results.push(normalizeTweet(tweet, screenname))
    }

    cursor = res.data?.next_cursor || null
    if (!cursor) break
  }

  logger.result(results.length, 0)
  return { tweets: results.slice(0, count), user }
}

module.exports = fetchUserTweets
