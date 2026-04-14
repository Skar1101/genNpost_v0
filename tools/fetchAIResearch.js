const axios = require('axios')
const xml2js = require('xml2js')
const fs = require('fs')
const path = require('path')
const logger = require('../utils/logger').source('ai_research')

const LAST_RUN_FILE = path.join(__dirname, '..', 'state', 'data', 'ai-research-last-run.json')

const RESEARCH_FEEDS = [
  { name: 'arXiv cs.AI',          url: 'https://export.arxiv.org/rss/cs.AI' },
  { name: 'arXiv cs.LG',          url: 'https://export.arxiv.org/rss/cs.LG' },
  { name: 'Papers With Code',     url: 'https://paperswithcode.com/latest.rss' },
  { name: 'Hugging Face Papers',  url: 'https://huggingface.co/papers.rss' },
  { name: 'Nature AI',            url: 'https://www.nature.com/subjects/artificial-intelligence.rss' },
  { name: 'Microsoft Research',   url: 'https://www.microsoft.com/en-us/research/feed/' },
  { name: 'Meta AI Blog',         url: 'https://ai.meta.com/blog/rss/' },
  { name: 'OpenAI Research',      url: 'https://openai.com/research/rss.xml' },
  { name: 'DeepMind Blog',        url: 'https://deepmind.google/blog/rss.xml' },
  { name: 'Semantic Scholar',     url: null, isJson: true },
]

function shouldRunToday() {
  try {
    if (!fs.existsSync(LAST_RUN_FILE)) return true
    const data = JSON.parse(fs.readFileSync(LAST_RUN_FILE, 'utf8'))
    return new Date(data.lastRun).toDateString() !== new Date().toDateString()
  } catch (_) { return true }
}

function markRanToday() {
  const dir = path.dirname(LAST_RUN_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(LAST_RUN_FILE, JSON.stringify({ lastRun: new Date().toISOString() }))
}

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

async function fetchAIResearch(config) {
  if (!shouldRunToday()) {
    logger.info('Already ran today — skipping (once-per-day limit)')
    return []
  }

  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  const results = []
  logger.info(`Starting daily AI research fetch — ${RESEARCH_FEEDS.length} sources`)

  for (const feed of RESEARCH_FEEDS) {
    // Semantic Scholar JSON API
    if (feed.isJson) {
      const url = 'https://api.semanticscholar.org/graph/v1/paper/search?query=large+language+model&fields=title,url,year&limit=8'
      try {
        logger.info(`${feed.name}: fetching JSON API`)
        const res = await axios.get(url, { timeout: 10000 })
        const items = res.data?.data || []
        logger.info(`${feed.name}: ${items.length} papers`)
        for (const paper of items) {
          if (!paper.title) continue
          results.push({
            title: paper.title,
            url: paper.url || `https://www.semanticscholar.org`,
            snippet: first20Words(paper.title),
            source: 'ai_research',
            publisher: feed.name,
            publishedAt: new Date().toISOString(),
            engagement: 0,
            fetchedAt: new Date().toISOString(),
          })
        }
      } catch (err) {
        logger.fetchError(url, err)
      }
      continue
    }

    // RSS / Atom feeds
    try {
      logger.info(`${feed.name}: fetching RSS`)
      const res = await axios.get(feed.url, {
        timeout: 12000,
        headers: { 'User-Agent': 'TinySparrow/1.0' },
      })

      const cleaned = res.data
        .replace(/xmlns(?::\w+)?="[^"]*"/g, '')
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, c) => c.trim())

      const parsed = await xml2js.parseStringPromise(cleaned, { explicitArray: false })
      let items = parsed?.rss?.channel?.item || parsed?.feed?.entry || []
      if (!Array.isArray(items)) items = [items]

      let added = 0, tooOld = 0
      for (const item of items.slice(0, 8)) {
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
          source: 'ai_research',
          publisher: feed.name,
          publishedAt: pubDate || new Date().toISOString(),
          engagement: 0,
          fetchedAt: new Date().toISOString(),
        })
      }
      logger.info(`${feed.name}: ${added} items (${tooOld} too old)`)
    } catch (err) {
      logger.fetchError(feed.url, err)
    }
  }

  markRanToday()
  logger.result(results.length)
  return results
}

module.exports = fetchAIResearch
