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
        title: 'Schedules', desc: 'Every scheduled run, IST. Pause or resume all auto-runs with one toggle.' },
      { id: 'settings', label: 'Settings', to: '/system/settings',
        title: 'Settings', desc: 'Your creator profile — identity, voice, watchlist, best tweets — and reply-search domains.' },
    ],
  },
]

// Flattened list of the pages that render as ported placeholders (everything but CC + Queue).
export const portedPages = navSections
  .flatMap((s) => s.items)
  .filter((it) => it.id !== 'cc' && it.id !== 'queue')

// Title/crumb lookup by pathname for the top bar. `pendingCount` (real generated-queue
// count) is passed in from TopBar so Control Center/Queue crumbs reflect live data
// instead of hardcoded placeholder numbers.
export function pageMetaFor(pathname, pendingCount) {
  if (pathname === '/') {
    const n = pendingCount ?? 0
    return { title: 'Control Center', crumb: `${n} draft${n === 1 ? '' : 's'} waiting on your call` }
  }
  if (pathname === '/queue') {
    const n = pendingCount ?? 0
    return { title: 'Queue', crumb: n > 0 ? `${n} waiting for review` : 'Nothing waiting for review' }
  }
  const p = portedPages.find((x) => x.to === pathname)
  return p ? { title: p.title, crumb: p.desc } : { title: 'TinySparrow', crumb: '' }
}
