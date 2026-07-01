# TinySparrow — How to Use It (step by step)

The one rule: **TinySparrow drafts; YOU post.** It never posts, replies, likes, or retweets on your X
account. "Approve" only files a draft in your local queue — you copy and post manually.

---

## Part A — Get it running (one-time, ~2 min)

1. **Restart the server** (required after code changes):
   ```
   npm start
   ```
   *(or `node server/index.js`)*
2. **Confirm it's up** — you should see:
   ```
   🐦 TinySparrow running at http://localhost:3000
   [Telegram] Bot initialized
   [Scheduler] Cron jobs initialized — 6:30am research, 6:45am batch, 6pm research, Sunday weekly
   ```
3. **Open the dashboard** at http://localhost:3000 (hard-refresh: Ctrl+Shift+R).
4. **Check your profile** — send `/profile` in Telegram → confirm @skar_connect, goal by 2026-12-31, 3 best tweets.

---

## Part B — Daily routine (~5 min, in Telegram)

5. **6:30 AM — morning briefing** arrives (one short message: top 3 picks). Skim it.
6. **6:45 AM — drafts arrive** in 3 batches × 5 (✍️ Motivational, 🌐 Domain, 🔥 Trending), every draft with buttons.
7. **Triage each draft (one tap):**
   - ✅ **Approve** → files it in your queue
   - ❌ **Reject** → pick a reason chip (teaches it what to avoid)
   - ✏️ **Edit** → reply with your fixed version (strongest learning signal)
8. **Post the keepers** — send `/queue`, copy an approved draft, paste into X yourself.

---

## Part C — On-demand, anytime (talk to Titto)

9. **Write a post:** type plainly, e.g. *"write a short post about shipping solo with AI"* → drafts with buttons.
10. **Find tweets to reply to (growth):** `/replies` → I2C-ranked posts. Widen one run: `/replies investment, world cup`.
11. **Other commands:** `/research` (fresh research) · `/quill` (plan around pillars) · `/profile` · `/queue` · `/status` · `/help`.

---

## Part D — Make it sound more like you (the learning loop)

The voice sharpens from your actions:
12. **Rate everything** — an untouched draft teaches nothing.
13. **Edit instead of rejecting when close** — your edits become voice examples.
14. **Reject with honest reasons** — it won't repeat those angles.
15. **Add new wins** — when a post does well, add it to your best tweets (`profile.json`, or ask Titto).

---

## Part E — Where things live
- **Dashboard panels:** ChitraG (research), Reply Targets (I2C posts to reply to), Koel (write + history), Quill (pillars + plan), Logs.
- **Your data:** `state/data/accounts/skar_connect/` — `profile.json`, `approved-drafts.json`, `rejected-drafts.json`, `draft-queue.json`, …
- **Status / roadmap:** `IMPLEMENTATION.md` · **This guide:** `USE.md`.

---

## Schedule (IST)
- **6:30 AM** — ChitraG research + morning briefing
- **6:45 AM** — Quill daily batch (15 drafts)
- **6:00 PM** — fresh research
- **Sunday 6 AM** — weekly wrap
