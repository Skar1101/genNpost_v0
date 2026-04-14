const axios = require('axios')
const cheerio = require('cheerio')
const logger = require('../utils/logger').source('github')

function first20Words(text) {
  return (text || '').replace(/\s+/g, ' ').trim().split(' ').slice(0, 20).join(' ')
}

async function fetchGitHub(config) {
  const maxResults = config.maxResults || 15
  const results = []

  // 1. GitHub trending
  try {
    logger.info('Fetching github.com/trending (daily)')
    const res = await axios.get('https://github.com/trending?since=daily', {
      headers: { 'User-Agent': 'TinySparrow/1.0' },
      timeout: 10000,
    })
    const $ = cheerio.load(res.data)
    let count = 0
    $('article.Box-row').each((i, el) => {
      if (i >= 10) return
      const repoPath = $(el).find('h2 a').attr('href')?.trim().replace(/^\//, '') || ''
      const description = $(el).find('p').text().trim()
      const stars = $(el).find('a[href*="/stargazers"]').first().text().trim().replace(/,/g, '')
      const todayStars = $(el).find('span.d-inline-block.float-sm-right').text().trim()
      if (!repoPath) return
      count++
      results.push({
        title: repoPath,
        url: `https://github.com/${repoPath}`,
        snippet: first20Words(description),
        source: 'github',
        publisher: 'GitHub Trending',
        publishedAt: new Date().toISOString(),
        engagement: parseInt(stars) || 0,
        todayStars,
        fetchedAt: new Date().toISOString(),
      })
    })
    logger.info(`Trending: ${count} repos scraped`)
  } catch (err) {
    logger.fetchError('https://github.com/trending', err)
  }

  // 2. GitHub search for recent AI repos
  try {
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10)
    const url = 'https://api.github.com/search/repositories'
    logger.info(`Searching repos pushed after ${yesterday}`)
    const res = await axios.get(url, {
      params: { q: `topic:llm topic:ai pushed:>${yesterday} stars:>20`, sort: 'updated', order: 'desc', per_page: 8 },
      headers: { 'User-Agent': 'TinySparrow/1.0', Accept: 'application/vnd.github.v3+json' },
      timeout: 8000,
    })
    const count = res.data.items?.length || 0
    logger.info(`API search: ${count} repos found`)
    for (const repo of res.data.items || []) {
      results.push({
        title: repo.full_name,
        url: repo.html_url,
        snippet: first20Words(repo.description || repo.full_name),
        source: 'github',
        publisher: 'GitHub Search',
        publishedAt: repo.pushed_at || new Date().toISOString(),
        engagement: repo.stargazers_count,
        fetchedAt: new Date().toISOString(),
      })
    }
  } catch (err) {
    logger.fetchError('https://api.github.com/search/repositories', err)
  }

  const seen = new Set()
  const deduped = results.filter(r => { if (seen.has(r.url)) return false; seen.add(r.url); return true })
  const sorted = deduped.sort((a, b) => b.engagement - a.engagement).slice(0, maxResults)
  logger.result(sorted.length)
  return sorted
}

module.exports = fetchGitHub
