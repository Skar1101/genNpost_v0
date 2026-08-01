# TinySparrow — Implementation Tracker

Living status of turning Titto into a self-improving, Telegram-first X content engine.
Goal: **minimize human time on research → ideation → drafting; final post/edit decision always stays human.**
Optimize **consistent quality + engagement; virality is a byproduct, never the direct target.**

> ⛔ **HARD STOP — never automate the X account.** The system must NEVER post, reply, comment, like, or
> retweet on/from @skar_connect, automatically or otherwise. It is **draft-only**; all posting and
> engagement is done manually by Souvik. There is intentionally **no X write capability in the codebase**,
> and none may ever be added. "Approve" only files a draft in the local queue — it touches nothing on X.

Guardrails: human-approve before posting · **draft-only, zero auto-actions on X (hard stop above)** ·
native in Titto (no framework rewrite) · account-keyed from day one ·
Telegram primary, web UI as dashboard · keep the feedback loop frictionless (one tap) · don't grow maintenance sprawl.

Legend: ✅ done · 🟡 partial · ⬜ not started

---

# 📋 The Plan — read this first

*(Everything below this point through "Detailed technical log" is the human-readable master plan.
The sections after that are the detailed build history — dates, file paths, verification notes —
kept for reference, not required reading.)*

## What TinySparrow is
A personal, **draft-only** social media manager. A team of AI agents researches trends, writes posts
in your voice, and learns from what you approve/reject/edit — you always make the final call and post
everything yourself. It runs two ways today: a Telegram bot (the fast, daily-use surface) and a web
dashboard (the deeper view). The dashboard is currently being rebuilt from a single HTML file into a
proper app — that rebuild is most of what's "in progress" below.

## ✅ Done

**The content engine (the part that actually researches and writes):**
- A research agent (**Raven**) pulls from Hacker News, Reddit, GitHub, YouTube, arXiv, and X, ranks
  what's worth posting, and balances the mix (~60% personal/human topics, ~40% tech) to match your voice.
- A writer (**Koel**) drafts posts in five formats (short, thread, long-form, motivational, engagement),
  reading your profile, voice, and past approvals/rejections before every draft — it never repeats an
  angle you've rejected.
- A content-ops agent (**Quill**) assembles the daily drop (6 posts + 2 quote-reposts + article ideas),
  runs the weekly wrap, and plans posts against your content pillars.
- A dedicated **Article Writer** streams full long-form articles live, with citations, version history,
  and `.md` export — separate from Koel so tweet-voice never leaks into essay-voice.
- A learning agent (**Analyst**) tracks which sources/topics/formats actually land (from your
  approve/reject/edit history and pasted tweet stats), and feeds that back into both research and writing.
- A reply engine drafts replies to specific posts on demand — nothing is ever auto-drafted or auto-sent.
- **The learning loop**: every draft moves through `generated → approved/rejected/edited → posted →
  measured`. Approvals and edits sharpen future drafts; rejections (with a reason) are never repeated.
- **Telegram**: one-tap Approve/Reject(+reason)/Edit/Copy on every draft, daily drop delivery, on-demand
  commands (`/research`, `/drop`, `/batch`, `/replies`, `/article`, `/perf`, `/learned`, `/health`, …).
- **Reliability**: dead-source detection (`/health`), a missed-drop safety net (catches up automatically
  if the app was asleep), and one shared rate/cost limit across every AI call so nothing runs away.
- **Security**: the server only listens on localhost by default, path-traversal and webhook-forgery
  protections are in place, and secrets never touch git.
- **The hard stop is real** — there is no code path anywhere that posts, replies, or engages on X
  automatically. Every draft requires a manual tap from you before it exists in your approved queue,
  and posting itself is always done by hand.

**The new professional dashboard (this month's work):**
- A full React web app (in `web/`) is built and verified against real data: a **Control Center** home
  showing the whole team's live status, a **Queue** you can triage from, and a dedicated page for every
  agent (Titto, Raven, Koel, Quill, Article Writer, Analyst) plus **Schedules** and **Settings**.
- Titto now lives as a small floating chat bubble on every page (talk to it anytime) plus its own page
  showing the full run history — every research pull, draft, and reply, what triggered it, what it produced.
- The research agent was renamed **ChitraG → Raven** throughout the whole codebase.
- Found and fixed two real bugs along the way: Control Center's buttons weren't wired to anything, and
  one AI call (Titto's message-understanding step) had no rate/cost limit on it.
- The project moved to a new private GitHub repo, with a deployment guide (`DEPLOY.md`) ready to go.
- **Live `/drop` test confirmed** — triggered from Telegram, works correctly. The one remaining
  question from Phase 6 (live WebSocket updates) is now closed.

**Dashboard restoration + refinement pass (2026-07-19 → 2026-07-20):**
- Fixed a top-bar bug where every page literally showed placeholder/fake text instead of real data.
- Raven gained back its Logs view and a click-to-open result-detail modal (parity with the old dashboard).
- Quill gained back Generate Today, Weekly Run, a Write Article shortcut, a Latest Search card, and
  Previous Plans history — all wired to backend endpoints that already existed but had no UI.
- Koel gained a Reload Files button, an adjustable draft-count input (was hardcoded to 3), and an
  Analyst "what's working" summary link.
- Titto's activity page and Article Writer's control panel were rebuilt to match the old dashboard,
  including two real bugs found and fixed (References not rendering; a layout wrap bug).
- Found and fixed a real content-quality bug: every AI-written draft was coming out **all-lowercase** —
  traced to leftover template text in the voice profile plus lowercase examples in Koel's reference
  file. Both fixed, plus a standing casing rule added so it can't silently regress.
- The repost feature now **prioritizes your watchlist handles** (Settings) — previously that field was
  purely decorative and nothing read it. Works with a bare handle or a full profile link.
- The daily Telegram drop was restructured from 3 topic-buckets (6 posts/day) to a **"4-4-4" shape**:
  2 long-form + 2 short-form posts, 4 reposts (up from 2), 4 article ideas — plus a length-safety flag
  so an over-280-character short post is visibly marked instead of silently sent broken.
- Added an **Expenses** tab (Settings) — every agent's LLM spend is now actually tracked and shown
  day-by-day; before this only the Article Writer's cost was ever recorded.

## 🔲 What's left, in order
1. **Switch over**: once you've used the new dashboard a bit and I'm confident nothing's missing, make
   it the only dashboard (retire the old single-file one).
2. **Put it on a server**: right now it only runs while your laptop is on. `DEPLOY.md` has a ready,
   free hosting plan (Oracle Cloud) — this makes it run 24/7 regardless of your laptop.
3. **Heron · Substack — built and verified live** (see Phase 8, 8b, and 8c below): search article
   topics, write Substack-format articles + an image prompt, write short Substack Notes, hand off a
   ready-to-paste post the moment you approve it, now with its own independent automation schedule/
   toggle (off by default). Still no auto-posting — Substack has no official API for it, and the last
   manual click always stays yours (this was re-confirmed after you asked about a RapidAPI-based
   auto-post — no such key-based option actually exists, see Phase 8b for the full reasoning). **Needs
   from you**: you already have a chat id for Heron's channel — since you kept the same bot (no second
   BotFather bot), just drop `HERON_TELEGRAM_CHAT_ID` into `.env` and leave `HERON_TELEGRAM_BOT_TOKEN`
   empty (see Phase 8c) — Heron's Telegram delivery stays off until then (drafts still land in the web
   Queue either way); flip "Heron auto-runs" on in Schedules once you're ready for it to run itself
   Tue/Fri. One quality item to look at: Heron's test article came in short (485 words vs. the 900-2200
   target) — everything else about it was right, just undershot length; worth a prompt tweak. Manual
   queue (paste your own
   post, Heron still preps an image prompt) is designed but not built yet — next up.
4. *(Later, not started)* Parrot · LinkedIn — deliberately deferred until Heron is solid.

