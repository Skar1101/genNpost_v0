const axios = require('axios')
const xml2js = require('xml2js')

async function fetchGoogleAIBlog(config) {
  const maxResults = config.maxResults || 10

  try {
    const res = await axios.get('https://blog.google/technology/ai/rss/', {
      timeout: 10000,
      headers: { 'User-Agent': 'TinySparrow/1.0' },
    })

    const parsed = await xml2js.parseStringPromise(res.data, { explicitArray: false })
    const items = parsed.rss.channel.item
    const list = Array.isArray(items) ? items : [items]

    return list.slice(0, maxResults).map(item => ({
      title: item.title,
      url: item.link,
      summary: (item.description || '').replace(/<[^>]+>/g, '').slice(0, 200),
      source: 'googleai',
      engagement: 0,
      fetchedAt: new Date().toISOString(),
    }))
  } catch (err) {
    console.warn(`[Raven] Google AI Blog fetch failed: ${err.message}`)
    return []
  }
}

module.exports = fetchGoogleAIBlog
