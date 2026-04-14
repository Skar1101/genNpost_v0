const axios = require('axios')
const xml2js = require('xml2js')
const logger = require('../utils/logger').source('news')

const FEEDS = [
  { name: 'TechCrunch',      url: 'https://techcrunch.com/feed/' },
  { name: 'The Verge',       url: 'https://www.theverge.com/rss/index.xml' },
  { name: 'Wired',           url: 'https://www.wired.com/feed/rss' },
  { name: 'Ars Technica',    url: 'https://feeds.arstechnica.com/arstechnica/index' },
  { name: 'VentureBeat',     url: 'https://venturebeat.com/feed/' },
  { name: 'MIT Tech Review', url: 'https://www.technologyreview.com/feed/' },
  { name: 'OpenAI Blog',     url: 'https://openai.com/news/rss.xml' },
  { name: 'Anthropic Blog',  url: 'https://www.anthropic.com/rss.xml' },
  { name: 'Hugging Face',    url: 'https://huggingface.co/blog/feed.xml' },
  { name: 'Google DeepMind', url: 'https://deepmind.google/blog/rss.xml' },
  { name: 'Google AI Blog',  url: 'https://blog.google/technology/ai/rss/' },
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

async function fetchNews(config) {
  const maxResults = config.maxResults || 40
  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  const results = []
  logger.info(`Fetching ${FEEDS.length} RSS feeds`)

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
          source: 'news',
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

module.exports = fetchNews
