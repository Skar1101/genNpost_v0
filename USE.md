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
   [Scheduler] Cron jobs armed — research 3:00 PM & 6:00 PM IST · drop 3:45 PM IST · weekly Sun 6 AM IST
   ```
3. **Open the dashboard** at http://localhost:3000 (hard-refresh: Ctrl+Shift+R).
4. **Check your profile** — send `/profile` in Telegram → confirm @skar_connect, goal by 2026-12-31, 3 best tweets.

> The app must stay running for the scheduled drop to fire. If you restart after 3:45 PM IST, it
> **auto-delivers the missed drop ~8 seconds after boot** (or send `/drop` any time).

---

## Part B — Daily routine (~5 min, in Telegram)

5. **3:00 PM IST — briefing** arrives (one short message: top picks). Skim it.
6. **3:45 PM IST — the daily drop** arrives: **6 posts** (✍️ Motivational, 🌐 Domain, 🔥 Trending) + **2
   quote-reposts** + **3–5 article ideas** (tap a number to auto-write). Every draft has buttons.
7. **Triage each draft (one tap):**
   - ✅ **Approve** → files it in your queue
   - ❌ **Reject** → pick a reason chip (teaches it what to avoid)
   - ✏️ **Edit** → reply with your fixed version (strongest learning signal)
   - 📋 **Copy** → get tap-to-copy text
8. **Post the keepers** — send `/queue`, copy an approved draft, paste into X yourself.

---

## Part C — Quick responses on Telegram (the fast way)

**The one rule for speed:** use **slash commands**. They skip the AI "what did you mean" step, so they respond
**instantly and cost nothing**. Plain-English messages also work, just a bit slower. (Type `/` in Telegram to
see the menu.)

**"I want to…" → type this:**
| You want | Command |
|---|---|
| Today's whole drop now (posts + reposts + ideas) | `/drop` |
| Just today's post drafts | `/batch` |
| Quote-reposts of the day's viral posts | `/reposts` |
| Article ideas I can tap to auto-write | `/ideas` |
| Reply to a specific X post | `/reply <paste link or tweet text>` |
| A list of posts worth replying to | `/replies` (widen: `/replies investment, world cup`) |
| Fresh research right now | `/research` |
| A full article on a topic | `/article <topic>` |
| Focus research on a topic for a while | `/focus <topics>` (undo: `/focus off`) |
| See what's working | `/learned` |
| Log this week's tweet stats | `/perf <paste tweets + numbers>` |
| Approved / pending drafts | `/queue` |
| Today's research results | `/latest` · system health: `/status` |
| Everything Titto can do | `/help` |

**Replies — fastest path:** `/reply` then paste **either** the tweet link **or** its text. If a link comes
back empty (X blocks some lookups), just **paste the tweet text** — that always works.

**Article ideas → tap a number:** `/ideas` sends titles with **[1] [2] [3]…** buttons. Tap one → Titto writes
the full article in the background (reusing today's research) → pings **"✅ Article ready"** → review/edit in
the Writer tab.

**When Titto asks you a question:** a bare topic (e.g. "write about AI agents") may trigger **1–2 quick
questions** to sharpen the post. Answer in one line, or reply **"just write it"** to draft immediately.

---

## Part D — Make it sound more like you (the learning loop)

The voice + research sharpen from your actions:
- **Rate everything** — an untouched draft teaches nothing.
- **Edit instead of rejecting when close** — your edits become voice examples.
- **Reject with honest reasons** — it won't repeat those angles.
- **Feed weekly numbers** — `/perf <paste your top & bottom tweets + stats>`, then `/learned` shows what's
  landing (hooks, formats, topics) and biases research toward it.
- **Add new wins** — when a post does well, add it to your best tweets (`profile.json`, or ask Titto).

---

## Part E — Where things live
- **Dashboard panels:** ChitraG (research), Reply Targets (I2C posts to reply to), Koel (write + history),
  Quill (pillars + plan + 🔎 Latest search), Writer (articles), Titto (activity), Logs.
- **Your data:** `state/data/accounts/skar_connect/` — `profile.json`, `approved-drafts.json`,
  `rejected-drafts.json`, `draft-queue.json`, `insights.json`, …
- **Status / roadmap:** `IMPLEMENTATION.md` · **This guide:** `USE.md`.

---

## Part F — If you get NO response
1. **Is the server running?** Titto only works while the app is up. If it was restarted or the machine slept,
   start it again (`npm start`).
2. **Scheduled drop didn't arrive?** It only fires if the server is up at 3:45 PM IST. Get it any time with
   `/drop`.
3. **A command did nothing?** Re-send it; check the Logs panel if it keeps failing.

---

## Schedule (IST)
- **3:00 PM** — ChitraG research + briefing
- **3:45 PM** — daily drop (6 posts + 2 reposts + 3–5 article ideas)
- **6:00 PM** — fresh research
- **Sunday 6 AM** — weekly wrap + performance nudge
