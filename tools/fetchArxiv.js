const axios = require('axios')
const xml2js = require('xml2js')

async function fetchArxiv(config) {
  const categories = (config.categories || ['cs.AI', 'cs.LG']).join('+OR+')
  const maxResults = config.maxResults || 10

  try {
    const res = await axios.get('https://export.arxiv.org/api/query', {
      params: {
        search_query: `cat:${categories}`,
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

    return list.map(e => ({
      title: (Array.isArray(e.title) ? e.title[0] : e.title || '').replace(/\n/g, ' ').trim(),
      url: (Array.isArray(e.id) ? e.id[0] : e.id || '').trim(),
      summary: (Array.isArray(e.summary) ? e.summary[0] : e.summary || '').replace(/\n/g, ' ').trim().slice(0, 200),
      source: 'arxiv',
      engagement: 0,
      fetchedAt: new Date().toISOString(),
    }))
  } catch (err) {
    console.warn(`[ChitraG] arXiv fetch failed: ${err.message}`)
    return []
  }
}

module.exports = fetchArxiv
