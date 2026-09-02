// Reads an arbitrary web page the user pasted and returns its readable text.
//
// Nothing in TinySparrow could do this before: every other fetcher targets a hardcoded endpoint, and
// the only URL handling was tools/fetchTweet.js, which is x.com-only and reachable solely from /reply.
// So "read this Substack article and write something like it" had no way to work — the URL was handed
// to the model as a bare string and fired at GitHub/arXiv as a search query.
//
// Deliberately dependency-free beyond axios + cheerio, both already used by tools/fetchGitHub.js.

const axios = require('axios')
const cheerio = require('cheerio')
const logger = require('../utils/logger').source('readurl')

const TIMEOUT_MS = 15000
const MAX_BYTES = 3 * 1024 * 1024
const MAX_CHARS = 8000
// An article has to actually be an article. The old floor was 80 chars, which let
// "HomeSubscriptionsChatActivityExploreProfileDAN KOE @thedankoe…" — 111 chars of navigation menu
// scraped off a JS-rendered Substack shell — pass as a successful read. Titto then had a headline and
// no body, and narrated from it as though it had read the piece.
const MIN_ARTICLE_CHARS = 400
// Text that is nothing but site chrome, however long.
const CHROME_ONLY = /^(home|subscriptions?|chat|activity|explore|profile|sign ?in|sign ?up|subscribe|menu|search|notes|archive|about|\|| |·|•|\d+|[A-Z@][\w@.-]*)+$/i

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi
// Tweets have their own reader (fetchTweet); these are handled elsewhere or aren't articles.
const SKIP_HOSTS = /(^|\.)(x\.com|twitter\.com|t\.co)$/i

