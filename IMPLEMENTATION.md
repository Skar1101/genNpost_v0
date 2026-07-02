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

## Phase status at a glance

| Phase | Title | Status |
|---|---|---|
| 0 | Simplify & harden sources | ✅ done |
| 1 | Framework backbone + account profile | ✅ done |
| 2 | Feedback loop (approve/reject/edit) | ✅ done |
| 3 | Learned voice + profile onboarding | 🟡 partial |
| 4 | Weekly performance loop + tweet analysis | ⬜ next |
| 5 | Craft upgrades (interview-first, reactive skeleton, thread rules) | ⬜ pending |
| — | Security hardening | ⬜ pending |

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

## Operational config & fixes (2026-06-28)
- [x] **Schedule retimed** (`scheduler/cron.js`): **6:30 AM** research + compact morning briefing · **6:45 AM** Quill daily batch · **6:00 PM** research · **Sunday 6 AM** weekly wrap. (Morning split into `runMorning` + `runBatch`.)
- [x] **Daily batch = 3 batches × 5 drafts** (15 total): Motivational ×5, Domain ×5, Trending ×5 — each batch one short header + 5 draft messages with buttons (`assignTopics` returns 5/section).
- [x] **Compact Telegram** — `deliverResearch` is now ONE short briefing (top 3 + dashboard link), not 6 messages; Quill intro/source-link chatter removed from Telegram. Drafts stay full. (Principle: Telegram = short signal + drafts; depth in dashboard.)
- [x] **Reply targets (I2C) separated** — own store `state/replyTargetsStore.js` + dedicated **💬 Replies tab** (mirrors Tools) + `GET /api/replies/latest`, `POST /api/replies/trigger` + `reply_targets_complete` event. No longer archived into / overlapping ChitraG research (`listArchive` excludes `reply-`; leftovers deleted). Current bars: **5000 impressions / I2C 50**.
- [x] **`/batch` command** (Telegram + web chat) — generate today's batch on demand (3×5 = 15 drafts); fetches fresh research first if none. `handleBatch` in `agents/titto.js`.
- [x] **`/batch` web-chat fix** — web route now passes `telegramSend`/`telegramSendDraft` so web-triggered batches reach Telegram; Titto chat posts a "✅ Batch run done" confirmation.
- [x] **Telegram 📋 Copy button** — second button row on every draft; sends the draft as a tap-to-copy code block (`server/routes/telegram.js`).
- [x] **Titto activity tab (control tower)** — new `state/activityStore.js` (bounded log, 200) records one line per agent run (research, reply targets, daily batch, weekly, plan, write, tools) with source/trigger badge, summary, and a ref to open the output. Each agent records + broadcasts a live `activity` WS event; trigger labels threaded from Titto handlers / cron / API. `GET /api/activity`. New **Titto** sidebar tab with a newest-first timeline + Open-to-panel navigation (`public/index.html`).
- [x] **`USE.md`** operator guide created (step-by-step usage).
- [x] **Regression verified** — 29 modules load, 39 routes, 8 Titto commands, 16 GET endpoints all 200.

## Article Writer — dedicated professional writing workspace ✅ (B1–B4)
- [x] **Model layer** — `config/models.js` (registry + per-1M pricing) + `utils/llm.js` (OpenAI-compatible;
  routes via **OpenRouter** when `OPENROUTER_API_KEY` set, else falls back to OpenAI; supports streaming).
- [x] **`agents/articleWriter.js`** — dedicated pipeline: research pull (ChitraG) + article prompt/template
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
  budget shared across Article Writer + Koel + ChitraG + Quill.
- [x] Verified: concurrency cap holds (peak ≤ limit), RPM overflow fails fast, token clamp 9000→cap, server
  boots clean. Provider split unchanged (legacy = direct OpenAI gpt-4o-mini; Article Writer = OpenRouter).

## Phase 4 — Weekly performance loop + tweet analysis ⬜
- [ ] Weekly Telegram reminder → paste top/bottom tweets + stats
- [ ] Tweet-analysis: extract hook/format/voice patterns → write `performance-log` + update voice/profile
- [ ] Feed performance patterns back into ChitraG ranking + Koel prompts ("write more like what landed")
- [ ] `/learned` ("what's working") summary command
- [ ] Keep ingest pluggable (manual now; RapidAPI own-account / X API later)

