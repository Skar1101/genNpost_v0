const axios = require('axios')
const xml2js = require('xml2js')
const logger = require('../utils/logger').source('arxiv')

async function fetchArxiv(config) {
  const cats = config.categories || ['cs.AI', 'cs.LG']
  // arXiv syntax: each category needs its own `cat:` joined by " OR " (axios encodes the space;
  // the old "+OR+" join got URL-encoded into garbage and returned 0 results).
  const catQuery = cats.map(c => `cat:${c}`).join(' OR ')
  const maxResults = config.maxResults || 10
  const searchQuery = config.searchQuery || null

  // When user specifies a topic, search title/abstract for it; otherwise browse by category
  const search_query = searchQuery
    ? `(ti:${searchQuery} OR abs:${searchQuery}) AND (${catQuery})`
    : catQuery

  try {
    const res = await axios.get('https://export.arxiv.org/api/query', {
      params: {
        search_query,
        start: 0,
        max_results: maxResults,
        sortBy: 'submittedDate',
        sortOrder: 'descending',
      },
      timeout: 12000,
    })

    // arXiv returns Atom feed with default namespace — strip it for xml2js
    const cleaned = res.data.replace(/xmlns="[^"]*"/g, '')
    const parsed = await xml2js.parseStringPromise(cleaned, { explicitArray: false })
    const entries = parsed?.feed?.entry
    if (!entries) return []
    const list = Array.isArray(entries) ? entries : [entries]

    return list.map(e => {
      const summary = (Array.isArray(e.summary) ? e.summary[0] : e.summary || '').replace(/\n/g, ' ').trim()
      const published = (Array.isArray(e.published) ? e.published[0] : e.published || '').trim()
      return {
        title: (Array.isArray(e.title) ? e.title[0] : e.title || '').replace(/\n/g, ' ').trim(),
        url: (Array.isArray(e.id) ? e.id[0] : e.id || '').trim(),
        snippet: summary.slice(0, 200),
        summary: summary.slice(0, 200),
        source: 'arxiv',
        publisher: 'arXiv',
        publishedAt: published ? new Date(published).toISOString() : new Date().toISOString(),
        engagement: 0,
        fetchedAt: new Date().toISOString(),
      }
    })
  } catch (err) {
    logger.fetchError('export.arxiv.org/api/query', err)
    return []
  }
}

module.exports = fetchArxiv
