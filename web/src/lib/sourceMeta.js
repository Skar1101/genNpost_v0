// Shared source/type badge metadata + small time/score helpers, used by Raven and Quill
// (Quill's "Latest search" card mirrors Raven's result rows, so the styling must match).

export const SOURCES = [
  { id: 'all', label: 'All sources' },
  { id: 'hackernews', label: 'Hacker News' },
  { id: 'twitter', label: 'Twitter / X' },
  { id: 'reddit', label: 'Reddit' },
  { id: 'github', label: 'GitHub' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'arxiv', label: 'arXiv' },
]

export const TYPES = [
  { id: 'all', label: 'All types' },
  { id: 'short', label: 'Short' },
  { id: 'thread', label: 'Thread' },
  { id: 'long', label: 'Long' },
]

export const SOURCE_META = {
  youtube: { label: 'YouTube', cls: 'src-youtube' },
  twitter: { label: 'Twitter / X', cls: 'src-twitter' },
  github: { label: 'GitHub', cls: 'src-github' },
  news: { label: 'News', cls: 'src-news' },
  ai_research: { label: 'AI Research', cls: 'src-ai_research' },
  hackernews: { label: 'Hacker News', cls: 'src-hackernews' },
  reddit: { label: 'Reddit', cls: 'src-reddit' },
  arxiv: { label: 'arXiv', cls: 'src-arxiv' },
  wellness: { label: 'Wellness', cls: 'src-wellness' },
}

export function relTime(iso) {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}

export function scoreClass(score) {
  return score >= 80 ? 'score-hi' : score >= 60 ? 'score-mid' : 'score-lo'
}

export function triggerClass(label) {
  if (label?.startsWith('⏰')) return 'scheduled'
  if (label?.startsWith('💬')) return 'titto'
  if (label?.startsWith('📱')) return 'telegram'
  return 'manual'
}
