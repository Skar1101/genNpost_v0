// Sidebar navigation model. Control Center + Queue are the only new surfaces;
// every "Agents"/"System" item routes to a ported page (existing dashboard panel,
// rebuilt with its current layout later).

export const navSections = [
  {
    items: [{ id: 'cc', label: 'Control Center', to: '/' }],
  },
  {
    eyebrow: 'Work',
    items: [{ id: 'queue', label: 'Queue', to: '/queue', badge: 12 }],
  },
  {
    eyebrow: 'Agents',
    items: [
      { id: 'titto', label: 'Titto', sub: 'history', to: '/agent/titto', dot: 'good',
        title: 'Titto', desc: 'Your Chief of Staff — chat with Titto anytime from the bubble in the corner. This page is the full run history: every research pull, draft, and reply, who triggered it, and what came out.' },
      { id: 'raven', label: 'Raven', sub: 'search', to: '/agent/raven', dot: 'good',
        title: 'Raven · Search', desc: 'The central research engine. Scouts every source (Hacker News, Reddit, GitHub, YouTube, arXiv, X), ranks what’s worth posting, and feeds every platform.' },
      { id: 'quill-x', label: 'Quill', sub: 'X', to: '/agent/quill-x', dot: 'good',
        title: 'Quill · X', desc: 'X’s content manager — shapes Raven’s picks into the daily X drop, quote-reposts, and article ideas.' },
      { id: 'parrot', label: 'Parrot', sub: 'LinkedIn', to: '/agent/parrot', dot: 'warn',
        title: 'Parrot · LinkedIn', desc: 'LinkedIn’s content manager. Shapes posts for LinkedIn once a trend source is connected.' },
      { id: 'heron', label: 'Heron', sub: 'Substack', to: '/agent/heron', dot: 'warn',
        title: 'Heron · Substack', desc: 'Substack’s manager — assembles newsletter issues from the week’s material. Needs a source connected.' },
      { id: 'koel', label: 'Koel', sub: 'writer', to: '/agent/koel', dot: 'good',
        title: 'Koel · Writer', desc: 'The writer behind every post. Reads your profile, voice, approvals and rejections before drafting — and never repeats a rejected angle.' },
      { id: 'article', label: 'Article Writer', to: '/agent/article', dot: 'good',
        title: 'Article Writer', desc: 'A dedicated long-form tool — streams full articles you can edit, version, and export. Grounded in real cited sources.' },
      { id: 'analyst', label: 'Analyst', to: '/agent/analyst', dot: 'good',
        title: 'Analyst', desc: 'The learning engine. Turns your approvals, edits and posted-tweet stats into what’s-working insights that steer the writer and research.' },
    ],
  },
  {
    eyebrow: 'System',
    items: [
      { id: 'schedules', label: 'Schedules', to: '/system/schedules',
        title: 'Schedules', desc: 'Every scheduled run in one place. Retime or pause any of them.' },
      { id: 'settings', label: 'Settings', to: '/system/settings',
        title: 'Settings', desc: 'Your creator profile, connected platforms, reply domains, and research focus.' },
    ],
  },
]

// Flattened list of the pages that render as ported placeholders (everything but CC + Queue).
export const portedPages = navSections
  .flatMap((s) => s.items)
  .filter((it) => it.id !== 'cc' && it.id !== 'queue')

// Title/crumb lookup by pathname for the top bar.
export function pageMetaFor(pathname) {
  if (pathname === '/') return { title: 'Control Center', crumb: 'MON 17 JUL · 12 drafts waiting' }
  if (pathname === '/queue') return { title: 'Queue', crumb: '12 pending · 4 approved · 2 rejected today' }
  const p = portedPages.find((x) => x.to === pathname)
  return p ? { title: p.title, crumb: 'existing page — same layout, reskinned' } : { title: 'TinySparrow', crumb: '' }
}
