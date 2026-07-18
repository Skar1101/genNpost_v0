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

## 🔲 What's left, in order
1. **One live test**: trigger the daily drop from Telegram and confirm the new dashboard updates on
   its own, without you refreshing the page.
2. **Switch over**: once you've used the new dashboard a bit and I'm confident nothing's missing, make
   it the only dashboard (retire the old single-file one).
3. **Put it on a server**: right now it only runs while your laptop is on. `DEPLOY.md` has a ready,
   free hosting plan (Oracle Cloud) — this makes it run 24/7 regardless of your laptop.
4. *(Later, not started)* Add LinkedIn and Substack as additional platforms the team can research and
   write for — deliberately deferred until the above is solid.

## 🙋 Things needed from you
- **Restart the server** so it picks up everything built recently — it doesn't update itself while running.
- **Try the new dashboard** (`web/` — ask me how to start it if you haven't) and tell me anything that
  feels off or missing.
- **Do the live `/drop` test** using your new test Telegram channel (item 1 above).
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
- [ ] **Not yet done:** one live pass of `/drop`-from-Telegram → confirm React updates without a
  refresh (WS wiring is in place and unit-verified, just not exercised this exact way yet); serving
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
- [ ] **Restart the running server** to pick up everything from 2026-07-18 (Raven rename, new
  `/api/agents`/`/api/insights`/scheduler endpoints, guardrail fix) — confirmed multiple times this
  session that a running process doesn't pick these up on its own.
- [ ] Try the new React dashboard (`cd web && npm run dev`, alongside the backend) and flag anything
  that doesn't work — Control Center, Queue, and all 9 agent pages are built and verified against real
  data, but not yet exercised by you directly.
- [ ] One live check: trigger `/drop` in Telegram (new test channel) and confirm the React dashboard
  updates without a manual refresh.
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
