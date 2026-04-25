const axios = require('axios')
const xml2js = require('xml2js')
const logger = require('../utils/logger').source('tools')

function first30Words(text) {
  return (text || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().split(' ').slice(0, 30).join(' ')
}

function extractText(val) {
  if (!val) return ''
  if (typeof val === 'string') return val
  if (Array.isArray(val)) return extractText(val[0])
  if (val._) return val._
  return String(val)
}

// ── Source 1: AI News (artificialintelligence-news.com) ─────────────────────
async function fetchBensBites() {
  const results = []
  try {
    const res = await axios.get('https://www.artificialintelligence-news.com/feed/', {
      timeout: 8000,
      headers: { 'User-Agent': 'TinySparrow/1.0' },
    })
    const cleaned = res.data
      .replace(/xmlns(?::\w+)?="[^"]*"/g, '')
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, c) => c.trim())
    const parsed = await xml2js.parseStringPromise(cleaned, { explicitArray: false })
    let items = parsed?.rss?.channel?.item || parsed?.feed?.entry || []
    if (!Array.isArray(items)) items = [items]
    const cutoff = Date.now() - 48 * 60 * 60 * 1000
    for (const item of items) {
      const title = extractText(item.title || '')
      const link = extractText(item.link || '')
      const pubDate = extractText(item.pubDate || item.published || '')
      const desc = extractText(item.description || item.summary || '')
      if (!title || !link) continue
      const pub = pubDate ? new Date(pubDate).getTime() : Date.now()
      if (pub < cutoff) continue
      results.push({
        name: title.trim(),
        url: link.trim(),
        description: first30Words(desc || title),
        publishedAt: pubDate || new Date().toISOString(),
        source: 'bensbites',
      })
    }
    logger.info(`AI News: ${results.length} items`)
  } catch (err) {
    logger.fetchError('artificialintelligence-news.com/feed', err)
  }
  return results
}


// ── Source 2: Product Hunt AI RSS ────────────────────────────────────────────
async function fetchProductHunt() {
  const results = []
  try {
    const res = await axios.get('https://www.producthunt.com/feed?category=artificial-intelligence', {
      timeout: 10000,
      headers: { 'User-Agent': 'TinySparrow/1.0' },
    })
    const cleaned = res.data
      .replace(/xmlns(?::\w+)?="[^"]*"/g, '')
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, c) => c.trim())
    const parsed = await xml2js.parseStringPromise(cleaned, { explicitArray: false })
    // PH uses Atom format: feed.entry, not rss.channel.item
    let items = parsed?.feed?.entry || parsed?.rss?.channel?.item || []
    if (!Array.isArray(items)) items = [items]
    const cutoff = Date.now() - 72 * 60 * 60 * 1000  // 72hr — PH posts once/day
    for (const item of items) {
      const title = extractText(item.title || '')
      // Atom link is an object with $ attr, RSS link is a string
      let link = ''
      if (item.link && typeof item.link === 'object' && item.link.$) {
        link = item.link.$.href || ''
      } else {
        link = extractText(item.link || item.url || item.id || '')
      }
      const pubDate = extractText(item.updated || item.published || item.pubDate || '')
      const desc = extractText(item.summary || item.description || item.content || '')
      if (!title || !link) continue
      const pub = pubDate ? new Date(pubDate).getTime() : Date.now()
      if (pub < cutoff) continue
      results.push({
        name: title.trim(),
        url: link.trim(),
        description: first30Words(desc || title),
        publishedAt: pubDate || new Date().toISOString(),
        source: 'producthunt',
      })
    }
    logger.info(`Product Hunt: ${results.length} tools`)
  } catch (err) {
    logger.fetchError('producthunt.com/feed?category=artificial-intelligence', err)
  }
  return results
}

// ── Source 3: AI Weekly newsletter ───────────────────────────────────────────
async function fetchRundownAI() {
  const results = []
  try {
    const res = await axios.get('https://aiweekly.co/issues.rss', {
      timeout: 8000,
      headers: { 'User-Agent': 'TinySparrow/1.0' },
    })
    const cleaned = res.data
      .replace(/xmlns(?::\w+)?="[^"]*"/g, '')
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, c) => c.trim())
    const parsed = await xml2js.parseStringPromise(cleaned, { explicitArray: false })
    let items = parsed?.rss?.channel?.item || parsed?.feed?.entry || []
    if (!Array.isArray(items)) items = [items]
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000  // 7 days — weekly newsletter
    for (const item of items) {
      const title = extractText(item.title || '')
      const link = extractText(item.link || '')
      const pubDate = extractText(item.pubDate || item.published || '')
      const desc = extractText(item.description || item.summary || '')
      if (!title || !link) continue
      const pub = pubDate ? new Date(pubDate).getTime() : Date.now()
      if (pub < cutoff) continue
      results.push({
        name: title.trim(),
        url: link.trim(),
        description: first30Words(desc || title),
        publishedAt: pubDate || new Date().toISOString(),
        source: 'ainews',
      })
    }
    logger.info(`AI Weekly: ${results.length} items`)
  } catch (err) {
    logger.fetchError('aiweekly.co/issues.rss', err)
  }
  return results
}

async function fetchTools(config) {
  const maxResults = config.maxResults || 20
  const [bb, ph, ra] = await Promise.allSettled([fetchBensBites(), fetchProductHunt(), fetchRundownAI()])

  const all = [
    ...(bb.status === 'fulfilled' ? bb.value : []),
    ...(ph.status === 'fulfilled' ? ph.value : []),
    ...(ra.status === 'fulfilled' ? ra.value : []),
  ]

  // Dedupe by URL
  const seen = new Set()
  const deduped = []
  for (const item of all) {
    const key = (item.url || '').toLowerCase().trim()
    if (key && !seen.has(key)) { seen.add(key); deduped.push(item) }
  }

  logger.result(Math.min(deduped.length, maxResults))
  return deduped.slice(0, maxResults)
}

module.exports = fetchTools
