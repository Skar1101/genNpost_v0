# TinySparrow — Plans

This file holds a plain-language copy of every plan before it gets built, so you can read it here in
the project instead of hunting for it. Newest plan at the top. `IMPLEMENTATION_STATUS.md` is the
companion file for *what's already done*; this one is for *what's about to happen*.

---

## ✅ DONE — Fix all-lowercase drafts + prioritize watchlist handles in reposts (2026-07-20)

*Built and verified live. See summary at the end of this entry.*

### The problem
1. Every draft Koel writes comes out **completely lowercase** — no capital letters anywhere, not even
   at the start of sentences. You want drafts to read as "near complete," not like rough notes.
2. The repost feature (finds viral X posts and drafts a quote-repost comment) treats every post the
   same. You want it to prioritize posts from your **watchlist handles** (the list in Settings), and
   you want to be able to paste a full X/Twitter profile link there too, not just a bare handle.

### Why it's happening (I traced this, not guessed)
The lowercase issue has two real causes:
- Your creator profile's "Voice description" field literally contains the phrase **"lowercase-friendly"**
  — left over from the app's original template text, never edited. This gets fed to the AI on every
  single draft as a direct instruction.
- One of the reference files that teaches Koel what a "high-performing tweet" looks like has several
  example tweets that are themselves written in all-lowercase. The AI picks up on that pattern even
  without being told to.

The watchlist issue is simpler: the watchlist field in Settings is currently just decoration — it's
saved, but nothing in the app ever actually reads it. The repost feature has no idea it exists.

### What I'll change
**Fix the lowercase problem:**
1. Rewrite your Voice description to drop "lowercase-friendly" and add a clear instruction to use
   normal capitalization instead.
2. Do the same for the app's default template, so this doesn't happen again for any new profile.
3. Fix the handful of all-lowercase example tweets in the reference file to normal capitalization
   (keeping the content/style, just fixing the casing).
4. Add a standing rule to Koel's instructions: always use normal sentence capitalization unless you
   explicitly turn on all-lowercase mode yourself (there's already a hidden toggle for that, currently
   off).

**Fix the watchlist problem:**
1. Make the repost feature actually check your watchlist. When it's picking which viral posts to draft
   quote-reposts for, posts from your watchlist handles now jump to the front of the line, even if
   they're not the single most-viral post that day.
2. Make it work whether you type a bare handle (`elonmusk`) or paste a full link
   (`https://x.com/elonmusk`) — both will match.
3. Update the label in Settings so it's clear both formats work.

### How I'll verify it
- Generate a few real drafts after the fix and check they read in normal case.
- Run a real repost cycle with a test watchlist entry and confirm it gets prioritized.
- Confirm a full profile link matches the same way a bare handle does.
- Clean up any test data afterward. Nothing gets committed — that stays yours to do.

### Verified — real results
- Triggered a real daily drop: all 4 drafts came back in normal sentence case, no lowercase issue.
- Triggered a real repost cycle with a test watchlist handle (the lowest-engagement post of the 6
  candidates) — it correctly jumped to the front of the batch instead of being left out.
- Confirmed the same normal casing held in the repost drafts too.
- Test watchlist entry reverted back to your real 6 handles afterward; all test drafts/history entries
  cleaned up. Nothing committed — that's yours to do when ready.

---
