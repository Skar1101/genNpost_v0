const axios = require('axios')
const logger = require('../utils/logger').source('fetch-tweet')

// Pull the numeric tweet id out of an x.com/twitter.com URL (or accept a bare id).
function extractTweetId(input) {
  const s = String(input || '').trim()
  const m = s.match(/(?:status(?:es)?)\/(\d{5,25})/) || s.match(/^(\d{5,25})$/)
  return m ? m[1] : null
}

// Best-effort fetch of a single tweet's text + author by URL/id via RapidAPI twitter-api45.
// Returns { text, author, url, id } or null (caller then falls back to asking for pasted text).
async function fetchTweet(input) {
  const apiKey = process.env.RAPIDAPI_KEY
  const id = extractTweetId(input)
  if (!apiKey || !id) return null
  try {
    const res = await axios.get('https://twitter-api45.p.rapidapi.com/tweet.php', {
      params: { id },
      headers: { 'x-rapidapi-host': 'twitter-api45.p.rapidapi.com', 'x-rapidapi-key': apiKey },
      timeout: 10000,
    })
    const d = res.data || {}
    const text = (d.text || d.full_text || d.display_text || '').trim()
    const handle = d.screen_name || d.author?.screen_name || d.user?.screen_name || ''
    if (!text) return null
    return { text, author: handle ? '@' + handle : '', url: `https://x.com/${handle || 'i'}/status/${id}`, id }
  } catch (err) {
    logger.warn(`fetchTweet failed for id ${id}: ${err.message}`)
    return null
  }
}

module.exports = fetchTweet
module.exports.extractTweetId = extractTweetId
