// Single knob for the daily Telegram content drop. Tune volumes here — no code changes needed.
// All of this rides on the ONE scheduled daily research run (no ad-hoc searches). Draft-only.
module.exports = {
  posts:       { count: 4 },        // daily batch: 4 punchy short posts (long-form dropped — not useful in the drop)
  reposts:     { perDay: 4 },       // value-add quote-repost drafts of viral posts from the research
  articleIdeas:{ count: 4 },        // number of tappable article ideas offered (3–5 is the sweet spot)
  linkedinPosts:{ count: 1 },       // Parrot's daily LinkedIn topic count — auto-posts on Approve, no cap on that side, so this is the real daily-volume knob
}
