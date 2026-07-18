const axios = require('axios')
const xml2js = require('xml2js')
const logger = require('../utils/logger').source('reddit')

// Reddit fetcher with two paths:
//   1. OAuth (REDDIT_CLIENT_ID + REDDIT_SECRET) → oauth.reddit.com JSON API. Reliable from any IP,
//      gives full metadata (score, comment count). Recommended.
//   2. Fallback (no creds) → public RSS feeds (www.reddit.com/r/<sub>/hot/.rss). Reddit now 403s the
//      old .json endpoints for everyone, but RSS still works with a browser UA. RSS gives title/url/
//      time but NO score, so we apply a hot-feed engagement baseline. Auto-upgrades to OAuth when set.
// OAuth setup: https://www.reddit.com/prefs/apps (type "script") → REDDIT_CLIENT_ID, REDDIT_SECRET
//      (optionally REDDIT_USERNAME + REDDIT_PASSWORD).
const OAUTH_UA = 'TinySparrow/1.0 (research bot)'
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const RSS_ENGAGEMENT_BASELINE = 200  // RSS has no score; hot-feed posts are already popular

// Sub → topic bucket for the 60/40 human/tech pool balancer in raven. Anything not listed = 'tech'.
const SUB_TOPIC = {
  getdisciplined: 'human', meditation: 'human', selfimprovement: 'human',
  productivity: 'human', stoicism: 'human', futurology: 'human',   // AI's impact on humans/society
  decidingtobebetter: 'human', mindfulness: 'human',
}
function topicOfSub(sub) {
  const key = String(sub || '').replace(/^r\//i, '').toLowerCase()
  return SUB_TOPIC[key] || 'tech'
}

let _token = null
let _tokenExp = 0

function first20Words(text) {
  return (text || '').replace(/\s+/g, ' ').trim().split(' ').slice(0, 20).join(' ')
}

async function getToken() {
  const id = process.env.REDDIT_CLIENT_ID
  const secret = process.env.REDDIT_SECRET
  if (!id || !secret) return null
  if (_token && Date.now() < _tokenExp - 60000) return _token

  const user = process.env.REDDIT_USERNAME
  const pass = process.env.REDDIT_PASSWORD
  const body = user && pass
    ? `grant_type=password&username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`
    : 'grant_type=client_credentials'

  const res = await axios.post('https://www.reddit.com/api/v1/access_token', body, {
    auth: { username: id, password: secret },
    headers: { 'User-Agent': OAUTH_UA, 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 8000,
  })
  _token = res.data?.access_token
  _tokenExp = Date.now() + (res.data?.expires_in || 3600) * 1000
  logger.info('Obtained OAuth token')
  return _token
}

// ── Path 1: OAuth JSON API ────────────────────────────────────────────────────
async function fetchViaOAuth(token, subreddits, maxResults, searchQuery, cutoff) {
  const headers = { 'User-Agent': OAUTH_UA, Authorization: `Bearer ${token}` }
  const results = []
  const seen = new Set()
  for (const sub of subreddits) {
    const url = `https://oauth.reddit.com/r/${sub}/${searchQuery ? 'search' : 'hot'}`
    try {
      const params = searchQuery
        ? { q: searchQuery, sort: 'top', t: 'week', restrict_sr: 1, limit: 10 }
        : { limit: 8 }
      const res = await axios.get(url, { params, headers, timeout: 8000 })
      let added = 0
      for (const { data: post } of res.data?.data?.children || []) {
        if (seen.has(post.id) || post.stickied || post.over_18) continue
        const pub = post.created_utc * 1000
        if (!searchQuery && pub < cutoff) continue
        seen.add(post.id); added++
        results.push({
          title: post.title,
          url: post.url && post.url.startsWith('http') ? post.url : `https://reddit.com${post.permalink}`,
          snippet: first20Words(post.selftext || post.title),
          source: 'reddit', topic: topicOfSub(sub), publisher: `r/${sub}`,
          publishedAt: new Date(pub).toISOString(),
          engagement: post.score, comments: post.num_comments,
          fetchedAt: new Date().toISOString(),
        })
      }
      logger.info(`r/${sub}: ${added} items`)
    } catch (err) { logger.fetchError(url, err) }
  }
  return results.sort((a, b) => b.engagement - a.engagement).slice(0, maxResults)
}

// ── Path 2: public RSS fallback ───────────────────────────────────────────────
// One combined request for ALL subreddits (Reddit rate-limits RSS to ~1 req/burst per IP, so a
// multireddit feed /r/a+b+c/hot/.rss is the only way to cover several subs without 429s).
async function fetchViaRss(subreddits, maxResults, searchQuery) {
  const url = searchQuery
    ? `https://www.reddit.com/search.rss?q=${encodeURIComponent(searchQuery)}&sort=top&t=week&limit=${maxResults}`
    : `https://www.reddit.com/r/${subreddits.join('+')}/hot/.rss?limit=${Math.max(25, maxResults)}`
  let res
  try {
    res = await axios.get(url, { headers: { 'User-Agent': BROWSER_UA }, timeout: 10000 })
  } catch (err) {
    if (err.response?.status === 429) {
      await new Promise(r => setTimeout(r, 3000))
      try { res = await axios.get(url, { headers: { 'User-Agent': BROWSER_UA }, timeout: 10000 }) }
      catch (e2) { logger.fetchError(url, e2); return [] }
    } else { logger.fetchError(url, err); return [] }
  }

  const results = []
  const seen = new Set()
  try {
    const cleaned = String(res.data).replace(/xmlns(:\w+)?="[^"]*"/g, '')
    const parsed = await xml2js.parseStringPromise(cleaned, { explicitArray: false })
    let entries = parsed?.feed?.entry || []
    entries = Array.isArray(entries) ? entries : [entries]
    for (const e of entries) {
      const link = e.link?.$?.href || e.link?.href || (typeof e.link === 'string' ? e.link : '')
      const id = e.id || link
      if (!link || seen.has(id)) continue
      seen.add(id)
      // Subreddit from the <category label="r/xxx"> tag, else from the link path
      const sub = e.category?.$?.label || (link.match(/\/r\/([A-Za-z0-9_]+)/)?.[1] ? `r/${link.match(/\/r\/([A-Za-z0-9_]+)/)[1]}` : 'reddit')
      const pub = e.published || e.updated
      const contentText = String((e.content && (e.content._ || e.content)) || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      results.push({
        title: String(e.title || '').trim(),
        url: link,
        snippet: first20Words(contentText || e.title),
        source: 'reddit', topic: topicOfSub(sub), publisher: sub,
        publishedAt: pub ? new Date(pub).toISOString() : new Date().toISOString(),
        engagement: RSS_ENGAGEMENT_BASELINE,
        fetchedAt: new Date().toISOString(),
      })
    }
    logger.info(`reddit (rss multireddit): ${results.length} items across ${subreddits.length} subs`)
  } catch (err) { logger.fetchError(url, err) }
  return results.slice(0, maxResults)
}

async function fetchReddit(config) {
  const subreddits = config.subreddits || ['getdisciplined', 'Meditation', 'selfimprovement', 'productivity', 'Stoicism', 'Futurology', 'artificial', 'LocalLLaMA', 'OpenAI']
  const maxResults = config.maxResults || 25
  const searchQuery = config.searchQuery || null
  const cutoff = searchQuery ? Date.now() - 7 * 24 * 3600 * 1000 : Date.now() - 24 * 3600 * 1000

  let token = null
  if (process.env.REDDIT_CLIENT_ID && process.env.REDDIT_SECRET) {
    try { token = await getToken() } catch (err) { logger.fetchError('reddit.com/api/v1/access_token', err) }
  }

  let results
  if (token) {
    logger.info('Using OAuth (oauth.reddit.com)')
    results = await fetchViaOAuth(token, subreddits, maxResults, searchQuery, cutoff)
  } else {
    logger.info('Using public RSS fallback (no OAuth creds — add REDDIT_CLIENT_ID/SECRET for full metadata)')
    results = await fetchViaRss(subreddits, maxResults, searchQuery)
  }
  logger.result(results.length)
  return results
}

module.exports = fetchReddit
