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
| Save my own post to the Library | `/save <text>` (or send a photo + caption) |
| Rate the newest unrated drafts | `/triage` (or `/triage 20`) — **this is what makes it improve** |
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

---

## Part D2 — Planning the week, images, and your own writing (new)

**The Control Center is now a calendar.** A week grid of everything scheduled across X, LinkedIn and
Substack.
- **Drag** a post to move it to another slot.
- **Click an empty slot** → give it a one-line brief, pick a platform, optionally tick "generate an
  image" → it writes into that slot and files it in the Library.
- **At slot time:** LinkedIn posts itself. **X and Substack arrive in their own Telegram channel**,
  copy-ready, with a **"Posted ✅"** button — tap it once you've posted, it's what teaches the voice.

**The Library** (`/library`) holds every finished post: editable, with full version history. Change
anything and hit save — the old version is always restorable. From here you can also **"Adapt for"**
another platform, which rewrites the idea properly for that platform rather than reformatting it.

**The Studio** (`/studio`) is where you make a post by hand. One page, three panels, left to right:

1. **Content** — write it, paste it, or type a one-line brief and hit Generate. Pick the platform
   first; the preview below shows how it splits and flags anything over length.
2. **Picture** — **Generate** one from the post, **Upload** your own (drag, paste or browse), or
   **Gallery** to pick something you made earlier on the Image page. That last one is how a picture
   made separately gets clubbed with the text.
3. **Publish** — **Save to library** (⌘/Ctrl+Enter), then **Schedule** it into a slot or **Send to
   Telegram now**. There's also version restore and "rewrite for another platform" once saved.

Opening anything from the Library reopens it here with all three panels filled, so editing works
exactly like creating. (The old `/compose` page is gone — it redirects here.)

**Your own writing** — the Studio, or straight from Telegram:
- Send a **photo with a caption** → saved to the Library with the image attached.
- Send **`/save <your post>`** → saved as-is.
- Start either with `linkedin:` or `substack:` to pick the platform (default is X, or Substack in
  Heron's chat).
- **It is never rewritten.** If house style would change something, you're told what and offered the
  change — you decide.

**Images** are generated from the post's meaning, not its words: a post about discipline becomes worn
running shoes by a door, not a picture of a clock. Style lives in `config/imageStyle.js` — edit that
file to change how every image looks. Approve or reject them; once ~15-20 are approved that set can
train a model on your actual look.

**The Writer box takes a brief, not just a topic.** Type a bare topic and it works as before. Type
what you actually want — *"600 words on morning routines, second person, as a numbered checklist,
no citations"* — and it is obeyed: length, structure, person, tone and what to leave out all
outrank the house template. (Previously the whole sentence became the article's title and was fired
at GitHub/arXiv as a search query, which is why typed requirements were ignored.) A clean keyword
topic is extracted separately for research. **Shift+Enter** for a new line, **Enter** to write.

**Stop.** While it's writing, the button becomes 🛑 **Stop**. It aborts the model call for real —
it stops costing money — and keeps whatever was written as a saved version you can open, edit or
rewrite. A stopped Substack article never sends a Telegram approval card.

**Titto remembers, and reads links.** It keeps the last 24 turns, so "make it shorter", "do that for
LinkedIn instead" or "write it now" resolve against what you just discussed. Paste any article link
(Substack, blog, docs) and it fetches and reads the real page — ask what it says, discuss it, then
say "write one like this" and the piece is passed to the writer as reference material. X links still
go through the tweet reader. Titto can also now reach **Heron** (say "substack"/"newsletter") and
**image generation** ("make an image of…"), which it previously could not.

**Article preferences** (Settings) control how articles get written — length, structure, the hook
rule, links, voice, anti-slop list — split per section for X and Substack. Above them sits
**Learned from your edits**: every time you refine an article, that instruction is kept and distilled
into standing rules the writer must follow. Delete any rule that's wrong, or add your own (yours get
pinned and survive re-learning). Hit **Re-learn** after a few refines to update them.

**Per-platform keywords** live in Settings — what Raven should weight higher for each platform, plus
a "check against research" tool that tells you whether your keywords match what's actually being
found today.

**Content strategy** (Settings, above keywords) is now the one place that decides what the account
is *about*. Positioning line, three pillars (AI · Self-help · Wellness) with their domains and
keywords, and the never-include list. Edit it there and the next research run picks it up — research
ranking, the topic filter, the daily thread themes and which reposts qualify all follow it. AI takes
a thread slot every day; self-help and wellness alternate in the second slot.

**When a drop feels off**, open the Raven page and expand **"Filtered out"** on that run. If good
items are in there, widen the pillars. If it's empty but the drop was still thin, the sources were
short that day — not the filter.

**Rate your drafts.** `/triage` sends the newest unrated ones with one-tap buttons. This is the only
signal the system learns from — approvals, rejections (with a reason) and edits are what sharpen the
next drop. Ignoring them means the volume goes up and the quality doesn't.

---

## Part E — Where things live
- **Dashboard panels:** Control Center (calendar), Queue, **Studio** (make a post: text + picture +
  schedule), **Library** (everything you've made), Raven (research), Reply Targets (I2C posts to reply to), Koel (write + history),
  Quill (pillars + plan + 🔎 Latest search), Writer (articles), Titto (chat + activity), Logs.
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
- **3:00 PM** — Raven research + briefing
- **3:45 PM** — daily drop (6 posts + 2 reposts + 3–5 article ideas)
- **6:00 PM** — fresh research
- **Sunday 6 AM** — weekly wrap + performance nudge