## Phase 5 — Craft upgrades ⬜
- [ ] Interview-first drafting: when input is thin, ask 1–2 targeted questions before drafting (auto-angle when rich)
- [ ] Reactive skeleton baked into Koel: hook → insight → translation → POV
- [ ] Hard formatting rules: no em dashes, breathing room, no corporate words, lowercase option
- [ ] Stricter thread rules: each tweet standalone, ≤8–10 tweets, one CTA

## Security hardening ⬜ (audited, fixes pending)
- [ ] **#1** No auth + binds `0.0.0.0` → anyone on LAN can hit `/api/*` (read profile/drafts/memory/logs, trigger paid calls). Fix: bind `127.0.0.1` OR add a shared-secret token (decision pending: local-only vs other devices)
- [ ] **#2** Path traversal in `GET /api/research/archive/:filename` (`readArchive` not sanitized) → `path.basename()` fix
- [ ] **#3** `/api/logs/*` serves raw logs with no auth (gate behind #1's choice)
- [ ] **#4** Telegram webhook has no secret-token check (only matters if you switch from polling to webhook)
- [x] Secrets safe: `.env` never committed (only `.env.example`); keys in headers/params, not logged; `state/data`+`logs` gitignored

---

## Sage's 9 systems → our coverage
| Sage system | Status | Note |
|---|---|---|
| 🧠 Learning Loop | ✅ | reads memory before every draft |
| 🔄 Feedback Loop | ✅ | approve/reject(+reason)/edit → memory; never repeats rejected |
| 📅 Daily Batch | ✅ | 6:45am Quill batch — 3 batches × 5 drafts, one-tap buttons |
| 🔍 Trend Scouting | ✅ | ChitraG + I2C `/replies` + pillar angles (more automated than Sage) |
| ⚡ Reactive Drafting | 🟡 | works; sharp hook→insight→translation→POV skeleton = Phase 5 |
| 🧵 Thread Writing | 🟡 | basic format; strict standalone/no-em-dash rules = Phase 5 |
| 🎙 Voice Calibration | ✅ | best tweets calibrate on day one + learns from approved/edited over use (just needs your best tweets in the profile) |
| ✍️ Tweet Drafting (interview-first) | ⬜ | Phase 5 |
| 📊 Tweet Analysis | ⬜ | Phase 4 |

---

## Things needed from Souvik
- [ ] **Restart the running server + hard-refresh** the dashboard — none of today's changes (Replies tab, schedule, batch, compact Telegram, Phases 0–3) take effect until then
- [x] **Profile inputs** — provided & saved (`skar_connect`); add more best tweets over time to sharpen voice
- [ ] *(Optional)* **Reddit OAuth creds** (`REDDIT_CLIENT_ID` + `REDDIT_SECRET`) for full metadata — RSS fallback works without them for now
- [ ] *(Phase 4, later)* Weekly: paste top/bottom tweets + stats
- [ ] **Security decision:** do you access the dashboard only from this machine, or also other devices? (picks localhost-bind vs token auth)

## Key files
- Agents: `agents/{titto,chitrag,quill,koel}.js`
- Memory/backbone: `state/{accounts,memory,profileSeed}.js`
- Stores: `state/{researchStore,toolsStore,replyTargetsStore,koelStore,quillStore,schedulerStore}.js`
- Tools: `tools/{fetchTwitter,fetchReddit,fetchArxiv,fetchGitHub,fetchHackerNews,fetchYouTube,fetchReplyTargets}.js`, `tools/sources.config.js`, `tools/replyDomains.config.js`
- Prompts: `prompts/{koelWrite,rankResults,tittoReason,quillPlan,...}.js`
- Server: `server/index.js`, `server/routes/{api,telegram}.js`, `scheduler/cron.js`
- UI: `public/index.html`
- Docs: `USE.md` (operator guide), `IMPLEMENTATION.md` (this tracker)