## 🙋 Things needed from you
- **Restart the server** so it picks up everything built recently — it doesn't update itself while running.
- **Try the new dashboard** (`web/` — ask me how to start it if you haven't) and tell me anything that
  feels off or missing.
- **Decide on the server**: is the Oracle Cloud VM already set up from before, or do we need to create
  one? And do you want it live now, or after you've used the new dashboard more?
- *(Ongoing)* Paste your weekly top/bottom tweet stats with `/perf` so the learning loop has real numbers.
- *(Optional)* Reddit API credentials, for more reliable Reddit data (it works without them today).

---

## Detailed technical log

*(Everything from here down is historical build detail — dates, exact file paths, verification steps —
for reference. If you just want to know where things stand, the section above is complete on its own.)*

## Phase status at a glance

| Phase | Title | Status |
|---|---|---|
| 0 | Simplify & harden sources | ✅ done |
| 1 | Framework backbone + account profile | ✅ done |
| 2 | Feedback loop (approve/reject/edit) | ✅ done |
| 3 | Learned voice + profile onboarding | 🟡 partial |
| 4 | Weekly performance loop + tweet analysis | ✅ done |
| 5 | Craft upgrades (interview-first, reactive skeleton, thread rules) | ✅ done |
| — | Security hardening | ✅ done |
| — | Professional React dashboard v1 | ✅ done |
| — | Dashboard restoration + refinement pass | ✅ done |
| 8 | Heron · Substack integration | ✅ done (1 quality follow-up flagged: article length) |
| 8b | Heron · dedicated bot + independent automation | ✅ done (manual queue deferred to next) |
| 8c | Heron Telegram · same-bot, second-chat mode | ✅ done |
| 9 | Editable schedule times (Raven/Quill daily slots) | ✅ done |
| 10 | Daily-drop content quality pass + Heron daily + Heron 1-liner hand-off | ✅ done |
| 11 | /chatid helper + Heron Telegram delivery diagnosis | ✅ done |
| 12 | Deactivate evening research + weekly wrap; Heron tracks Quill's drop time | ✅ done |

---

## Phase 0 — Simplify & harden sources ✅
- [x] Drop failing RSS aggregators (news, ai_research, wellness) — deleted `tools/fetchNews.js`, `fetchAIResearch.js`, `fetchWellness.js`
- [x] Keep reliable API sources: Hacker News, GitHub, YouTube, Twitter/X
- [x] Wire in arXiv API (`tools/fetchArxiv.js`) + fix its long-broken `+OR+` query bug
- [x] Reddit → OAuth path (`oauth.reddit.com`) with token caching
- [x] Reddit → **public RSS fallback** (single multireddit `/r/a+b+c/hot/.rss`) when no OAuth creds — works today; auto-upgrades to OAuth when creds added
- [x] Update references (`sources.config.js`, Titto source map, ranking/intent/plan prompts, UI filter/CAT_META/log tabs)

## Phase 1 — Framework backbone + account profile ✅
- [x] `state/accounts.js` — account-keyed paths, active account (`souvik`), multi-tenant-ready
- [x] `state/memory.js` — unified stores (profile, voice-examples, approved/rejected drafts, performance-log, trend-log, draft-queue) + `loadContext()`
- [x] Draft-lifecycle state machine: `generated → queued/rejected/edited → posted → measured` (transitions mirror into memory)
- [x] `state/profileSeed.js` — seeded creator profile (name, niche, voice do/don'ts, pillars)
- [x] API: `GET/PUT /api/profile`, `GET /api/queue`, `POST /api/draft/:id/transition`, `GET /api/memory`

## Phase 2 — Feedback loop ✅
- [x] Koel **read-before-write**: injects profile + voice + approved + rejected (`buildContextBlock`); never repeats a rejected angle
- [x] Koel registers every draft into the lifecycle queue; returns `draftRecords` (ids)
- [x] Web UI: Approve / Reject(+reason) / Save-edit on each Koel draft card → `/api/draft/:id/transition`
- [x] Telegram: one-tap inline Approve / Reject(reason chips) / Edit(reply) via `telegram.getDraftSender()` + `callback_query` handling
- [x] Wired draft delivery through server → scheduler (daily batch) → Titto (`write_post`, `write_from_list`)
- [x] Titto commands: `/profile`, `/queue`

## Phase 3 — Learned voice + onboarding 🟡
- [x] Voice **does** learn from approved/edited drafts (they feed back into the prompt)
- [x] `/profile` shows profile + what's still missing
- [x] **Best tweets calibrate voice on day one** — `profile.bestTweets` (string or `{text,url}`) inject as the gold-standard voice section in Koel's context (`buildContextBlock`)
- [x] **Profile filled** (account `skar_connect`): handle @skar_connect, audience, goal 20K by **2026-12-31**, baseline 1100/100, 3 best tweets, 6 watchlist handles, draft-only policy. `/profile` shows complete ✅
- [ ] (Deferred) Dedicated profile-editor panel in the web dashboard (API already supports it)
- [ ] (Optional) Periodic "distill voice-examples → compact voice prompt" step

## Telegram content automation — lean daily drop (2026-07-06, verified)
Goal: cut time on X. Replies automation stays web-only. **All automation reuses the ONE scheduled daily
research run — no ad-hoc searches; fresh search is manual via Quill.** Everything draft-only (hard stop intact).
- [x] **Schedule moved to afternoon** — research **3:00 PM IST** (`30 9 * * *`), daily drop **3:45 PM IST**
  (`15 10 * * *`). Evening research (6 PM) + Sunday weekly unchanged.
- [x] **Volume config** — new `config/contentVolume.js` (`posts.perSection`, `reposts.perDay`,
  `articleIdeas.count`). **Daily batch resized 15 → 6** (3 buckets × 2) via `assignTopics`; feedback loop intact.
- [x] **Domain filter** — research now biases to the **profile niche** (pillar labels) by default via
  `analyst.researchInstructions()` (profile focus + learned focus + learned downweight), fed into scheduled
  Raven runs. **`/focus <topics>` / `/focus off`** override (`state/focusStore.js`) — "area of interest until
  I say otherwise."
- [x] **2 value-add quote-reposts/day** — `prompts/koelRepost.js` + `koel.draftRepost` (composes comment + post
  URL into a ready-to-quote-tweet draft) + `quill.runReposts` (picks top-engagement X items already in the
  research — **no new API calls**). Delivered to Telegram with Approve/Reject/Edit/Copy. On-demand: **`/reposts`**.
- [x] **Article idea picker → auto-write** — `quill.suggestArticleIdeas` produces N ideas from the day's
  research (each tied to its source item), saved to `state/articleIdeasStore.js`; Telegram shows numbered
  **tap-to-write buttons** (`aw|<idx>`). Tapping → background `quill.writeArticleFromIdea` → `articleWriter`
  (reuses the day's research as `relatedItems`, **no fresh search**) → saves versioned article → **"✅ Article
  ready" ping** (open in the Writer to review/edit/export). On-demand: **`/ideas`**. **DeepSeek V3** is the
  article default (`config/models.js articleDefaultModel()`, falls back to gpt-4o-mini without an OpenRouter key).
- [x] **Daily drop folds all three** into `scheduler/cron.js runBatch`: **6 posts · 2 reposts · N article ideas**
  at 3:45 PM (guarded by `isEnabled()`).
- [x] **Cost:** ≈ flat (the 15→6 cut offsets reposts+ideas); DeepSeek articles ≈ $0.005 each; **zero extra
  RapidAPI calls** (all reuse the daily research run).
- [x] Verified: batch count follows config, `/focus` override + revert, `/reposts` drafts 2 (comment+link),
  article picker writes from the day's research with DeepSeek V3 and reuses `relatedItems` (no fresh search),
  new commands route on web+Telegram, server boots clean. **Needs from Souvik:** restart server + hard-refresh.
- [x] **Missed-drop safety net** (2026-07-06) — `node-cron` never replays missed jobs, so a restart/sleep at
  3:45 PM silently loses the day. Fixed: `scheduler/dailyDrop.js` holds the shared drop (posts+reposts+ideas);
  `schedulerStore` tracks `lastDrop` (IST date, idempotency key); on startup `maybeCatchUp` runs the drop **once**
  if it's past 3:45 PM IST and today's drop hasn't run (guarded by `lastDrop`, `isEnabled`, and research
  existing). New **`/drop`** command runs the full drop on demand (web+Telegram). Startup logs the armed schedule
  + IST now + last drop. **So restarting to load new code also auto-delivers a missed drop ~8s after boot.**

## Reliability pass (2026-07-07) — stop silent failures
Prompted by recurring "it didn't work" reports. Audited the whole pipeline; fixed real breakage + made failures visible.
- [x] **HackerNews was fully dead** — HN Algolia now rejects `points` in `numericFilters` (HTTP 400 on every
  query, silently returning 0 for days). Fixed `tools/fetchHackerNews.js`: keep server-side `created_at_i`
  recency filter, drop `points`, apply the points≥5 floor client-side. Verified: returns real items again.
- [x] **Drop guarantees today's research** — `scheduler/dailyDrop.js ensureTodaysResearch()` runs one fresh
  Raven search if the latest run isn't from today (fixes stale `/drop` + stale Quill after a missed 3 PM run).
- [x] **Auto catch-up every 30 min** (not just on startup) — a laptop that wakes after 3:45 PM with the server
  still running auto-delivers the drop (`scheduler/cron.js`). Idempotent via `lastDrop`.
- [x] **`/health` command** — surfaces silent failures at a glance: research freshness (today/stale), **per-source
  item counts + DEAD sources** (0 items), scheduler on/off + drop-today, and which API keys are set.
  Backed by new `sourceCounts` in the research run output (`agents/chitrag.js`) so a source that silently returns
  0 (like HN did) is flagged.
- **Still operational (not code):** the schedule only fires while the process runs — keep it on a 24×7 host (see
  the deployment options) or rely on `/drop` + the 30-min catch-up when you sit down.

## Operational config & fixes (2026-06-28)
- [x] **Schedule retimed** (`scheduler/cron.js`): **6:30 AM** research + compact morning briefing · **6:45 AM** Quill daily batch · **6:00 PM** research · **Sunday 6 AM** weekly wrap. (Morning split into `runMorning` + `runBatch`.)
- [x] **Daily batch = 3 batches × 5 drafts** (15 total): Motivational ×5, Domain ×5, Trending ×5 — each batch one short header + 5 draft messages with buttons (`assignTopics` returns 5/section).
- [x] **Compact Telegram** — `deliverResearch` is now ONE short briefing (top 3 + dashboard link), not 6 messages; Quill intro/source-link chatter removed from Telegram. Drafts stay full. (Principle: Telegram = short signal + drafts; depth in dashboard.)
- [x] **Reply targets (I2C) separated** — own store `state/replyTargetsStore.js` + dedicated **💬 Replies tab** (mirrors Tools) + `GET /api/replies/latest`, `POST /api/replies/trigger` + `reply_targets_complete` event. No longer archived into / overlapping Raven research (`listArchive` excludes `reply-`; leftovers deleted). Current bars: **5000 impressions / I2C 50**.
- [x] **`/batch` command** (Telegram + web chat) — generate today's batch on demand (3×5 = 15 drafts); fetches fresh research first if none. `handleBatch` in `agents/titto.js`.
- [x] **`/batch` web-chat fix** — web route now passes `telegramSend`/`telegramSendDraft` so web-triggered batches reach Telegram; Titto chat posts a "✅ Batch run done" confirmation.
- [x] **Telegram 📋 Copy button** — second button row on every draft; sends the draft as a tap-to-copy code block (`server/routes/telegram.js`).
- [x] **Titto activity tab (control tower)** — new `state/activityStore.js` (bounded log, 200) records one line per agent run (research, reply targets, daily batch, weekly, plan, write, tools) with source/trigger badge, summary, and a ref to open the output. Each agent records + broadcasts a live `activity` WS event; trigger labels threaded from Titto handlers / cron / API. `GET /api/activity`. New **Titto** sidebar tab with a newest-first timeline + Open-to-panel navigation (`public/index.html`).
- [x] **`USE.md`** operator guide created (step-by-step usage).
- [x] **Regression verified** — 29 modules load, 39 routes, 8 Titto commands, 16 GET endpoints all 200.

## Article Writer — dedicated professional writing workspace ✅ (B1–B4)
- [x] **Model layer** — `config/models.js` (registry + per-1M pricing) + `utils/llm.js` (OpenAI-compatible;
  routes via **OpenRouter** when `OPENROUTER_API_KEY` set, else falls back to OpenAI; supports streaming).
- [x] **`agents/articleWriter.js`** — dedicated pipeline: research pull (Raven) + article prompt/template
  + **voice via `buildContextBlock`**, on a **purpose-built article knowledge base** (identity + writing
  principles + long-form template; **excludes** tweet-copy/100K-tweet/engagement knowledge). `generate` +
  conversational `refine`; returns text + usage + **cost** + sources.
- [x] **`state/articlesStore.js`** — one JSON record/article with **version history**; `.md` export with
  YAML frontmatter (`state/data/articles/files/`); `assets/<id>/` reserved for future images.
- [x] **API** — `GET /api/models`, `POST /api/article/generate|refine`, `GET /api/article[/:id]`,
  `POST /api/article/:id/revert`, `GET /api/article/:id/export`. **Streaming** over WS
  (`article_start|token|done|error`). Logged to the Titto activity feed (`agent:'article'`).
- [x] **UI — new "✍️ Writer" tab** (`public/index.html`): **adjustable width**, **line-by-line streaming**
  (marked.js render), references, **stats bar** (words/read-time/citations), **live cost/token readout**,
  **model dropdown**, **Edit→chat-to-rewrite**, **version selector + Make-current (revert)**, Copy, Export .md.
- [x] **`/article <topic>`** Titto command → opens the Writer tab and streams the draft (web).
- [x] Hard stop intact — articles are drafts Souvik exports/posts himself; no X write path.
- [ ] **B5 (later)** — image generation (style/aspect/context) into `assets/<id>/`, embedded in the `.md`.
- [ ] **Needs from Souvik:** add `OPENROUTER_API_KEY` to `.env` to unlock DeepSeek/Claude/GPT (falls back to
  OpenAI/gpt-4o-mini until then). Restart server + hard-refresh.

## LLM cost/safety guardrails ✅
- [x] **`config/guardrails.js`** — env-tunable: `LLM_MAX_RPM` (20), `LLM_MAX_CONCURRENT` (3),
  `LLM_TIMEOUT_MS` (120s), `LLM_MAX_RETRIES` (2), `LLM_MAX_OUTPUT_TOKENS` (4000), `LLM_MAX_WAIT_MS` (30s).
- [x] **`utils/llmGuard.js`** — one shared gate for **every** LLM call: sliding-60s RPM window +
  concurrency semaphore; queues, then fails fast with a clear error past `MAX_WAIT_MS`. Holds the slot for
  the full call (incl. streaming).
- [x] **`utils/llm.js`** (Article Writer) — clamps output tokens to the cap; guard-wrapped; `AbortController`
  hard-aborts at `TIMEOUT_MS` even mid-stream; SDK `maxRetries` capped.
- [x] **Legacy agents routed through the same gate** — `agents/{koel,chitrag}.js` (guard + `maxRetries:0`
  so their own retry loops don't stack), `agents/quill.js` (assignTopics / weekly / plan). One process-wide
  budget shared across Article Writer + Koel + Raven + Quill.
- [x] Verified: concurrency cap holds (peak ≤ limit), RPM overflow fails fast, token clamp 9000→cap, server
  boots clean. Provider split unchanged (legacy = direct OpenAI gpt-4o-mini; Article Writer = OpenRouter).

## Reply engine ✅ (on-demand, draft-only, web + Telegram)
- [x] **Keep the tweet text** — `tools/fetchReplyTargets.js` now retains `fullText` + `author` per candidate;
  `agents/chitrag.js` `findReplyTargets` carries them into each row + the saved `replyTargetsStore` output.
- [x] **Reply writer** — `prompts/koelReply.js` `buildReplyPrompt` (reply not standalone tweet; POV + one
  supporting detail; ≤280; no em dashes; no filler openers) + `agents/koel.js` `draftReply()` (reuses
  `write` so voice/guardrails apply; `origin:'reply'`; logs one `reply` activity entry; no Koel-panel jump).
- [x] **No auto-drafting** — each reply target shows a **"💬 Draft reply"** action; a reply is written only
  when tapped (one cheap Koel call per tapped reply).
- [x] **Web** — `POST /api/replies/draft { url }`; Replies tab shows 💬 Draft reply on each qualifying row →
  inline editable reply card with ✅ Approve / ❌ Reject / 📋 Copy + "Open post to reply ↗" (reuses the draft
  lifecycle `/api/draft/:id/transition`).
- [x] **Telegram** — `/replies` sends the top 8 targets as individual messages each with a **💬 Draft reply**
  button (`rd|<idx>`); tapping drafts the reply and delivers it via `sendDrafts` with ✅/❌/✏️/📋.
- [x] **`/reply <x.com URL | pasted text>`** (web + Telegram) — `handleReplyDraft` in `agents/titto.js`;
  URL → best-effort `tools/fetchTweet.js` (RapidAPI `tweet.php?id=`), else pasted text → draft card.
- [x] Hard stop intact — every reply is a draft Souvik sends himself; no X write path.
- [x] Verified: `/api/replies/draft` → 200 draft; `/reply` acks + broadcasts draft + Telegram send; server
  boots clean. **Needs from Souvik:** restart server + hard-refresh.

## Phase 4 — Weekly performance loop + tweet analysis ✅ (2026-07-04, verified)
- [x] **`agents/analyst.js`** — the learning engine. Three jobs: (1) `computeSourceStats` — deterministic
  per-source/per-topic **win-rates** joined from the draft queue's Phase-5 provenance meta (approved =
  queued/edited/posted/measured, vs rejected); (2) `ingestPerformance` — LLM parses pasted tweets+stats into
  structured rows, best-effort **matches them to posted drafts → `measured`** (else appends to
  `performance-log`); (3) `analyze` — LLM reads performance + approved/rejected + win-rates → extracts
  **what's working** (hooks/formats/topics) + **avoid** + research **focus/downweight**, saved to
  `state/insightsStore.js`. All calls go through `utils/llmGuard`.
- [x] **`/perf <pasted tweets + stats>`** (web + Telegram) — ingest this week's numbers, refresh insights,
  reply with the updated summary. **`/learned`** — show what's landing + the research bias.
- [x] **Koel writes toward what landed** — `loadContext` now includes `insights`; `buildContextBlock` injects a
  **"WHAT IS WORKING"** section (hooks/formats/topics to lean into + avoid list) into every draft prompt.
- [x] **Raven ranks toward what landed** — scheduled morning/evening runs pass `analyst.learnedInstructions()`
  (`focus`/`downweight`) into the ranking prompt (`prompts/rankResults.js` already consumes them). Sources with
  ≥4 decided drafts and <30% win-rate are auto-downweighted.
- [x] **Weekly loop** — Sunday wrap now refreshes insights (`analyst.analyze`) and sends a Telegram **reminder**
  to paste top/bottom tweets with `/perf` (`scheduler/cron.js`).
- [x] Ingest stays **pluggable** — manual paste today; the same `ingestPerformance` rows accept a RapidAPI /
  X-API feed later with no downstream change.
- [x] Verified: source win-rate math (github 100% / reddit 0% → auto-downweight), `/learned` + `/perf` route
  correctly (web + Telegram), insights inject into Koel context, server boots clean.
- **Needs from Souvik:** after a week of posting, paste your top 3 + bottom 3 tweets with `/perf` so the loop
  has real numbers. Restart server + hard-refresh.

## Phase 5 — Craft upgrades ✅ (2026-07-04, verified)
- [x] **Hard formatting rules (house style)** — new shared `prompts/styleRules.js` exports `HOUSE_STYLE_TEXT`
  (no em/en dashes, breathing room, banned AI-slop/corporate words + filler reply openers) + `BANNED_PHRASES`
  (now the single source; `prompts/quillArticle.js` imports it too). Injected into Koel's system prompt.
  Backed by a deterministic `sanitize()` post-pass in `agents/koel.js` that strips em/en dashes (leaves numeric
  ranges like 5–10 intact) and collapses blank-line runs — the safety net for what the LLM slips on.
- [x] **Lowercase = opt-in** voice pref (`profile.voice.lowercase`); default off (`prompts/koelWrite.js`).
- [x] **Reactive skeleton** — short + longform format guides now specify **hook → insight → translation → POV**
  (unlabeled) and require the 3 drafts to take **distinct angles** (`prompts/koelWrite.js`).
- [x] **Stricter thread rules** — tightened to **5–8 tweets**, hook promises a specific payoff, **every tweet
  stands alone**, **exactly one CTA** in the last tweet. Light guard in `agents/koel.js` warns (doesn't fail)
  if a thread returns >10 tweets.
- [x] **Interview-first drafting** — a direct `write_post` with a **thin/bare topic** (no angle) makes Titto ask
  **1–2 targeted questions** first (angle/POV? a concrete example or number?) instead of drafting blind. Rich
  input (angle in extraInstructions, long brief, or a URL) drafts straight away. Pending state keyed by
  `sessionId` → **works in web chat and Telegram**. Escape hatch: "just write it" / "you decide" / empty →
  drafts with auto-angle. **Batch, reply, and article paths never ask** (stay autonomous). (`agents/titto.js`)
- [x] Verified: house-style + sanitizer unit tests pass (dash punctuation replaced, `5–10` preserved, blanks
  collapsed), format guides carry skeleton/thread rules, interview heuristics pass 9 cases, server boots clean.
- **Needs from Souvik:** restart server + hard-refresh.

## Security hardening ✅ (fixed 2026-07-04, verified)
- [x] **#1** Server now **binds `127.0.0.1` by default** (env `HOST`; set `0.0.0.0` for server deploy) — nothing on the
  LAN can reach `/api/*`. Plus an **optional shared-secret gate**: when `API_TOKEN` is set, every `/api/*` request must
  carry it (`Authorization: Bearer`, `x-api-token`, or `?token=`); inert on localhost. (`server/index.js`)
- [x] **#2** Path traversal fixed — `readArchive` now `path.basename()`-sanitizes the filename before joining
  `ARCHIVE_DIR` (`state/researchStore.js`). Verified `../../.env` → null / HTTP 404, no leak.
- [x] **#3** `/api/logs/*` now covered by the same token gate (+ log filenames were already `path.basename`-sanitized
  in `utils/logger.js`).
- [x] **#4** Telegram **webhook secret** — `setWebHook` registers `secret_token: TELEGRAM_WEBHOOK_SECRET`; the
  `/telegram/webhook` handler rejects any POST whose `X-Telegram-Bot-Api-Secret-Token` header doesn't match (403).
  Warns if unset. (`server/routes/telegram.js`)
- [x] Secrets safe: `.env` never committed (only `.env.example`); keys in headers/params, not logged; `state/data`+`logs` gitignored
- [x] **Verified** — 11 checks pass: traversal blocked (unit + HTTP), token gate (401 no/bad token, 200 Bearer/`?token=`),
  logs gated, localhost bind serves, and default no-token localhost mode still open (no regression).
- **For 24x7 server deploy:** set `HOST=0.0.0.0`, `API_TOKEN=<secret>`, and (if using webhook) `TELEGRAM_WEBHOOK_SECRET=<secret>`.
  The browser dashboard will then need to send `API_TOKEN` on its `/api` fetches — small frontend wiring to add at deploy time.

## Professional React dashboard — v1 built ✅ (2026-07-18, verified)
Goal: replace the single-file `public/index.html` dashboard with a proper React app — Control Center
home (team roster + live status), a Queue triage inbox, and one page per agent — without touching any
agent logic. `public/index.html` keeps running unmodified until the new app is verified end-to-end and
explicitly retired (not done yet).
- [x] **ChitraG → Raven rename**, full — file (`agents/raven.js`, was `chitrag.js`), every require,
  internal `agent:'raven'` ids, `logger.source('raven')`, `sub-agents/Raven/`, all UI labels + docs.
  Old `chitrag` history entries (activity log, old log files) intentionally left as-is — historical
  record, not rewritten. Verified live with a real end-to-end research run.
- [x] **`web/`** — new React + Vite + React Router + TanStack Query app (no Tailwind; the approved
  design system ported to `web/src/styles/globals.css`). Dev: two processes — backend
  (`node server/index.js`, port 3000) + `cd web && npm run dev` (port 5174, proxies `/api`+`/ws` to
  3000). Production: `npm run build` in `web/` → served by Express (not yet wired — Phase 7).
- [x] **Control Center** (home) — live team roster (`GET /api/agents`, new: aggregates existing stores,
  zero new agent logic), Titto lead strip with real pending-queue count, working Open/Run-now/Run-drop
  buttons (a real bug — buttons had no handlers at first — found + fixed).
- [x] **Queue** — triage inbox wired to the existing `GET /api/queue` + `POST /api/draft/:id/transition`.
  Approve/Reject(+reason chips matching Telegram's)/Edit/Copy all real. Draft records gained a
  `platform` field (default `'x'`) for future LinkedIn/Substack.
- [x] **9 agent/system pages**, each a real page over already-existing (or newly added) endpoints:
  **Titto** (persistent floating chat dock, all pages, bottom-left + a dedicated history page — every
  run, who triggered it, what came out; replaces the old "Activity" tab), **Raven** (research + full
  Replies sub-view), **Koel** (Write + History), **Quill·X** (pillars, plan, per-suggestion draft +
  refine), **Article Writer** (live token-streaming generate/refine, versions, export), **Analyst**
  (new `GET /api/insights` + a `/perf` paste box reusing Titto's existing chat command), **Schedules**
  (auto-run toggle + slot timeline, new `slots` field on `GET/PUT /api/scheduler`), **Settings**
  (profile editor + reply-domain toggles). Parrot/Heron (LinkedIn/Substack) are placeholders — v2,
  by design, never fake data.
- [x] **LLM guardrail audit** — checked every `chat.completions.create` call site against
  `guard.runGuarded()`. Found one real pre-existing gap: **Titto's ambiguous-message intent-parse call
  was never gated** (no rate limit/concurrency cap/timeout). Fixed in `agents/titto.js`; verified live.
- [x] **Verified live throughout**, not just built: real Koel writes, a real Quill plan run (75s, 10
  suggestions), a real Article generation (3,932 chars), a full profile/reply-domains/scheduler
  round-trip against the actual `state/data`, always on an isolated port with test data cleaned up
  after. Old dashboard + Telegram confirmed unaffected at every step.
- [x] **Live `/drop`-from-Telegram pass** — confirmed 2026-07-19, works correctly. Still open: serving
  the React build from Express + retiring `public/index.html` (Phase 7, deliberately after full parity).

## Repo migration + deploy-doc fix (2026-07-18)
- [x] Moved to a new private repo — `github.com/Skar1101/TinySparrow_social_media_manager_V0` — full
  history pushed, old repo (`TinySparrowV0`, inaccessible/renamed) no longer referenced.
- [x] **Fixed a real bug in `DEPLOY.md`**: the clone URL was updated to the new repo but the
  `cd`/`scp`/cron lines still said the old directory name — would have broken a fresh VM setup.
- [x] `web/dist/` (build artifact) untracked + added to `.gitignore`.
- **`DEPLOY.md`'s Oracle Cloud plan is otherwise unchanged and ready** — Always-Free ARM VM, pm2,
  GitHub-push auto-deploy via `scripts/update.sh`, Telegram polling (no public ports), dashboard via
  SSH tunnel. Not yet executed against a live VM this session.

---

## Dashboard restoration + refinement pass ✅ (2026-07-19 → 2026-07-20, verified live)
Follow-up after the first React dashboard pass — the user reviewed it against the old
`public/index.html` and found real functionality gaps, plus asked for content-quality and daily-drop
shape changes. Everything below was verified against real backend data on isolated test instances
(Telegram disabled, scratch ports), then cleaned up; nothing committed automatically per the standing
autonomy rule.
- [x] **Top-bar crumb fix** — every ported page literally read "existing page — same layout, reskinned"
  (leftover placeholder text) and Control Center/Queue showed hardcoded fake numbers. Now pull real,
  live data (`web/src/lib/nav.js`, `TopBar.jsx`).
- [x] **Raven** — Logs sub-view (Today/Errors/per-source scrape logs) + a click-to-open result-detail
  modal (source/type/score/publisher badges, snippet, "why it matters", Ask Titto/Open Article) —
  restores parity with the old dashboard's modal.
- [x] **Quill** — Generate Today, Weekly Run, a Write Article shortcut, a Latest Search card (mirrors
  Raven's top items), and Previous Plans (collapsible history) — all wired to endpoints that already
  existed but had no UI.
- [x] **Koel** — Reload Files button; **draft-count input** (was hardcoded to 3 — found and fixed a real
  bug where the backend's own "produce N drafts" instruction was contradicted by a hardcoded "3" baked
  into every format's prompt text, so requesting e.g. 2 drafts silently produced 1; also loosened
  `parseDrafts()` to accept a bare `---` separator, not just `--- DRAFT N ---`, since the model
  sometimes drops the label); Analyst "what's working" summary chip + link.
- [x] **Titto activity page + Article Writer** rebuilt to match the old dashboard (colored per-agent
  badges, trigger badges, "Open →" deep-linking; Article Writer's right-side Model/Actions/Versions/
  cost panel). Two real bugs found + fixed: article References never rendered (reading the wrong
  field — sources live at the article-record level, not per-version), and the Past Articles dropdown
  had no width cap and wrapped onto its own row.
- [x] **Content-quality bug: all-lowercase drafts** — traced to two real causes: the creator profile's
  Voice description literally contained "lowercase-friendly" (unedited leftover template text, fed
  into every prompt), and Koel's high-performing-tweet reference file had several all-lowercase
  example passages reinforcing it by few-shot mimicry. Fixed both, plus added a standing casing rule
  to Koel's OUTPUT RULES so it can't silently regress.
- [x] **Watchlist-priority reposts** — `profile.watchlist` (Settings) was previously 100% inert, never
  read by anything. `runReposts()` now prioritizes posts from watchlist handles (matches a bare handle
  or a full profile link) into the repost batch, even when they're not the day's top-engagement post.
- [x] **Daily drop restructured — "4-4-4"** — replaced the 3 topic-buckets (motivational/domain/
  trending, 6 posts/day) with 2 format-buckets: **2 long-form + 2 short-form**, reposts **2 → 4**,
  article ideas unchanged at 4. Added a length-safety flag (`⚠️ N/280`) on any short-form draft that
  still slips past the character target, visible only in the Telegram hand-off text, never in the
  stored draft. `config/contentVolume.js`'s `posts.perSection` renamed `posts.perFormat` to match.
- [x] **Expenses tab (Settings)** — before this, only the Article Writer's LLM cost was ever tracked;
  every other agent's calls were unpriced. Instrumented all 9 previously-untracked call sites
  (`state/costStore.js`, `utils/costTracker.js`), merged with the Article Writer's existing per-article
  cost data, day-by-day totals with a 7/30/90-day view.
- [x] **`IMPLEMENTATION.md` consolidation** — per explicit instruction, all planning/status now lives in
  this single file going forward; the short-lived `IMPLEMENTATION_STATUS.md`/`PLANS.md` companion files
  were merged in here and removed.

## Phase 8 — Heron · Substack integration ✅ BUILT + VERIFIED (2026-07-22 → 2026-07-27)
First real Substack integration — "Heron" was named in the original architecture doc (`docs/PLAN.md`)
but never built. Confirmed requirements: (1) search article topics, write Substack-format articles,
generate a text image-prompt alongside each; (2) short "Notes" (1-2 liners) in the user's niche;
(3) after Telegram approval, prepare everything up to publishing — but the final publish click stays
manual.

**Why not full auto-post, decided deliberately:** investigated before building anything. Substack has
no official publishing API — their own Developer API Terms of Use (Jan 2026) cover read/discovery only;
every "post to Substack" tool that exists is unofficial, reverse-engineered, session-cookie-
authenticated against private endpoints, outside what Substack's terms permit. This codebase has never
made an outbound "post to a platform" call — every existing integration is read-only research or
Telegram (inbound-approved). And the project's own architecture doc already stated the draft-only
principle platform-agnostically, twice, before Substack was ever requested. Given all that, the design
is: **no Substack API calls, no stored credentials** — the system fully prepares content and hands it
off as a ready-to-paste block on Approve; the last click stays the user's.

**Design (build complete, verification pending):**
- [x] `agents/heron.js` (new) — orchestration: topic search (reuses Raven's research, filtered for
  long-form-worthy items via `postPotential`), article writing + refine (wraps `articleWriter.js`),
  image-prompt generation (bundled into the same generation call, no second LLM call), Notes writing
  (via `koel.write({format:'note'})`).
- [x] `agents/articleWriter.js` — optional `platform` param (default `'x'`, zero behavior change),
  branches template/prompt/system-prompt for Substack: `sub-agents/heron/SUBSTACK_ARTICLE_TEMPLATE.md`
  (new, 900-2200 words vs. X's 1500-3500 *characters*) + `prompts/heronArticle.js` (new, kept fully
  separate from `prompts/quillArticle.js` so the tested X prompt can't regress) + a `parseSubstackOutput()`
  helper that pulls SUBJECT/PREVIEW/SUBTITLE header lines and a trailing image-prompt block out of the
  stream.
- [x] `state/articlesStore.js` — additive schema fields only (`platform`/`subtitle`/`subject`/
  `previewText`/`imagePrompt`), every existing X-article file on disk keeps working unchanged.
- [x] `agents/koel.js` / `prompts/koelWrite.js` — Notes as one more `format` branch (like short/thread/
  longform/motivational/engagement already are), reusing all voice/context/retry machinery for free.
- [x] **Hand-off delivery** — on Approve, `sendHeronHandoff()` fetches the full article fresh from
  `articlesStore` (never the short preview stored on the draft) and sends it as clean copy-paste blocks
  — header, body (chunked at paragraph boundaries, since full articles exceed Telegram's 4096-char
  message cap), image prompt. Notes send as a single copy block. **Superseded by Phase 8b below** — this
  logic now lives in Heron's own dedicated bot (`server/routes/heronTelegram.js`), not the main one.
- [x] New `/api/heron/*` routes (topic search, article generate/refine, note write) — X's `/api/article/*`
  routes untouched, reused as-is for list/detail/revert/export since they're already platform-agnostic.
- [x] `web/src/pages/HeronPage.jsx` (new, replaces the `PortedPage` placeholder at `/agent/heron`) —
  Articles section (near-copy of `ArticleWriterPage.jsx`'s layout + a topic-search button + an
  image-prompt card) and a minimal Notes section.
- **Verification: done (2026-07-27), real LLM calls.** Real topic search (6 candidates, none tagged
  `short`), a real Substack article (all fields present — subject/subtitle/previewText/imagePrompt —
  markers correctly stripped from the stored body), a real X-article generated in parallel to confirm
  zero regression (1912 chars, no Substack fields/markers), 2 real Notes (under ~400 chars, no
  hashtags), both draft kinds confirmed landing in the queue as `platform:'substack'`,
  `chunkForTelegram()` unit-tested on a 6498-char sample (2 chunks, both ≤3500, rejoins byte-for-byte).
  All test data cleaned up afterward.
  **One real finding, not yet fixed**: the article came in at **485 words**, well under the
  900-2200-word target in `SUBSTACK_ARTICLE_TEMPLATE.md` — everything else about it was correct (voice,
  structure, citations), the model just undershot length. Worth a follow-up prompt tweak (e.g. a
  stronger minimum-length instruction, or a length check + one automatic re-ask) — flagging here rather
  than fixing unprompted since it's a quality tweak, not part of what was asked this round.

---

## Phase 8b — Heron: dedicated Telegram bot + independent automation ✅ BUILT + VERIFIED (2026-07-27)
Follow-up to Phase 8, after using it for a bit. Three asks: (1) automate actual Substack *posting* —
asked specifically about a RapidAPI key; (2) have Heron run automatically the way Quill does; (3) give
Heron its own Telegram channel; (4) a manual queue for human-written posts. **Scope note: the manual
queue (4) was explicitly pulled out of this pass** — "stop the manual section, go ahead other section,
we will do manual section update next" — it's designed (see the plan file) but not built; comes back as
its own follow-up.

**On auto-posting (1) — researched, then parked by explicit choice.** No stable, ToS-safe, API-key-based
Substack publish endpoint exists anywhere, including RapidAPI — every RapidAPI Substack listing is a
read-only scraper (profile/post/comment data), not a publisher. The only way to actually auto-publish is
an unofficial, reverse-engineered client authenticated with the user's own Substack *session cookie*
against private internal endpoints — not an API key, outside Substack's Terms of Use, liable to break or
draw account action any time Substack changes something internally. Presented this plus the realistic
options directly; **the user chose to park the actual auto-publish decision** and have everything else
built now. The draft-only hard stop from Phase 8 is fully unchanged — no Substack credentials of any
kind are stored anywhere in this codebase.

**Locked decisions:** (1) auto-post/publish parked, no credentials stored; (2) image generation stays
text-prompt-only (no DALL·E, no added cost); (3) Heron gets its **own independent cron schedule + its
own on/off toggle**, decoupled from Raven/Quill's shared toggle; (4) Heron gets a **brand-new, separate
Telegram bot** (own token/identity), not a second chat on the existing bot.

**Design (build complete, verification pending):**
- [x] `server/routes/telegramCore.js` (new) — extracted the closure-free helpers both bots need
  identically (`actionKeyboard`, `reasonKeyboard`, `REASONS`, `escapeHtml`, `stripHeader`,
  `chunkForTelegram`) out of `telegram.js`, so nothing is duplicated between the two bots.
- [x] `server/routes/heronTelegram.js` (new) — Heron's own bot, boots from
  `HERON_TELEGRAM_BOT_TOKEN`/`HERON_TELEGRAM_CHAT_ID` (same optional no-op guard as the main bot if
  unset). Owns `sendDrafts()`, the full `d|a/d|r/d|rr/d|c/d|e/d|b` approve/reject/edit callback
  dispatch, and `sendHeronHandoff()` (moved here from `telegram.js` — hand-off only ever concerns Heron
  drafts). Edit stays Notes-only; articles still redirect to "open the Heron page."
- [x] `server/routes/telegram.js` — stripped of all Heron-specific code (`sendHeronHandoff`, the
  substack-platform branch in the Approve/Edit callback handlers); now imports its shared helpers from
  `telegramCore.js` instead of defining them locally. Zero behavior change for X/Quill/Koel drafts.
- [x] `server/index.js` — boots both bots; `app.locals.telegramSendHeronDraft` /
  `telegramSendHeronHandoff` now come from `heronTelegram.js`.
- [x] `server/routes/api.js` — the `/api/heron/article/generate` and `/api/heron/note/write` routes now
  read `telegramSendHeronDraft` instead of the shared `telegramSendDraft`, so every Heron-originated
  draft always reaches the Heron channel, never the main one. `POST /api/draft/:id/transition` (the web
  Queue's Approve button) needed no change — it already read `telegramSendHeronHandoff` from
  `app.locals` generically.
- [x] `state/schedulerStore.js` — added `heronEnabled` (default **false**, opt-in — unlike the existing
  default-on `enabled`) and `heronLastRun` (same idempotency-stamp shape as `lastDrop`), purely additive
  via the existing merge-patch `writeRaw()`.
- [x] `scheduler/heronDrop.js` (new) — mirrors `scheduler/dailyDrop.js`'s shape: `runHeronDrop()` reuses
  `dailyDrop.ensureTodaysResearch()` (so it never redundantly re-searches when Raven already ran earlier
  the same day), then `heron.searchTopics()` → `heron.writeArticle({idx:0})` → `heron.writeNote({count:2})`,
  stamping `heronLastRun` on success. `maybeCatchUp()` mirrors the daily version, gated on both the
  `heronEnabled` toggle and being a Heron day (Tue/Fri).
- [x] `scheduler/cron.js` — new `cron.schedule('0 11 * * 2,5', ...)` (Tue & Fri 4:30 PM IST), gated on
  `isHeronEnabled()` not the shared `isEnabled()`; Heron's catch-up wired alongside the existing one.
- [x] `server/routes/api.js` — `/api/scheduler` GET/PUT extended with `heronEnabled` (independent of
  `enabled` — either can be set alone in the PUT body); `SCHEDULE_SLOTS`/`DAILY_SLOT_MINUTES` gained a
  `heron` entry so the Heron agent card shows a real `nextRun` once its toggle is on.
- [x] `web/src/pages/SchedulesPage.jsx` — second, independent "Heron auto-runs: ON/OFF" toggle + its own
  slot row, alongside the existing Raven/Quill toggle (unchanged).
- **Deferred (not built this pass)**: the manual queue (`heron.attachImagePrompt()`,
  `heron.queueManual()`, `POST /api/heron/queue/manual`, a manual-queue panel on `HeronPage.jsx`) — design
  is sound (see the plan file `cozy-doodling-widget.md`) and ready to build next.
- **Verification: done (2026-07-27).** `node -c` + dry-require every changed/new file — clean. Scratch-
  port boot with both bot tokens unset — both log "disabled" cleanly (`[HeronTelegram] No
  HERON_TELEGRAM_BOT_TOKEN...`), cron log confirms Heron's Tue/Fri 4:30 PM slot armed. `PUT
  /api/scheduler` with `heronEnabled` round-trips independently of `enabled` (toggling one never flips
  the other, confirmed via live HTTP calls). Approved a real Heron Note draft via
  `POST /api/draft/:id/transition` — exercised the `app.locals.telegramSendHeronHandoff` wiring cleanly
  with no throw (no-ops correctly since the bot token is unset). `heronDrop.maybeCatchUp()` gating
  logic unit-tested directly: correctly skips with `reason:'disabled'` when off, and
  `reason:'not-a-heron-day'` on a non-Tue/Fri day. `runHeronDrop()`'s three constituent calls
  (`searchTopics`/`writeArticle`/`writeNote`) were each proven working individually in Phase 8's
  verification above, so the full orchestration wasn't re-run separately (would've been a redundant
  real LLM cost for no new signal). `npm run build:web` clean. All test data cleaned up, `scheduler.json`
  restored to its prior state. No commit/push.

---

## Phase 8c — Heron Telegram: "same bot, second chat" mode ✅ BUILT + VERIFIED (2026-07-29)
Setting up Heron's Telegram delivery for real surfaced a gap in Phase 8b's design: it assumed a fully
**separate** bot (its own BotFather token). In practice, the user got a chat id for the new Heron
channel but kept the **same bot** — no second bot was created. That matters technically, not just
cosmetically: if `HERON_TELEGRAM_BOT_TOKEN` were set to the same value as the main bot's token,
`heronTelegram.js` would start a **second independent long-polling loop against the same token** —
Telegram's API only allows one active `getUpdates` poll per token at a time, so the two would conflict
(repeated `409 Conflict` errors, or approve/reject/edit taps randomly failing depending on which poller
happened to grab that update). Sending isn't affected by this (`bot.sendMessage` has no such conflict),
only the inbound polling loop does.

**Fix — behavior now driven cleanly by which of the two Heron env vars are actually set, no fragile
token-string comparison:**
1. `HERON_TELEGRAM_BOT_TOKEN` empty + `HERON_TELEGRAM_CHAT_ID` set → **same-bot mode** (the user's actual
   setup). The existing main bot in `telegram.js` takes over Heron delivery itself — no second bot/
   polling loop anywhere.
2. Both empty → unchanged, no Heron Telegram delivery (web Queue only).
3. Both set (a real second bot) → unchanged, `heronTelegram.js` boots its own separate bot exactly as
   Phase 8b built — still supported if a genuinely separate bot is ever made.

**Changes:**
- [x] `server/routes/telegram.js` — computes `heronSameBot` at init time; widened the single-chat
  inbound gates (message + callback handlers) to recognize either chat id; refactored `sendDrafts` into
  a reusable `sendDraftsToChat(targetChatId, ...)`; re-added `sendHeronHandoff()` and the
  articles-redirect-to-Heron-page Edit behavior, both gated on `heronSameBot`; the Heron chat is
  explicitly excluded from Titto's command routing (matches how the separate-bot mode already worked);
  new `getHeronDraftSender()`/`getHeronHandoffSender()` exports, non-null only in same-bot mode.
- [x] `server/routes/heronTelegram.js` — no structural change (already no-ops correctly when its own
  token env var is unset); softened its log line so it reads as "using the main bot instead" rather than
  "disabled" when `HERON_TELEGRAM_CHAT_ID` is set without a separate token.
- [x] `server/index.js` — resolves Heron's sender functions via
  `telegram.getHeronDraftSender() || heronTelegram.getHeronDraftSender()` (same for hand-off) — whichever
  module actually owns Heron delivery wins.
- [x] `.env.example` — Heron block rewritten to explain both setups, same-bot first as the simplest/
  default path.
- **Verification**: fake-credential boot test confirmed exactly one `[Telegram] Polling mode started`
  line (no second poller), `[Telegram] Heron same-bot mode active` logged correctly, `[HeronTelegram]`
  correctly deferred without booting its own instance. Directly invoked the resolved
  `getHeronDraftSender()`/`getHeronHandoffSender()` functions with a test draft each — both are real
  functions, both ran their full logic without throwing (the fake token causes an internally-caught send
  failure, not an unhandled error). Confirmed the main bot's own draft sender is unaffected. `node -c` +
  full require-chain clean. No real Telegram credentials or chats were touched during this test.

---

## Phase 9 — Editable schedule times ✅ BUILT + VERIFIED (2026-07-31)
Every scheduled run time (Raven's research, Quill's daily drop) was hardcoded directly into
`node-cron` expressions — the Schedules page could only flip auto-runs on/off, not change *when* things
fire. Confirmed scope with the user: only the 3 daily slots (Raven morning research, Quill daily drop,
Raven evening research) needed to become editable; the weekly wrap (Sunday) and Heron's drop (Tue/Fri)
stay on their fixed times/days — time-of-day only, no day-of-week editing.

**Changes:**
- [x] `state/schedulerStore.js` — new `times` object (`morningResearch`/`dailyDrop`/`eveningResearch`,
  "HH:mm" 24h IST, defaults matching the old hardcoded values), `getTimes()`/`setTimes(patch)` with
  regex validation (throws on a malformed value so the route layer can 400 instead of storing garbage).
- [x] `scheduler/dailyDrop.js` — `DROP_IST_MIN` (a fixed constant) became `getDropIstMin()`, reading
  the configured time fresh on every catch-up check instead of once at module load.
- [x] `scheduler/cron.js` — the 3 daily jobs are now registered via a new `istTimeToUtcCron(hhmm)`
  helper (converts IST "HH:mm" to a UTC cron expression, correctly rolling the UTC day back when the
  IST time falls before 05:30) instead of hand-written cron strings. Their `node-cron` `ScheduledTask`
  references are kept in a module-level map so a time change can `.stop()` the old task and create a
  new one — no server restart needed. New exported `rescheduleDynamic()`, called by the API route below.
  Weekly wrap + Heron's drop keep their original hardcoded `cron.schedule(...)` calls, untouched.
- [x] `server/routes/api.js` — `SCHEDULE_SLOTS` (previously a static array) became `getScheduleSlots()`,
  reading live times and formatting them as both a 12h display label and the raw "HH:mm" (`hhmm` field,
  for the frontend's `<input type="time">`); each slot carries `editable: true/false`.
  `DAILY_SLOT_MINUTES`/`nextDailyLabel()` (used by `/api/agents`'s roster `nextRun` display) similarly
  became dynamic for `raven`/`quill-x` (Heron's stays fixed). `PUT /api/scheduler` now also accepts an
  optional `times: { morningResearch?, dailyDrop?, eveningResearch? }` patch — any subset, validated,
  persisted, and immediately calls `cron.rescheduleDynamic()` so the change takes effect live.
- [x] `web/src/pages/SchedulesPage.jsx` — the 3 daily slot cards now render an `<input type="time">`
  (editable slots) instead of plain text, with a "Save" button that appears only when the picked time
  differs from the stored one; weekly-wrap/Heron cards stay read-only exactly as before.
  `web/src/lib/queries.js` gained `useSetScheduleTimes()`.
- **Verification**: unit-tested `istTimeToUtcCron`'s formula against all 3 original hardcoded values
  (all matched exactly) plus IST-day-rollover edge cases (02:00, and the exact 05:30/05:29 boundary) —
  all correct. `schedulerStore.setTimes()` round-trip + invalid-input rejection confirmed directly.
  Scratch-port boot showed the correct initial arm log; live `PUT /api/scheduler` with a real time
  change produced a fresh `[Scheduler] Daily jobs (re)armed` log line with the new time and updated the
  `GET` response's `slots`/`hhmm` immediately; an invalid time (`"25:99"`) correctly 400'd without
  touching stored state. `npm run build:web` clean. Test server killed via PowerShell `Stop-Process`
  (confirmed gone, not just `pkill`-silent — see the earlier zombie-process incident). No commit/push.

---

## Phase 10 — Daily-drop content quality pass + Heron daily ✅ BUILT + VERIFIED (2026-07-31)
User feedback on the actual Telegram output: long-form posts in the daily drop aren't useful (drop
them), short-form posts lean too much on Souvik's personal story/"angle" instead of being raw, punchy,
viral-hook-driven one-liners, reposts should lean harder into the watchlist, and Heron should run every
day instead of twice a week. Two scope questions were asked and answered before writing this plan:

1. **Repost sourcing**: stays watchlist-first-then-fallback (unchanged logic) — NOT watchlist-only. The
   existing sort in `runReposts()` already puts watchlist authors first, most-engaged within each group;
   as the user adds more watchlist entries, the mix naturally shifts toward them. **No code change
   needed here** — confirming this is designed correctly already, not touching it.
2. **New short-form style scope**: **daily-drop only**, not a global change to Koel's `short` format.
   Manual writes (Koel dashboard page, Quill planner, replies) must keep today's style untouched — this
   means the new style needs to be its own distinct format, not an edit to the existing `short` one.

### 1. Drop long-form from the daily batch; single 4-post short/punch bucket
- `config/contentVolume.js` — `posts: { perFormat: 2 }` (2 buckets × 2 = 2 long + 2 short) becomes
  `posts: { count: 4 }` (one bucket, 4 posts, all the new punch format).
- `agents/quill.js`'s `assignTopics()` — simplify the LLM call from two JSON sections (`long`/`short`)
  to one (`topics: [...]`, 4 items spanning different domains); update the fallback (LLM failure) to
  `results.slice(0, n)`.
- `agents/quill.js`'s `runDaily()` — replace the two `runBatchSection()` calls (long-form + short-form)
  with a single call over the new topic list, `formatFor: () => 'punch'` (new format, below). The
  `⚠️ 314/280`-style length-flag logic in `runBatchSection` still applies (punch posts should be even
  shorter, so the flag becomes more of a safety net than the norm).
- Long-form itself is **not deleted** — still available on the Koel dashboard page and Quill's planner
  ("Long-form" pillar option). Only removed from the automated Telegram batch.

### 2. New Koel format `punch` — raw, hook-driven, punchline-length, daily-drop only
- `prompts/koelWrite.js` — new `FORMAT_META.punch` entry + a new `buildKoelUserPrompt` branch:
  - No forced personal "in my journey / my story" framing — a general sharp take, observation, or
    contrarian angle. Personal-story framing only when the topic is genuinely about resilience/health/
    building, not injected by default.
  - Raw and direct — no hedging language ("I think", "maybe", soft openers).
  - Built to go viral: a scroll-stopping hook in line 1 (bold claim, contrarian take, curiosity gap, or
    a sharp question) — engineered for shares/replies, not just reads.
  - **1–2 lines max** — a punchline, not the current 2–3 line short-form shape. Tighter than today's
    150–220 char target.
  - Explicit anti-AI-slop instruction, reusing `BANNED_PHRASES` from `prompts/styleRules.js` (the same
    list `prompts/heronArticle.js` already uses) — plus a rule against generic engagement-bait tics
    ("Thoughts?", "Agree?", "Unpopular opinion:") unless genuinely earned by the content.
- **Deliberately not added** to `web/src/pages/KoelPage.jsx`'s hardcoded `FORMATS` array (confirmed
  that file keeps its own list, separate from `koelWrite.js`'s `FORMAT_META`) — so this format is only
  ever reachable via `quill.js`'s daily-batch call, never selectable from the Koel dashboard page. This
  is what keeps the change scoped to the daily drop per the confirmed answer above.
- `agents/quill.js`'s `runDaily()` calls `koel.write({ format: 'punch', ... })` for the posts bucket.

### 3. Reposts — no code change (see scope note above)
Confirmed the existing watchlist-first sort in `runReposts()` already does what was asked. Flagging
here only so it's not mistaken for skipped work — it's a deliberate no-op.

### 4. Article ideas / titles — no change (confirmed fine as-is)

### 5. Heron — daily instead of Tue/Fri
- `scheduler/cron.js` — Heron's cron expression changes from `'0 11 * * 2,5'` to `'0 11 * * *'` (same
  4:30 PM IST time, every day instead of Tue/Fri only).
- `scheduler/heronDrop.js` — `maybeCatchUp()`'s `HERON_IST_DAYS` day-of-week gate (`[2, 5]`) is removed
  (or widened to all 7 days) since it's no longer restricted.
- `server/routes/api.js` — Heron's slot label updates from `"Tue/Fri 4:30 PM"` to `"Daily 4:30 PM"` in
  both `getScheduleSlots()` and `getDailySlotMinutes()`.
- Heron's independent `heronEnabled` toggle (Schedules page, currently OFF by default) is **not**
  flipped on by this change — daily cadence only takes effect once the user turns it on themselves,
  same opt-in posture as before. `runHeronDrop()`'s actual logic (search topics → 1 article + 2 Notes)
  is unchanged, just fires on a wider day pattern.

### 6. Heron hand-off — 1-liner instead of a full content dump (added mid-implementation)
Follow-up ask that came in alongside "implement it": Heron's Approve hand-off was sending the full
article as a multi-message dump (header + chunked body + image prompt) into Telegram. Changed to a
single line — the full text and image prompt already live in the Heron dashboard page, so Telegram's
job is just to notify, not deliver. Applied identically to both delivery modes (same-bot and
fully-separate-bot):
- `server/routes/telegram.js` (same-bot mode) and `server/routes/heronTelegram.js` (separate-bot mode)
  — `sendHeronHandoff()` in both now sends `🦢 "<title>" approved — ready to publish. Open the Heron
  page in the dashboard for the full text + image prompt.` for articles (fetches just the title from
  `articlesStore`, nothing else). Notes are unchanged — already short, sent as-is.
- `chunkForTelegram` import dropped from both files (no longer used there; stays exported from
  `telegramCore.js`, still a tested utility).

### Files touched
| File | Change |
|---|---|
| `config/contentVolume.js` | `posts.perFormat` → `posts.count` (4, single bucket) |
| `agents/quill.js` | `assignTopics()` single-list JSON + fallback; `runDaily()` single `runBatchSection` call, format `punch`; length-flag also covers `punch` |
| `prompts/koelWrite.js` | new `FORMAT_META.punch` + `buildKoelUserPrompt` branch |
| `scheduler/cron.js` | Heron cron expression Tue/Fri → daily |
| `scheduler/heronDrop.js` | `maybeCatchUp()` day gate removed |
| `server/routes/api.js` | Heron slot label "Tue/Fri" → "Daily" |
| `server/routes/telegram.js`, `server/routes/heronTelegram.js` | `sendHeronHandoff()` → 1-liner for articles |
| `web/src/pages/QuillPage.jsx`, `public/index.html` | `SECTION_LABEL`/`QUILL_SECTION_META` gained `punch` |
| `web/src/styles/globals.css` | new `.type-punch` badge color (light + dark) |

### Verification — done, real LLM calls
1. `node -c` + full dry-require chain — clean.
2. Real `runDaily()` run (real research, no telegram functions passed) — **4 drafts, all
   `format:'punch'`, none `longform`**. Sampled all 4: zero personal-story/"in my journey" framing (all
   general sharp takes/contrarian angles/hooks), all exactly 1 line, no hashtags, no em dashes, no
   AI-slop phrasing. Confirmed queue tagging (`origin:'quill'`, `format:'punch'`, `platform:'x'`).
3. Confirmed `punch` does not appear in `KoelPage.jsx`'s format picker (only match was the unrelated
   word "punchy" inside the Short Form description).
4. Reposts — untouched (confirmed no code changed in that path; this was a deliberate no-op per the
   scope decision).
5. Heron cadence — `heronDrop.maybeCatchUp()` unit-tested directly: no longer returns
   `reason:'not-a-heron-day'` on a non-Tue/Fri day (confirmed the day-gate is gone).
6. Heron 1-liner hand-off — exercised `getHeronHandoffSender()` directly with fake credentials for both
   an article (including a missing-record edge case, falls back to "your article") and a Note — both
   sent cleanly with no throw.
7. `npm run build:web` clean.
8. Clean up: removed all 4 test drafts + the quill-history/activity-log/cost-log/koel-history entries
   the verification run created. **One real mistake caught and fixed during testing**: a unit test for
   Heron's day-gate briefly flipped the user's real `heronEnabled` flag (which was genuinely `true`,
   set by the user earlier) to `false` — caught immediately by checking `scheduler.json` afterward and
   restored to `true` before finishing. No commit/push.

---

## Phase 11 — /chatid helper + Heron delivery diagnosis ✅ BUILT + VERIFIED (2026-08-01)
User asked again for Heron to send daily Telegram updates. Investigated (read-only) before touching
anything: Heron's daily cadence and same-bot Telegram routing (Phase 10 / Phase 8c) were both already
working correctly — `scheduler.json` showed `heronEnabled: true` and a real `heronLastRun` from the
previous day, confirming Heron genuinely runs every day. **The actual gap was pure configuration**:
`HERON_TELEGRAM_CHAT_ID` was still empty in `.env` (last modified 2026-07-18, before any Heron work),
so every Heron draft was landing silently in the web Queue with zero Telegram delivery — working
exactly as designed for the unconfigured case, just not yet configured. Asked the user whether they
had the chat id ready to paste in or needed help obtaining one — they needed help.

**Built**: a `/chatid` command, answered directly in `server/routes/telegram.js`'s (and
`heronTelegram.js`'s) message handler, **before** the existing chat-allowlist gate — this is
deliberate: the whole point is discovering a *new*, not-yet-configured chat's numeric id, so it has to
work from any chat the bot is a member of, not just the already-recognized main/Heron chats. Replies
with `This chat's id is: <id>`. No LLM call, no Titto routing involved — pure mechanical
`bot.sendMessage(incomingChatId, ...)`, matching the pattern already used throughout both files.
`.env.example`'s Heron block now mentions it.

**How to use it**: add the bot to the target Telegram group/channel, send `/chatid` there, copy the
number it replies with into `HERON_TELEGRAM_CHAT_ID`, then restart the server (the running `npm run
dev` watcher does not reload `.env` on its own — only on watched JS file changes).

**Verification**: `node -c` + dry-require both files clean; fake-credential scratch-port boot confirmed
clean startup with the new code path registered (no errors, same-bot mode log still correct). A true
end-to-end Telegram round-trip needs a real chat, which isn't available in an isolated test — the user
verifies this step themselves by actually sending `/chatid`. No commit/push.

---

## Phase 12 — Deactivate evening research + weekly wrap; Heron tracks Quill's drop time ✅ BUILT + VERIFIED (2026-08-01)
Two small scheduling changes: (1) turn off the automatic evening "fresh research" run and the Sunday
weekly wrap — both stay fully usable manually, just no longer fire on their own; (2) Heron's daily slot
should no longer be an independent fixed time — it should always run exactly 10 minutes after Quill's
daily drop, same relationship Quill already has to Raven's morning research.

**Changes:**
- [x] `scheduler/cron.js` — removed the standalone `cron.schedule('0 1 * * 0', runWeekly)` and the
  `eveningResearch` entry from the dynamic-jobs trio (now a duo: morningResearch + dailyDrop). Deleted
  the now-unreachable `runEvening()`/`runWeekly()` wrapper functions and the unused `quill` import.
  Heron moved from its own fixed `cron.schedule('0 11 * * *', ...)` into `registerDynamicJobs()` — its
  cron expression is now computed as `dailyDrop time + 10 min` via a new `addMinutesToHHMM()` helper,
  so it automatically re-arms to the new time whenever `dailyDrop` changes (same `rescheduleDynamic()`
  path Phase 9 already built for time edits — no new wiring needed, Heron just joined the existing group).
- [x] `scheduler/heronDrop.js` — `HERON_IST_MIN` (a fixed constant) became `getHeronIstMin()`, reading
  `schedulerStore.getTimes().dailyDrop` + 10 fresh on every catch-up check (mirrors how Phase 9 already
  made `dailyDrop.js`'s own drop-time check dynamic).
- [x] `agents/quill.js` — `runWeekly()` gained the analyst-refresh + perf-nudge steps that used to only
  fire when this ran on the (now-removed) automatic Sunday schedule; moved from `cron.js`'s wrapper into
  `quill.js` itself so `POST /api/quill/weekly` (the existing manual route) gets the complete behavior
  too, not a stripped-down version. Added `const analyst = require('./analyst')` (no circular dependency
  — confirmed `analyst.js` doesn't require `quill.js`).
- [x] `state/schedulerStore.js` — `DEFAULT_TIMES` dropped `eveningResearch` (down to morningResearch +
  dailyDrop only). The already-stored `eveningResearch` value in existing `scheduler.json` files is left
  in place untouched (harmless, simply unread by anything now) rather than actively stripped out.
- [x] `server/routes/api.js` — `getDailySlotMinutes()`/`getScheduleSlots()` updated: Heron's entry now
  computed via `heronDrop.getHeronIstMin()` (new `minutesToLabel()` helper, `hhmmToLabel()` now built on
  top of it) instead of a hardcoded "4:30 PM"/"Daily 4:30 PM" string; evening-research and weekly-wrap
  slots stay listed (not deleted from the response) but with `time: 'Manual only'` and `editable: false`,
  so the Schedules page shows they were deliberately turned off rather than silently vanishing.
- [x] `web/src/pages/SchedulesPage.jsx` — needed almost no changes; `ScheduleSlotCard` already renders
  read-only vs. editable purely from the `slot.editable` flag, so the new "Manual only" slots render
  correctly for free. Updated `SLOT_TIME_KEY` (dropped the now-invalid `eveningResearch` entry) and the
  explanatory copy for both toolbars to describe the new behavior accurately.

**Verification**: `node -c` + full dry-require chain clean. Scratch-port boot against the real
`scheduler.json` (real user-configured times: `morningResearch: 09:00`, `dailyDrop: 09:15`) showed the
correct armed log — `research 09:00 IST · drop 09:15 IST · Heron 09:25 IST (10 min after drop)` — and
explicitly confirmed no weekly-wrap or evening-research cron registration happens anymore. Live `PUT
/api/scheduler` changing `dailyDrop` to `10:00` correctly moved Heron's computed slot to `10:10` in the
same response and re-armed the cron (confirmed via a fresh `[Scheduler] Daily jobs (re)armed` log line);
reverted back to the real `09:15` value afterward, confirmed restored. `npm run build:web` clean. No
commit/push.

---

## Sage's 9 systems → our coverage
| Sage system | Status | Note |
|---|---|---|
| 🧠 Learning Loop | ✅ | reads memory before every draft |
| 🔄 Feedback Loop | ✅ | approve/reject(+reason)/edit → memory; never repeats rejected |
| 📅 Daily Batch | ✅ | 6:45am Quill batch — 3 batches × 5 drafts, one-tap buttons |
| 🔍 Trend Scouting | ✅ | Raven + I2C `/replies` + pillar angles (more automated than Sage) |
| ⚡ Reactive Drafting | ✅ | hook→insight→translation→POV skeleton baked into short/longform (Phase 5) |
| 🧵 Thread Writing | ✅ | 5–8 tweets, standalone, one CTA, no em dashes (Phase 5) |
| 🎙 Voice Calibration | ✅ | best tweets calibrate on day one + learns from approved/edited over use (just needs your best tweets in the profile) |
| ✍️ Tweet Drafting (interview-first) | ✅ | thin topic → 1–2 questions first; rich input drafts straight (Phase 5) |
| 📊 Tweet Analysis | ✅ | /perf ingest → win-rates + what's-working insights feed Koel + Raven (Phase 4) |

---

## Things needed from Souvik
- [x] **Restart the running server** to pick up everything from 2026-07-18 (Raven rename, new
  `/api/agents`/`/api/insights`/scheduler endpoints, guardrail fix) — confirmed multiple times this
  session that a running process doesn't pick these up on its own.
- [ ] Try the new React dashboard (`cd web && npm run dev`, alongside the backend) and flag anything
  that doesn't work — Control Center, Queue, and all 9 agent pages are built and verified against real
  data, but not yet exercised by you directly.
- [x] One live check: trigger `/drop` in Telegram (new test channel) and confirm the React dashboard
  updates without a manual refresh. **Confirmed working 2026-07-19.**
- [ ] Decide on VPS deploy timing/details (Oracle VM status, whether to deploy backend-only now) —
  `DEPLOY.md` is ready; see the migration section above.
- [x] **Profile inputs** — provided & saved (`skar_connect`); add more best tweets over time to sharpen voice
- [ ] *(Optional)* **Reddit OAuth creds** (`REDDIT_CLIENT_ID` + `REDDIT_SECRET`) for full metadata — RSS fallback works without them for now
- [ ] *(Phase 4, later)* Weekly: paste top/bottom tweets + stats
- [ ] **Security decision:** do you access the dashboard only from this machine, or also other devices? (picks localhost-bind vs token auth)

## Key files
- Agents: `agents/{titto,raven,quill,koel,analyst}.js` (raven.js was chitrag.js — renamed 2026-07-18)
- Memory/backbone: `state/{accounts,memory,profileSeed}.js`
- Stores: `state/{researchStore,toolsStore,replyTargetsStore,koelStore,quillStore,schedulerStore,insightsStore}.js`
- Style/learning: `prompts/styleRules.js` (shared house style + ban list), `agents/analyst.js` (performance loop)
- Tools: `tools/{fetchTwitter,fetchReddit,fetchArxiv,fetchGitHub,fetchHackerNews,fetchYouTube,fetchReplyTargets}.js`, `tools/sources.config.js`, `tools/replyDomains.config.js`
- Prompts: `prompts/{koelWrite,rankResults,tittoReason,quillPlan,...}.js`
- Server: `server/index.js`, `server/routes/{api,telegram}.js`, `scheduler/cron.js`
- UI (legacy, still live): `public/index.html`
- UI (new, in progress): `web/` — React app; `web/src/pages/*` (one per agent), `web/src/lib/{api,queries,ws,nav}.js`
- Docs: `USE.md` (operator guide), `DEPLOY.md` (Oracle Cloud deploy), `IMPLEMENTATION.md` (this tracker)
