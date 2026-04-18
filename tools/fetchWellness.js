const axios = require('axios')
const xml2js = require('xml2js')
const logger = require('../utils/logger').source('wellness')

const FEEDS = [
  { name: 'James Clear',      url: 'https://jamesclear.com/feed' },
  { name: 'Zen Habits',       url: 'https://zenhabits.net/feed/' },
  { name: 'Scott H Young',    url: 'https://www.scotthyoung.com/blog/feed/' },
  { name: 'Lifehacker',       url: 'https://lifehacker.com/rss' },
  { name: 'Mark Manson',      url: 'https://markmanson.net/feed' },
  { name: 'Inc Productivity', url: 'https://www.inc.com/rss/tag/productivity.xml' },
  { name: 'Fast Company',     url: 'https://www.fastcompany.com/latest/rss' },
  { name: 'Mindful.org',      url: 'https://www.mindful.org/feed/' },
  { name: 'Psychology Today', url: 'https://www.psychologytoday.com/intl/blog/rss' },
  { name: 'Harvard Health',   url: 'https://www.health.harvard.edu/blog/feed' },
]

function extractText(val) {
  if (!val) return ''
  if (typeof val === 'string') return val
  if (Array.isArray(val)) return extractText(val[0])
  if (val._) return val._
  return String(val)
}

function first20Words(text) {
  return (text || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().split(' ').slice(0, 20).join(' ')
}

async function fetchWellness(config) {
  const maxResults = config.maxResults || 20
  const cutoff = Date.now() - 48 * 60 * 60 * 1000 // 48hr window — wellness blogs post less frequently
  const results = []
  logger.info(`Fetching ${FEEDS.length} wellness/productivity RSS feeds`)

  for (const feed of FEEDS) {
    try {
      const res = await axios.get(feed.url, {
        timeout: 8000,
        headers: { 'User-Agent': 'TinySparrow/1.0' },
      })

      const cleaned = res.data
        .replace(/xmlns(?::\w+)?="[^"]*"/g, '')
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, c) => c.trim())

      const parsed = await xml2js.parseStringPromise(cleaned, { explicitArray: false })
      let items = parsed?.rss?.channel?.item || parsed?.feed?.entry || []
      if (!Array.isArray(items)) items = [items]

      let added = 0, tooOld = 0
      for (const item of items) {
        const title = extractText(item.title || '')
        const link = extractText(item.link || item.url || item.id || '')
        const pubDate = extractText(item.pubDate || item.published || item.updated || '')
        const desc = extractText(item.description || item.summary || item.content || '')

        if (!title || !link) continue
        const pub = pubDate ? new Date(pubDate).getTime() : Date.now()
        if (pub < cutoff) { tooOld++; continue }

        added++
        results.push({
          title: title.trim(),
          url: link.trim(),
          snippet: first20Words(desc || title),
          source: 'wellness',
          publisher: feed.name,
          publishedAt: pubDate || new Date().toISOString(),
          engagement: 0,
          fetchedAt: new Date().toISOString(),
        })
      }
      logger.info(`${feed.name}: ${added} new items (${tooOld} too old)`)
    } catch (err) {
      logger.fetchError(feed.url, err)
    }
  }

  logger.result(results.slice(0, maxResults).length)
  return results.slice(0, maxResults)
}

module.exports = fetchWellness
