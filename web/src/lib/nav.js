// Sidebar navigation model. Control Center + Queue are the only new surfaces;
// every "Agents"/"System" item routes to a ported page (existing dashboard panel,
// rebuilt with its current layout later).

export const navSections = [
  {
    items: [{ id: 'cc', label: 'Control Center', to: '/' }],
  },
  {
    eyebrow: 'Work',
    items: [
      { id: 'queue', label: 'Queue', to: '/queue', badge: 12 },
      { id: 'studio', label: 'Studio', to: '/studio' },
      { id: 'library', label: 'Library', to: '/library' },
    ],
  },
  {
    eyebrow: 'Agents',
    items: [
      { id: 'titto', label: 'Titto', sub: 'chat', to: '/agent/titto', dot: 'good',
        title: 'Titto', desc: 'Your Chief of Staff — a full chat to plan and generate content, continuing the same conversation as the bubble in the corner. The run history sits alongside: every research pull, draft, and reply, who triggered it, and what came out.' },
      { id: 'raven', label: 'Raven', sub: 'search', to: '/agent/raven', dot: 'good',
        title: 'Raven · Search', desc: 'The central research engine. Scouts every source (Hacker News, Reddit, GitHub, YouTube, arXiv, X), ranks what’s worth posting, and feeds every platform.' },
      { id: 'quill-x', label: 'Quill', sub: 'X', to: '/agent/quill-x', dot: 'good',
        title: 'Quill · X', desc: 'X’s content manager — shapes Raven’s picks into the daily X drop, quote-reposts, and article ideas.' },
      { id: 'parrot', label: 'Parrot', sub: 'LinkedIn', to: '/agent/parrot', dot: 'good',
        title: 'Parrot · LinkedIn', desc: 'LinkedIn’s content manager — career growth, AI/tech commentary, and building-in-public posts. The one agent that actually auto-posts: Approve on Telegram (or the Queue) publishes to LinkedIn immediately, no further manual step.' },
      { id: 'heron', label: 'Heron', sub: 'Substack', to: '/agent/heron', dot: 'good',
        title: 'Heron · Substack', desc: 'Substack’s manager — finds article topics from Raven’s research, writes full newsletter posts + an image prompt, and drafts Notes. Approve on Telegram to get everything hand-off-ready; the publish click stays yours.' },
      { id: 'koel', label: 'Koel', sub: 'writer', to: '/agent/koel', dot: 'good',
        title: 'Koel · Writer', desc: 'The writer behind every post. Reads your profile, voice, approvals and rejections before drafting — and never repeats a rejected angle.' },
      { id: 'article', label: 'Article Writer', to: '/agent/article', dot: 'good',
        title: 'Article Writer', desc: 'A dedicated long-form tool — streams full articles you can edit, version, and export. Grounded in real cited sources.' },
      { id: 'image', label: 'Image', sub: 'tool', to: '/agent/image', dot: 'good',
        title: 'Image', desc: 'Generate visuals in your house style — from a post, a subject, or a raw prompt. Approve the good ones: that set becomes the training data for a model tuned to your own look.' },
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

// Flattened list of the pages that render as ported placeholders (everything but the pages built
// as their own surfaces: Control Center, Queue, Library, Compose).
const OWN_SURFACES = ['cc', 'queue', 'library', 'studio']
export const portedPages = navSections
  .flatMap((s) => s.items)
  .filter((it) => !OWN_SURFACES.includes(it.id))

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
  if (pathname === '/library') {
    return { title: 'Library', crumb: 'Finished work — editable, versioned, ready to schedule' }
  }
  if (pathname === '/studio') {
    return { title: 'Studio', crumb: 'Write or generate, add a picture, save · schedule · send' }
  }
  const p = portedPages.find((x) => x.to === pathname)
  return p ? { title: p.title, crumb: p.desc } : { title: 'TinySparrow', crumb: '' }
}
