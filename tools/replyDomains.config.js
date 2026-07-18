// Domain registry for Raven's reply-target search.
// `core: true` domains are always on (Raven's default focus). The rest are optional —
// enabled persistently via the reply-domains setting, or added ad-hoc per /replies run
// (handy when a run returns few/0 results and you want to widen the net).
const DOMAINS = [
  {
    id: 'ai_tech',
    label: 'AI & Tech',
    core: true,
    aliases: ['ai', 'tech', 'technology'],
    queries: [
      '(AI OR LLM OR "artificial intelligence") (launch OR release OR breakthrough) lang:en',
      '(ChatGPT OR Claude OR Gemini OR GPT) lang:en',
      '(AI agent OR AI tool OR automation) lang:en',
      '(startup OR "venture capital" OR funding) AI lang:en',
      '(GitHub OR "open source") AI model lang:en',
    ],
  },
  {
    id: 'productivity',
    label: 'Productivity & Mindset',
    core: true,
    aliases: ['productivity', 'mindset', 'wellness', 'mindfulness'],
    queries: [
      '(productivity OR "deep work" OR "morning routine" OR "time management") tip lang:en',
      '(mindfulness OR meditation OR stoicism OR "mental clarity") lang:en',
    ],
  },
  {
    id: 'investment',
    label: 'Investment & Stocks',
    core: false,
    aliases: ['investment', 'investments', 'investing', 'stocks', 'stock', 'equities'],
    queries: [
      '(investing OR stocks OR equities OR "stock market") lang:en',
      '(earnings OR portfolio OR dividends OR valuation) lang:en',
    ],
  },
  {
    id: 'global_markets',
    label: 'Global Markets & Economy',
    core: false,
    aliases: ['global markets', 'markets', 'market', 'economy', 'economics', 'macro'],
    queries: [
      '(economy OR inflation OR "interest rates" OR "Federal Reserve" OR Fed) lang:en',
      '(commodities OR oil OR gold OR "global markets" OR recession) lang:en',
    ],
  },
  {
    id: 'sports_trends',
    label: 'Sports & Trending Events',
    core: false,
    aliases: ['sports', 'sport', 'world cup', 'worldcup', 'olympics', 'trends', 'trending', 'events'],
    queries: [
      '("World Cup" OR Olympics OR championship OR finals OR playoffs) lang:en',
      '(football OR soccer OR cricket OR NBA OR F1) trending lang:en',
    ],
  },
]

const coreIds = () => DOMAINS.filter(d => d.core).map(d => d.id)
const byId = (id) => DOMAINS.find(d => d.id === id) || null

// Flatten the queries for a set of domain ids (dedup, order follows registry).
function resolveQueries(ids) {
  const want = new Set(ids)
  const out = []
  for (const d of DOMAINS) if (want.has(d.id)) out.push(...d.queries)
  return out
}

// Map a free-text token ("investment", "world cup") to a domain id, or null if no match.
function matchDomain(text) {
  const t = (text || '').trim().toLowerCase()
  if (!t) return null
  for (const d of DOMAINS) {
    if (d.id === t) return d.id
    if (d.aliases.includes(t)) return d.id
  }
  return null
}

module.exports = { DOMAINS, coreIds, byId, resolveQueries, matchDomain }
