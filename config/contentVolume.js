// Single knob for the daily Telegram content drop. Tune volumes here — no code changes needed.
// All of this rides on the ONE scheduled daily research run (no ad-hoc searches). Draft-only.
//
// WHAT each post is ABOUT is not set here — that comes from the editable content strategy in
// state/strategyStore.js (Settings → Content strategy). This file only controls HOW MUCH.
const strategyStore = require('../state/strategyStore')

module.exports = {
  // Daily batch: 10 posts — the first 2 are THREADS on pillar themes, the remaining 8 are short
  // punch posts. Thread themes are derived from the strategy (AI always takes slot 1; self-help and
  // wellness alternate in slot 2), so they follow the pillars rather than being hardcoded.
  posts: {
    count: 10,
    threadCount: 2,
    // Resolved per-run so a strategy edit takes effect on the next drop with no restart.
    themes(date = new Date()) {
      return strategyStore.threadThemes(null, this.threadCount, date)
    },
  },

  // Value-add quote-reposts. Restricted to the account's own subjects — a repost is an endorsement,
  // so an off-topic one costs more than a weak post does. Watchlist authors are always considered
  // first: their recent posts are fetched directly, not just hoped for in the research pool, and
  // they get a LOOSER filter because they were curated for exactly these subjects.
  reposts: {
    perDay: 5,
    get domains() { return strategyStore.onTopicDomains(null) },
    watchlistFirst: true,
    watchlistLooseFilter: true,
  },

  articleIdeas:{ count: 4 },        // number of tappable article ideas offered (3–5 is the sweet spot)
  linkedinPosts:{ count: 1 },       // Parrot's daily LinkedIn topic count — auto-posts on Approve, so this is the real daily-volume knob
  heron: { notes: 4, mid: 2 },      // Substack daily: short Notes + mid-length posts
}
