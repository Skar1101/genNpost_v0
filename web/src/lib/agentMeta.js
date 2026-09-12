// Shared agent → { label, cls } lookup, driving the colored `.agent-badge` chips used on both the
// Titto activity page and the Settings "Expenses" card. `cls` maps to a `.agent-badge.<cls>` CSS rule.
export const AGENT_META = {
  raven: { label: 'Raven', cls: 'raven' }, chitrag: { label: 'Raven', cls: 'raven' },
  'raven-replies': { label: 'Replies', cls: 'raven' }, 'chitrag-replies': { label: 'Replies', cls: 'raven' },
  reply: { label: 'Reply', cls: 'raven' }, repost: { label: 'Repost', cls: 'raven' },
  quill: { label: 'Quill', cls: 'quill' },
  koel: { label: 'Koel', cls: 'koel' },
  article: { label: 'Article', cls: 'article' },
  image: { label: 'Image', cls: 'article' },
  tools: { label: 'Tools', cls: 'tools' },
  insights: { label: 'Analyst', cls: 'insights' },
  analyst: { label: 'Analyst', cls: 'insights' },
  titto: { label: 'Titto', cls: 'titto' },
  bootstrap: { label: 'Setup', cls: 'titto' },
}
