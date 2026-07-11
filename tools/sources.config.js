// sources.config.js
// To add a new source: create a fetcher in tools/, add an entry here, set enabled: true
// Categories: youtube | twitter | github | news | ai_research

module.exports = [
  {
    id: 'hackernews',
    name: 'Hacker News',
    enabled: true,
    tier: 1,
    category: 'news',
    fetcher: './fetchHackerNews',
    maxResults: 20,
    requiresKey: false,
  },
  {
    id: 'twitter',
    name: 'Twitter / X',
    enabled: true,
    tier: 1,
    category: 'twitter',
    fetcher: './fetchTwitter',
    maxResults: 20,
    requiresKey: true,
    envKey: 'RAPIDAPI_KEY',
  },
  {
    id: 'reddit',
    name: 'Reddit',
    enabled: true,
    tier: 1,
    category: 'news',
    fetcher: './fetchReddit',
    maxResults: 25,
    requiresKey: false,           // works via public .json fallback; auto-uses OAuth if creds set
    // Balanced ~60% human / ~40% tech to match Souvik's audience (self-dev + AI-for-humans, not pure AI).
    // human: discipline/meditation/self-dev + AI-impact-on-humans; tech: trending AI. See fetchReddit SUB_TOPIC.
    // OAuth (REDDIT_CLIENT_ID/SECRET) recommended for reliability.
    subreddits: ['getdisciplined', 'Meditation', 'selfimprovement', 'productivity', 'Stoicism', 'Futurology', 'artificial', 'LocalLLaMA', 'OpenAI'],
  },
  {
    id: 'github',
    name: 'GitHub',
    enabled: true,
    tier: 1,
    category: 'github',
    fetcher: './fetchGitHub',
    maxResults: 15,
    requiresKey: false,
  },
  {
    id: 'youtube',
    name: 'YouTube',
    enabled: true,
    tier: 1,
    category: 'youtube',
    fetcher: './fetchYouTube',
    maxResults: 30,
    requiresKey: true,
    envKey: 'YOUTUBE_API_KEY',
    channels: [
      // Tier 1 — highest weight (verified channel IDs)
      { name: 'Matt Wolfe',    id: 'UChpleBmo18P08aKCIgti38g', tier: 1 },
      { name: 'Liam Ottley',   id: 'UCui4jxDaMb53Gdh-AZUTPAg', tier: 1 },
      { name: 'Greg Isenberg', id: 'UCPjNBjflYl0-HQtUvOx0Ibw', tier: 1 },
      { name: 'Nick Saraev',   id: 'UCbo-KbSjJDG6JWQ_MTZ_rNA', tier: 1 },
      { name: 'Corbin AI',     id: 'UCJFMlSxcvlZg5yZUYJT0Pug', tier: 1 },
      { name: 'David Shapiro', id: 'UCvKRFNawVcuz4b9ihUTApCg', tier: 1 },
      { name: 'Ethan Mollick', id: 'UCg7krw0aYBb3uD7x0PQD9Fg', tier: 1, topic: 'human' }, // AI's impact on how humans work
      // Tier 2 (verified)
      { name: 'Andrej Karpathy',  id: 'UCXUPKJO5MZQN11PqgIvyuvQ', tier: 2 },
      { name: 'Fireship',         id: 'UCsBjURrPoezykLs9EqgamOA', tier: 2 },
      { name: 'AI Explained',     id: 'UCNJ1Ymd5yFuUPtn21xtRbbw', tier: 2 },
      { name: 'Yannic Kilcher',   id: 'UCZHmQk67mSJgfCCTn7xBfew', tier: 2 },
      { name: 'The AI Advantage', id: 'UCHhYXsLBEVVnbvsq57n1MTQ', tier: 2 },
      { name: 'Wes Roth',         id: 'UCqcbQf6yw5KzRoDDcZ_wBSw', tier: 2 },
      { name: 'Jeff Su',          id: 'UCwAnu01qlnVg1Ai2AbtTMaA', tier: 2 },
      // Productivity & Wellness — the HUMAN bucket (discipline, self-dev, meditation)
      { name: 'Ali Abdaal',       id: 'UCoOae5nYA7VqaXzerajD0lg', tier: 1, topic: 'human' },
      { name: 'Thomas Frank',     id: 'UCG-KntY7aVnIGXYEBQvmBAQ', tier: 2, topic: 'human' },
      { name: 'Andrew Huberman',  id: 'UC2D2CMWXMOVWx7giW1n3LIg', tier: 1, topic: 'human' },
      { name: 'Jay Shetty',       id: 'UCwk49IO9EWa4NeO5HVwEMpg',  tier: 2, topic: 'human' },
    ],
  },
  {
    id: 'arxiv',
    name: 'arXiv Research Papers',
    enabled: true,
    tier: 2,
    category: 'ai_research',
    fetcher: './fetchArxiv',
    maxResults: 15,
    requiresKey: false,
    categories: ['cs.AI', 'cs.LG', 'cs.CL'],
  },
  // Retired 2026-06: fetchNews / fetchAIResearch / fetchWellness — RSS aggregators that failed
  // most runs (dead feeds, 403/404, malformed XML). HN covers tech news; arXiv API covers research.
  // ─── Add new sources below ────────────────────────────────────────────────
  // {
  //   id: 'producthunt',
  //   name: 'Product Hunt',
  //   enabled: false,
  //   tier: 1,
  //   category: 'news',
  //   fetcher: './fetchProductHunt',
  //   maxResults: 10,
  //   requiresKey: false,
  // },
]
