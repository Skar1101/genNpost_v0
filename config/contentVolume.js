// Single knob for the daily Telegram content drop. Tune volumes here — no code changes needed.
// All of this rides on the ONE scheduled daily research run (no ad-hoc searches). Draft-only.
module.exports = {
  posts:       { perSection: 2 },   // daily batch: 3 buckets (motivational/domain/trending) × perSection
  reposts:     { perDay: 2 },       // value-add quote-repost drafts of viral posts from the research
  articleIdeas:{ count: 4 },        // number of tappable article ideas offered (3–5 is the sweet spot)
}