// Block obvious SSRF targets — this fetches whatever string a message contains, so it must never be
// usable to probe the machine or the local network.
function isBlockedHost(hostname) {
  const h = (hostname || '').toLowerCase()
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local')) return true
  if (h === '0.0.0.0' || h === '::1' || h === '[::1]') return true
  if (/^10\./.test(h)) return true
  if (/^192\.168\./.test(h)) return true
  if (/^127\./.test(h)) return true
  if (/^169\.254\./.test(h)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true
  return false
}

// Every non-X http(s) URL in a message, deduped, order preserved.
function extractUrls(text) {
  const found = String(text || '').match(URL_RE) || []
  const out = []
  for (const raw of found) {
    const clean = raw.replace(/[.,;:!?]+$/, '')
    try {
      const u = new URL(clean)
      if (!/^https?:$/.test(u.protocol)) continue
      if (SKIP_HOSTS.test(u.hostname)) continue
      if (isBlockedHost(u.hostname)) continue
      if (!out.includes(clean)) out.push(clean)
    } catch (_) { /* not a real URL */ }
  }
  return out
}

// Strip chrome and keep the prose. Prefers a real <article>/main content root when the page has one,
// which is what Substack, Medium and most blogs use.
function extractText($, forcedScope = null) {
  $('script, style, noscript, iframe, svg, nav, header, footer, aside, form, button').remove()

  let root = forcedScope
  if (!root) {
    for (const sel of ['article', 'main', '[role="main"]', '.post-content', '.available-content', '#content']) {
      const el = $(sel).first()
      if (el.length && el.text().trim().length > 200) { root = el; break }
    }
  }
  const scope = root || $('body')

  const parts = []
  scope.find('h1, h2, h3, p, li, blockquote').each((_, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').trim()
    if (!t) return
    const tag = el.tagName ? el.tagName.toLowerCase() : ''
    if (tag === 'li') parts.push(`- ${t}`)
    else if (tag.startsWith('h')) parts.push(`\n## ${t}`)
    else parts.push(t)
  })

  let text = parts.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  // Some pages put everything in divs — fall back to raw body text rather than returning nothing.
  if (text.length < 200) text = scope.text().replace(/\s+/g, ' ').trim()
  return text
}

// Substack share links of the form substack.com/@handle/p-<id> are a client-rendered reader shell:
// 306 KB of HTML with zero <p> tags, so there is nothing to extract. The post id in the URL resolves
// through Substack's public API to the publication's own canonical URL, which IS server-rendered and
// reads correctly with the normal extractor.
const SUBSTACK_SHELL = /^https?:\/\/(www\.)?substack\.com\/@[\w.-]+\/p-(\d+)/i

// Turn body_html from the API into the same plain text shape extractText() produces.
function htmlToText(html) {
  const $ = cheerio.load(`<div id="__root">${html}</div>`)
  return extractText($, $('#__root'))
}

// Returns { url, title, text, truncated } or null. Handles the shell → canonical hop first.
async function readUrl(url, { _depth = 0 } = {}) {
  const shell = String(url).match(SUBSTACK_SHELL)
  if (shell && _depth === 0) {
    const resolved = await resolveSubstackPost(shell[2])
    if (resolved?.canonical) {
      logger.info(`Substack shell resolved → ${resolved.canonical}`)
      const viaCanonical = await readUrl(resolved.canonical, { _depth: 1 })
      if (viaCanonical) return { ...viaCanonical, url }
    }
    // Canonical fetch failed (paywall, moved domain) — use the API's own body_html.
    if (resolved?.bodyHtml) {
      const text = htmlToText(resolved.bodyHtml)
      if (text.length >= MIN_ARTICLE_CHARS) {
        logger.info(`Substack shell read via API body_html (${text.length} chars)`)
        return { url, title: resolved.title || '', text: text.slice(0, MAX_CHARS), truncated: text.length > MAX_CHARS }
      }
    }
    logger.warn(`Could not resolve Substack shell link: ${url}`)
    return null
  }
  return fetchAndExtract(url)
}

// { canonical, title, bodyHtml } or null.
async function resolveSubstackPost(postId) {
  try {
    const res = await axios.get(`https://substack.com/api/v1/posts/by-id/${postId}`, {
      timeout: TIMEOUT_MS,
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      validateStatus: (s) => s >= 200 && s < 300,
    })
    const d = res.data?.post || res.data || {}
    return { canonical: d.canonical_url || null, title: d.title || '', bodyHtml: d.body_html || '' }
  } catch (err) {
    logger.warn(`Substack API lookup failed for post ${postId}: ${err.message}`)
    return null
  }
}

async function fetchAndExtract(url) {
  try {
    const u = new URL(url)
    if (!/^https?:$/.test(u.protocol) || isBlockedHost(u.hostname)) return null

    const res = await axios.get(url, {
      timeout: TIMEOUT_MS,
      maxRedirects: 3,
      maxContentLength: MAX_BYTES,
      responseType: 'text',
      // Plain node UA gets 403'd by Substack/Medium; identify as a normal browser.
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
      validateStatus: (s) => s >= 200 && s < 400,
    })

    const ctype = String(res.headers['content-type'] || '')
    if (ctype && !/text\/html|text\/plain|application\/xhtml/i.test(ctype)) {
      logger.warn(`Not a readable page (${ctype}): ${url}`)
      return null
    }

    const $ = cheerio.load(String(res.data || ''))
    const title = ($('meta[property="og:title"]').attr('content') || $('title').first().text() || '').trim()
    const full = extractText($)

    // Be strict about what counts as "read". Returning a title plus a scrap of navigation is worse
    // than returning nothing: the caller can't tell the difference, so the model fills the gap by
    // inventing a summary of a page it never saw.
    if (!full || full.length < MIN_ARTICLE_CHARS) {
      logger.warn(`Page yielded only ${full ? full.length : 0} chars (need ${MIN_ARTICLE_CHARS}) — treating as UNREAD: ${url}`)
      return null
    }
    if (CHROME_ONLY.test(full.replace(/\s+/g, ' ').trim())) {
      logger.warn(`Extracted text is site chrome only — treating as UNREAD: ${url}`)
      return null
    }

    return {
      url,
      title: title.slice(0, 300),
      text: full.slice(0, MAX_CHARS),
      truncated: full.length > MAX_CHARS,
    }
  } catch (err) {
    logger.warn(`Failed to read ${url}: ${err.message}`)
    return null
  }
}

// Reads up to `limit` URLs found in a message. Returns [] when there are none or none are readable —
// callers treat failure as soft and tell the user rather than silently writing about a URL string.
async function readUrlsIn(text, limit = 2) {
  const urls = extractUrls(text).slice(0, limit)
  if (!urls.length) return []
  const results = await Promise.all(urls.map((u) => readUrl(u)))
  return results.filter(Boolean)
}

// Renders fetched pages into the block the Titto system prompt tells the model to look for.
function formatLinkedContent(pages = []) {
  if (!pages.length) return ''
  return pages.map((p) => [
    '═══ LINKED CONTENT ═══',
    `URL: ${p.url}`,
    p.title ? `TITLE: ${p.title}` : '',
    '',
    p.text,
    p.truncated ? '\n[…truncated]' : '',
    '═══ END LINKED CONTENT ═══',
  ].filter(Boolean).join('\n')).join('\n\n')
}

// ── Link card ─────────────────────────────────────────────────────────────────
// The metadata X and LinkedIn use to render a link preview. Reads <meta> rather than body text, so
// it deliberately does NOT go through the article-extraction path or its 400-char content floor —
// a page can be a perfectly good link card while having no readable article body at all.
// Reuses the same UA, timeout, redirect cap and SSRF guard as readUrl.
async function readLinkCard(url) {
  try {
    const u = new URL(url)
    if (!/^https?:$/.test(u.protocol) || isBlockedHost(u.hostname)) return null

    const res = await axios.get(url, {
      timeout: TIMEOUT_MS,
      maxRedirects: 3,
      maxContentLength: MAX_BYTES,
      responseType: 'text',
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
      validateStatus: (s) => s >= 200 && s < 400,
    })

    const $ = cheerio.load(String(res.data || ''))
    const meta = (...names) => {
      for (const n of names) {
        const v = $(`meta[property="${n}"]`).attr('content') || $(`meta[name="${n}"]`).attr('content')
        if (v && v.trim()) return v.trim()
      }
      return ''
    }

    const title = meta('og:title', 'twitter:title') || $('title').first().text().trim()
    const description = meta('og:description', 'twitter:description', 'description')
    let image = meta('og:image', 'og:image:url', 'twitter:image', 'twitter:image:src')
    // og:image is often a path or protocol-relative — resolve against the page so <img> works.
    if (image) { try { image = new URL(image, u.origin).href } catch (_) { image = '' } }
    const siteName = meta('og:site_name') || u.hostname.replace(/^www\./, '')

    if (!title && !description && !image) {
      logger.warn(`No link-card metadata on ${url}`)
      return null
    }
    return {
      url,
      title: title.slice(0, 200),
      description: description.slice(0, 300),
      image: image || null,
      siteName: siteName.slice(0, 80),
    }
  } catch (err) {
    logger.warn(`Link card failed for ${url}: ${err.message}`)
    return null
  }
}

module.exports = { readUrl, readUrlsIn, extractUrls, formatLinkedContent, readLinkCard }
