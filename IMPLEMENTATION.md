# TinySparrow — Implementation Tracker

Living status of turning Titto into a self-improving, Telegram-first X content engine.
Goal: **minimize human time on research → ideation → drafting; final post/edit decision always stays human.**
Optimize **consistent quality + engagement; virality is a byproduct, never the direct target.**

> ⛔ **HARD STOP — never automate the X account.** The system must NEVER post, reply, comment, like, or
> retweet on/from @skar_connect, automatically or otherwise. It is **draft-only**; all posting and
> engagement is done manually by Souvik. There is intentionally **no X write capability in the codebase**,
> and none may ever be added. "Approve" only files a draft in the local queue — it touches nothing on X.
>
> **Substack (Heron)** follows the same draft-only spirit by deliberate choice, not a technical
> limitation — see Phase 8's reasoning. **LinkedIn (Parrot) is a confirmed, explicit exception**
> (2026-08-01, see Phase 15): Souvik asked for real automated posting on Telegram Approve, was shown the
> conflict with this rule directly, and confirmed the override in writing ("Yes, override it for
> LinkedIn"). X and Substack are unaffected — this exception is scoped to LinkedIn only.

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

**Switch-over (2026-08-01):**
- Confirmed the live server was already serving the React app exclusively — `server/index.js` has no
  route to the old `public/index.html` at all (only `web/dist` is mounted), so the old file had been
  unreachable dead weight in the repo, not an active fallback. Verified live: `/`, `/api/agents`,
  `/api/queue` all 200, build up to date with `web/src`.
- Retired it formally: moved `public/index.html` → `archive/legacy-dashboard.html` (kept, not deleted,
  in case it's ever needed for reference) via `git mv`. No server/code changes needed since nothing
  referenced it.

## 🔲 What's left, in order
1. **Put it on a server**: right now it only runs while your laptop is on. `DEPLOY.md` has a ready,
   free hosting plan (Oracle Cloud) — this makes it run 24/7 regardless of your laptop.
2. **Heron · Substack — fully live** (see Phase 8, 8b, 8c, and 13 below): Telegram delivery confirmed
   working (a real, genuinely separate bot — `@TS_Heron_Substack_bot` — currently posting into the same
   chat as the main bot; flagging once more that this is a choice, not a bug — a truly separate
   chat/channel is one `/chatid` message away if you'd rather split them), "Heron auto-runs" is ON in
   Schedules and already ran a real automated drop. The article-length undershoot is fixed (Phase 13 —
   was landing at 485-875 words against a 900-2200 target; now enforced with an automatic expand pass,
   verified live at 1095 words). Still no auto-posting — Substack has no official API for it, the last
   manual click always stays yours. **Only thing left**: the **manual queue** (paste your own
   already-written post, Heron still preps an image prompt for it) — designed but not built yet.
3. **Parrot · LinkedIn — fully live** (see Phase 15, 16 below): LinkedIn is connected (confirmed live as
   "CONNECT SARKAR", token valid to 2026-10-06), Parrot's dedicated Telegram bot is live and verified.
   Parrot now also has a "Plan LinkedIn Posts" flow (fresh search + career/AI/building-in-public
   suggestions, mirrors Quill's planning page) and Titto can draft a LinkedIn post from natural chat
   ("post to linkedin: ...") — it always hands off to Parrot's bot for the actual Approve/post step,
   never posts directly itself. **Only remaining item**: "Parrot auto-runs" is still OFF in Schedules —
   flip it on whenever you want the daily automated drop running itself (16:30 IST default, editable).

## 🆕 v2 — per-platform engine, images, library, calendar, manual entry (2026-08-10)

Built in one pass. Everything below is live in the code and verified against a running server.

**The per-platform engine (the core fix).** Koel was structurally an X writer wearing other
platforms as costumes: `prompts/koelWrite.js` built ONE system prompt for every platform, carrying
~27 KB of X-only material (tweet copy principles, 100K-view tweet examples, DM-giveaway templates)
into LinkedIn and Substack calls, where a format guide at the end then tried to countermand it.
Measured: a LinkedIn call was sending **9,417 prompt tokens**, most of it about a platform it wasn't
writing for.
- `sub-agents/koel/` is now `common/` + `x/` + `linkedin/` + `substack/`. Each platform loads its
  own pack and nothing else. Edit a pack to change how Souvik sounds on that platform.
- The `platform` argument already existed on `koel.write()` and was stored on every draft — it just
  never reached the prompt builders. It's now derived from the format (every format belongs to
  exactly one platform), so no caller had to change. Heron never set it, which is why its Substack
  drafts were written with X's full playbook loaded.
- Approvals/rejections/voice examples now record their platform, so each platform calibrates against
  its OWN approved work. A LinkedIn draft used to be shown "YOUR BEST TWEETS (the gold standard)".
- `agents/articleWriter.js` had the identical bug and is fixed the same way.
- **Result: LinkedIn 9,417 → 5,093 tokens, Substack ~9,190 → 4,480.** Cheaper and on-target.

**Raven — keyword priority + per-platform fit.** `state/keywordsStore.js` holds per-platform keyword
sets (editable in Settings). `prompts/rankResults.js` now returns `platformFit: {x, linkedin,
substack}` per item **in the same ranking call** — no extra requests, just more output tokens.
Quill/Parrot/Heron each read the pool ordered by their own score via `raven.topForPlatform()`
instead of all three slicing the same top 15. Verified on 20 real items: zero had identical scores.
`tools/keywordSearch.js` scores candidate keywords by real occurrences in the current research pool.

**Image generation** — a tool, not an agent. `tools/generateImage.js` + `prompts/imagePrompt.js` +
`config/imageStyle.js` (house visual style with a never-produce list, the image equivalent of
`BANNED_PHRASES`). Post text → visual subject → house style → image. Files live in
`state/data/assets/images/`, served at `/assets/images/`. Every image carries an approved/rejected
verdict, because that set is the future LoRA training data.

**Swapping the image API is a one-line change.** Providers are pluggable, each self-contained in
`utils/imageProviders/`:
- **Change provider:** set `IMAGE_PROVIDER=openrouter|fal|openai` in `.env`. Unset, the first
  provider with a key wins in priority order `fal → openrouter → openai`. A value naming an
  unconfigured provider is ignored rather than breaking generation.
- **Add a provider:** one file in `utils/imageProviders/` + one line in that folder's `index.js`.
  Nothing else changes — `utils/imageClient.js` is a thin dispatcher that knows no provider details,
  and `config/models.js` re-exports from the registry so existing call sites keep working.
- Each provider owns its own endpoint, auth, request shape, size translation and pricing. Sizes in
  `config/imageStyle.js` are provider-neutral (`width`/`height`/`aspect`); each provider converts
  (fal → named sizes, OpenAI → `WxH` strings, OpenRouter → `aspect_ratio` + `resolution` tier).

**Cost is taken from the provider when it reports one.** OpenRouter returns the real billed amount
per request, which beats any local table and can't go stale. The registry prices from `models` only
as a fallback, and handles per-megapixel pricing (FLUX bills that way — a flat per-image figure
would misreport it).

Live measured, same prompt: **OpenRouter FLUX.2 Klein at 2048×1376 for $0.016**, versus **OpenAI
`gpt-image-1` at 1536×1024 for $0.040** — cheaper *and* higher resolution. fal remains first in
priority because it is cheaper still (~$0.003) and is the only one that can train.

**Asset library** (`state/assetsStore.js`, `/library`) — finished, editable, versioned work.
`segments[]` is the thread split, which also happens to match what a scheduler like Postiz expects.
Every edit appends a version; revert is itself a version, so it's undoable.

**Manual entry** (`/compose`, plus Telegram) — the manual queue that was designed and deferred twice
(see below), now general across all three platforms rather than Heron-only. **Rule: manual content
is never silently rewritten.** House-style polish is applied automatically to agent drafts and only
*offered as a diff* on anything hand-written. Telegram: send a photo with a caption, or
`/save <text>`; prefix with `linkedin:` / `substack:` to override the platform.

**Calendar Control Center + slot delivery** — the old page was 101 lines of status cards. Now a week
grid: drag to reschedule, click an empty slot to write into it. At slot time, routing respects the
hard stop — **LinkedIn posts for real, X and Substack arrive in their own Telegram channel,
copy-ready, with a "Posted ✅" button.** Fires off the existing 30-minute tick, no new job.
Since the timeline ingest is deferred, that button is the only signal a post shipped.

**"Adapt for X / LinkedIn / Substack"** — takes any asset and genuinely rewrites it for another
platform, not a reformat. Verified: one 170-char X post became a 171-word LinkedIn piece with
paragraphs and 5 hashtags, and a 102-word Substack passage with prose and no CTA.

**Titto's chat page** — `/agent/titto` rendered history and no chat, so Control Center's "Ask Titto"
button dead-ended. Chat extracted to a shared component; the conversation lives in the store, so the
dock and the page are one thread.

## 📝 Article quality — a regression of mine, three bugs, and a learning loop (2026-08-18)

Reported: article quality dropped sharply, X links appearing, weak openings. Four causes.

**1 · [MY REGRESSION] The article writer lost its voice.** When `sub-agents/koel/` was split into
`common/ x/ linkedin/ substack/` for the platform packs, `prompts/koelWrite.js` was updated but
`agents/articleWriter.js` was not — it kept reading `koel/IDENTITY.md`,
`koel/writing_principles_context.txt` and `koel/Viral_long_form_template.txt` at their old flat
paths. `readFileSafe()` swallowed the miss and returned `''`, so it failed **silently**: measured
identity **0 chars**, principles **0 chars**, system prompt ~900 chars. Every article since ran with
no voice definition and no writing principles. Paths fixed; the prompt is now **7,255 chars**, and
`readFileSafe` **logs a warning** on a miss rather than returning empty quietly.

**2 · Refine could destroy an article.** `/article/refine` appends an empty placeholder version so
streamed tokens have a target, then only *logged* on failure — leaving a 0-char latest version.
One real article ("Consistency Is the Currency of Trust") was destroyed this way and has been
**restored to v1 (1,484 chars)**. `articlesStore.removeLatestVersion()` now rolls the placeholder
back, an empty result is treated as an error, and `platform` is passed through (Substack refines
were silently running under X's rules).

**3 · Generate had the same bug** — it pre-creates an empty article record and left it on failure.
**Three dead 0-word articles** had accumulated. `articlesStore.remove()` now cleans up.

**4 · X links, because tweets were being used as citations.** Grounding sources were
`research.results.slice(0, 6)`, and research is now mostly Twitter and YouTube Shorts. Added
`citableOnly()` — social sources are excluded from citations (they can still inspire a topic), the
extractor drops any social link the model produces anyway, and `ARTICLE_TEMPLATE.md`'s Links section
— which literally *instructed* the behaviour ("Those items become the primary citation sources") —
was rewritten to ban them.

### The learning loop — 12 corrections, 0 learned from

Article refine instructions were stored in version history and **never read**. The same three
complaints repeated: links (×2), first paragraph (×2), headline (×2).

- **`state/articleLessonsStore.js`** — standing rules, each deletable, with hand-written rules
  **pinned** so they survive a re-learn.
- **`analyst.learnArticleLessons()`** — distils every stored refine instruction into ≤6 testable
  rules, injected into the article system prompt as `LEARNED FROM SOUVIK'S OWN CORRECTIONS`, which
  is placed last so it outranks the template. Runs on demand; `articleWriter.reload()` clears the
  per-platform prompt cache so new rules take effect immediately.
- **Settings → Article preferences** — the two template files (`sub-agents/quill/ARTICLE_TEMPLATE.md`,
  `sub-agents/heron/SUBSTACK_ARTICLE_TEMPLATE.md`) are now editable **per `## section`** rather than
  only on disk, via `state/articleTemplateStore.js`. Round-trip verified lossless. Saving an empty
  or near-empty template is **refused** — that is precisely the failure mode of cause 1.

**Verified live:** a fresh article came out at 654 words, **zero social links**, opening with
*"Three months into launching my first AI project, I noticed a recurring theme…"* — a specific
moment, not the "AI has taken center stage in recent years" boilerplate it produced before the rule.

**Note:** the first learned rule for openings came out as the useless *"ensure a strong opening"*.
It was replaced with a pinned, testable one — which is exactly why the delete/pin controls exist.

## 🎬 Studio — one place to make a post (2026-08-12)

Making a post with a picture and scheduling it used to span **five surfaces** — `/compose`,
`/agent/image`, `/library` (which had its own second editor), the calendar's generate-modal, and
`/queue`. Each did part of the job; none did the whole thing.

**`web/src/pages/StudioPage.jsx`** replaces `/compose` with three panels visible at once:
**Content** (write, paste, or generate from a brief; live split + warnings) · **Picture**
(generate / upload / **pick from gallery**) · **Publish** (save, schedule into a slot, send to
Telegram now, restore a version, rewrite for another platform).

"Pick from gallery" is the piece that was actually missing: before it, an image could only be
attached in the same sitting it was made, so a picture created separately could never be clubbed
with text later — which is the flow that was reported broken.

**One editor, not two.** The Library's side-panel `AssetEditor` was removed and its row action now
opens `/studio?id=…`, so creating and revising are the same screen. `ComposePage.jsx` is deleted;
`/compose` redirects.

Two new endpoints, both thin wrappers over existing logic:
- `POST /api/assets/generate` — the same Koel call as `/api/schedule/generate` but WITHOUT forcing a
  slot, so a draft can land in the editor and be read before it becomes anything.
- `POST /api/assets/:id/send` — exposes `slotDelivery.deliverAsset()`, which already routed
  correctly per platform but was only reachable from the cron tick.

**Scope note:** the daily drop's drafts deliberately stay in their own Telegram/Queue triage flow and
do NOT enter the library — user's call. The consequence is that drop content still can't carry an
image or be scheduled; promoting on approve is a small change if that changes.

**Verified:** generate returns text without creating anything (library count unchanged) · a gallery
image attaches by id · lowercase text saves verbatim with polish only offered · scheduling puts it
on the calendar · `/compose` redirects to `/studio`.

## 🎯 Positioning pivot — AI · Self-help · Wellness (2026-08-11)

Goal: position as **AI influencer + self-help expert + wellness expert**. The blocker wasn't any one
setting — it was that topical control lived in **seven places, none editable from the UI**
(`PILLARS.md` with a `setPillars()` that literally threw, `rankResults.js` exclusions, `raven.js`
hardcoded domains, `contentVolume.js`, `keywordsStore.js`, `sources.config.js`, `profile.json`).
Every positioning change needed a code edit. That is now one editable Content Strategy.

**`state/strategyStore.js` — the single source of truth**, edited in Settings → Content strategy:
positioning line, pillars (label · active · thread slot · domains · description · keywords), and an
editable never-include list. Everything derives from it — the ranking prompt's subjects and HARD
EXCLUDE, `raven`'s on-topic domains, the daily thread themes, and the repost filter. Change
positioning in the UI; no code, no restart.

- **Domain taxonomy split** `wellness` → **`self-help`** (discipline, habits, focus, mindset) and
  **`wellness`** (sleep, energy, recovery, meditation). The positioning treats them as separate
  expertise, so one bucket made the rotating thread slot meaningless.
- **Thread slots**: AI owns slot 1 **every day**; self-help and wellness **alternate** in slot 2, by
  day-of-year parity — deterministic, no stored state to drift.
- **Volume**: 10 posts (2 threads + 8 short), 5 reposts, 4 article ideas. Pool raised to match —
  `POOL_SIZE` 20→40, `MAX_PER_SOURCE` 6→10, AI-tools floor 6→10, ranker returns TOP 30. Without the
  pool increase, 10 posts from an 8-item list means repeated angles.
- **YouTube Shorts mining** (`tools/fetchYouTubeShorts.js`) — the existing YouTube source only polls
  a fixed channel list and so can never surface a Short from an account not already on it. This
  searches all of YouTube by pillar keywords (`videoDuration=short`), then makes a second
  `videos.list` call for real view counts, since search results don't include them.
  **Ordered by relevance, not viewCount** — a first pass ordered by views returned AI-baby-video
  slop, a devotional clip, Free Fire gameplay and JCB-repair spam, all with millions of views.
  A spam-pattern filter drops the rest before it costs pool slots.
- **Watchlist loose filter** — you curate those accounts *because* they post these subjects, so the
  strict domain filter was fighting your own curation (it dropped ~85%, including plainly on-subject
  self-help). `classifyDomains(items, { loose: true })` now drops only clear violations. The strict
  filter still applies to research-sourced reposts. `fetchWatchlist` caps to 5 posts/handle, 80
  total, with a 6-hour cache so a 30-account watchlist doesn't re-bill on every drop.
- **Pseudoscience excluded by default** — positioning as a wellness *expert* raises the credibility
  bar, and a live run had put "40 Hz + 528 Hz Brain Regeneration" into the wellness thread slot.

**Filter visibility** — `agents/raven.js` now returns `dropped[]` with a reason per item, persisted
on the run and shown as a collapsible "Filtered out" section on the Raven page. Previously the only
evidence was a log line, which is why diagnosing a bad drop needed a developer.

### The feedback loop — it had never run, not once

`analyst.analyze()` had exactly two callers and **neither ever fired**: `quill.runWeekly()` (the
weekly wrap is deactivated in `scheduler/cron.js`) and `/perf` (needs a manual paste that never
happened). Meanwhile 18 approvals and 19 rejections *with reasons* sat unread and `insights.json`
never existed — so `memory.loadContext()` fed Koel a **null `insights` on every draft ever written**.

- **`analyze()` now runs at the end of every drop** (`scheduler/dailyDrop.js`) and after a `/triage`
  burst. `insights.json` exists for the first time.
- **Rejection reasons are their own prompt block.** `wrong topic` is 7 of 19 rejections — the
  clearest instruction you've ever given the system, previously buried inline per-draft.
- **Pillar guard.** The first real run concluded `downweight: AI-related topics` — it read the
  historical "wrong topic" rejections (which came from the off-topic era) as *"AI is the wrong
  subject"* and would have suppressed the primary pillar. The prompt now states pillars are fixed,
  and a code-level guard strips any downweight term matching an active pillar's label, domains or
  keywords. Re-run output: `downweight: (none)`, with the summary correctly reading *"AI posts are
  struggling due to off-topic framing"* — the angle, not the subject.
- **`/triage [n]`** — sends the newest unrated drafts as action cards, bounded and recent-first.
  335 sat unrated; chasing all of them is hopeless, clearing today's drop isn't.

**Verified live:** pool 34 raw → 12 ranked, **0 filtered out**, domains ai-tools 4 / self-help 4 /
ai-impact 2 / wellness 2, Shorts contributing 10 items, thread themes resolving to AI + Wellness.

## 🩹 Content-quality fix — off-topic drops + vanishing AI (2026-08-11)

Reported from the live drop: content pillars completely off-topic, AI "reduced drastically",
political news appearing, weak short posts. Diagnosed against the real research run, and the root
cause was **structural, not prompt wording**.

**Root cause: the seen-URL filter never expired.** `state/seenUrlsStore.js` recorded `addedAt` but
only used it to trim at 5000 entries — a URL seen once was blocked effectively forever. Measured on
a live fetch:

| source | fetched | survived the seen-filter |
|---|---|---|
| hackernews | 13 | **0** |
| github | 15 | **0** |
| youtube | 6 | **0** |
| twitter | 20 | 15 |
| reddit | 25 | 19 |

GitHub, HN and YouTube are precisely the **AI-tools** sources, and they move slowly — a repo trends
for a week, a channel posts weekly. Twitter and Reddit churn constantly, so they kept supplying
"new" URLs and flooded the drop with whatever they happened to surface. That is why AI disappeared
and drug-policy history, etymology, ASMR and game-AI papers took its place. The 60/40 human/tech
quota then made it worse by padding the "human" side with lifestyle filler to hit its target.

**The fixes:**
- **Per-source TTL** on the seen filter (github 10d, HN 7d, youtube 14d, arxiv 21d, twitter/reddit
  45d). Still-trending items on slow sources become eligible again — on those sources, still
  trending *is* the signal. Result: pool went from **13 raw → 95 raw**.
- **AI-tools supply floor** — `fetchAllSources()` reserves 6 slots for github/hackernews/youtube
  *before* balancing, so they can't be crowded out.
- **Domain classification** — the ranking call now labels every item `ai-tools | ai-research |
  ai-impact | wellness | building | other`, in the same request (no extra LLM calls). Anything
  landing on `other` is **dropped in code**, not merely discouraged by the prompt.
- **Much harder exclusions** — politics/policy of any kind, religion and devotional practice
  (secular meditation still wanted, faith-based practice not), drugs, trivia/etymology, video games,
  lifestyle/decor/travel, ASMR. Plus an explicit "an on-topic list of 8 beats a padded list of 20".
- **Removed the "inject skipped source" guarantee** in `agents/raven.js` — it re-added RAW,
  unclassified items *after* the off-topic filter, so they defaulted to `other` and slipped through.
  A live run produced exactly that. Source diversity is now handled earlier by the supply floor.
- **Two themed threads per drop** (`config/contentVolume.js` → `threadThemes`): slot 1 from
  `ai-tools`/`ai-impact`, slot 2 from `wellness`. Reserved from their own domains *before* the punch
  topics are picked, so they can't be displaced. If a domain has nothing that day, the slot falls
  back to an original angle on that theme rather than substituting off-topic material.
- **Reposts restricted to AI + wellness** and the watchlist is now *fetched*, not hoped for. The old
  code only re-ordered whatever the keyword search returned — and a keyword search almost never
  surfaces a specific handle, so "watchlist first" had no practical effect. New
  `tools/fetchWatchlist.js` pulls their timelines directly (reusing `fetchUserTweets.js`), and
  `raven.classifyDomains()` topic-filters them, so an off-subject post can't qualify purely by
  virtue of who wrote it.

**Verified live:** 8 ranked items, **0 off-topic**, split wellness 4 / ai-tools 2 / ai-impact 1 /
ai-research 1. Thread slots resolved to "New in Claude Code: your sessions can now message each
other" (AI tools) and "The curse of discipline is that every day looks the same" (wellness).
Watchlist: 20 fetched → 3 on-topic kept, 17 dropped (finance, general commentary).

**Tuning note:** the repost filter is deliberately strict, per "strictly AI and wellness" — it also
drops `building` (solo-SaaS/indie) posts. Widen via `contentVolume.reposts.domains` if that's too
tight.

## ✅ Fixed 2026-08-21 — drafts inventing statistics

**Resolved.** Measured before the fix: **15 of the last 60 drafts (25%)** carried a fabricated
percentage, and — the serious part — **10 of 37 approved drafts (27%)** did, against **0 of 20
rejected**. Since `analyst.analyze()` learns voice from approvals, the bug was teaching itself.

What changed:
- `prompts/styleRules.js` — the mandatory-number rule is now a **specificity** rule (a named thing,
  a specific moment, a real action, *or* a number). Percentages and study/survey claims are banned
  outright unless the figure appears in that draft's input material, with the real observed
  fabrications included as worked negative examples.
- `agents/koel.js` — the deterministic check was **inverted**. It used to detect "no number anywhere"
  and re-ask for one (the pump). It now detects an *ungrounded* stat and re-asks to remove it, reusing
  the same bounded 2-attempt loop and shape-drift guard.
- `prompts/styleRules.js` — new `findUngroundedStat(text, sourceText)` beside `findBannedPhrase`.
  Grounds a figure by checking its digits against the source; allows the Atomic Habits "1% better"
  idiom; grounds a study claim when the source mentions a study/survey/report at all.
- `scripts/auditStats.js` — read-only report of approved drafts still carrying an invented stat.

Verified: a wellness batch (the pillar where every fabrication occurred) produced **0 fabricated of
9 drafts**, while a batch given a genuine survey stat kept the real 42%/27% figure in **3 of 3**.

**Still to do (yours):** run `node scripts/auditStats.js` and un-approve the 8 flagged approved
drafts via `/triage` or the Queue — until then they keep training the voice.

<details><summary>Original diagnosis (2026-08-10)</summary>

**Drafts are inventing statistics.** (Found 2026-08-10 while verifying the platform packs; deferred
by choice to keep the v2 stages moving.)

The numbers-retry loop in `agents/koel.js` makes "every draft must include a concrete number" a hard
requirement, and the same prompt adds a soft prohibition against making one up. When the source
material has no real number, that resolves as fabrication every time. Three-for-three in a single
test run:

- X — "AI coding assistants miss **70% of context** when reading files"
- LinkedIn — "like the **10 typos I found in my code last week**"
- Substack — "**In a recent observation**, they flagged **7 out of 10** basic syntax errors"

None are real. All three fired `no concrete numbers anywhere — re-ask 1` first, so the retry is what
produces them. This path ships in the daily drop.

**Intended fix:** stop requiring a number outright. Require concrete *specificity* — a name, a
version, a mechanism, a timeframe — and require an actual **number** only when the input material
contains one (checkable in code, the same way the current check is). That removes the pressure
rather than arguing with it.

</details>

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
| 13 | Heron delivery re-verified live + article-length fix (expand-pass) + repost length/substance | ✅ done |
| 14 | Punch self-help mix, repost reverted to neutral highlight, Heron shape changed to 4 short + 2 mid | ✅ done |
| 15 | Parrot · LinkedIn — fully automated posting (explicit hard-stop exception) | ✅ done — LinkedIn connected, verified live |
| 16 | Parrot — Plan LinkedIn Posts, Titto natural-language LinkedIn drafting | ✅ done |
| 17 | No-personal-angle rule for Parrot/Heron content + Parrot Telegram auto-post clarity | ✅ done |

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

## Phase 13 — Heron delivery re-verified live + article-length fix + repost length/substance ✅ BUILT + VERIFIED (2026-08-01)
Follow-up pass on the Heron backlog plus one unrelated Quill tweak requested in the same session.

**1. Re-verified Heron Telegram delivery end-to-end, live.** `.env` now has a genuinely separate bot
(`HERON_TELEGRAM_BOT_TOKEN` set, real token) with `HERON_TELEGRAM_CHAT_ID` pointed at the same chat as
the main bot (not a second bot on the same token — confirmed no `409 Conflict` risk, since the two bots
have distinct tokens; the "same chat" part is a deliberate-or-not choice, flagged again, not fixed).
Confirmed via read-only Bot API calls (`getMe` on both tokens, `getWebhookInfo` on Heron's) that both
bots are valid, distinct (`@skar_agent_test_bot` / `@TS_Heron_Substack_bot`), and Heron's is actively
polling (`pending_update_count: 0`). Confirmed via `/api/scheduler` that `heronEnabled: true` and via
`/api/activity` that a real automated Heron drop already ran (`⏰ Catch-up · Heron` — 6 topics found, 1
article drafted, 2 notes drafted) — this backlog item was already effectively done, just not verified
since the last `.env` fix.

**2. Fixed the article-length undershoot** (flagged since Phase 8, unfixed until now). Root cause,
confirmed by testing rather than guessed: `SUBSTACK_ARTICLE_TEMPLATE.md`'s structure rules gave ranges
("4-7 sections, 2-5 paragraphs, 2-4 sentences") with no reinforced floor — the model was satisficing
near the *low* end of every range, compounding down to ~480-500 words against the 900-2200 target.
- [x] `sub-agents/heron/SUBSTACK_ARTICLE_TEMPLATE.md` + `prompts/heronArticle.js` — tightened ranges
  (5-7 sections, 3-5 paragraphs each, ~150-300 words/section) and added explicit "900 is a hard floor,
  not a suggestion" language in both the template and the actual prompt sent every call (the template
  file's own words aren't guaranteed to be read the same way twice — the prompt builder needed the same
  reinforcement directly).
- [x] `agents/articleWriter.js` — bumped `maxTokens` to 5500 for `platform:'substack'` (was 4000,
  shared with X) so token-cap truncation is never a contributing cause, confirmed separately from the
  prompt-adherence issue.
- [x] **Real fix, not just prompt-begging**: prompt tightening alone wasn't sufficient — a live test
  after the prompt change still landed at 875 words (better than 485, still under floor). Added a
  deterministic **automatic expand pass** in `articleWriter.generate()`: after generation, if the
  Substack article is under 900 words, one (up to two) follow-up completion call(s) explicitly told the
  word gap and asked to expand by that much via new sections/deeper existing ones — not streamed to the
  live UI (plain `llm.complete()`, no `onToken`) so a rare re-ask doesn't double-print what's on screen;
  `article_done` always carries the final authoritative text regardless. Usage/cost from all passes
  summed correctly into the final `cost` figure.
- **Verified live, real LLM calls, no test-data cleanup needed** (`articleWriter.generate()` doesn't
  persist anything itself — only the API route does): first real sample landed at 524 words, one expand
  pass got a *different* topic to 858 (still short — informed the "up to 2 passes" design), a third
  sample needed both passes (634 → 850 → 1095 words, final cost ~$0.009) and cleared the floor. One
  real end-to-end sample also run through the actual `/api/heron/article/generate` route (topic:
  "How did you fund your startup without VC?") — 875 words pre-fix-completion timing, registered as a
  real draft in the queue and sent to the real Heron Telegram channel; left in place, it's genuine
  content, not test junk.

**3. Quill reposts — lengthened + substance requirement** (separate, smaller ask in the same session).
`prompts/koelRepost.js`'s repost-comment rules previously capped at 280 chars / a single punchy line,
which was producing reactions rather than real takes. Changed to a 3-6 line / ~400-700 char target with
an explicit instruction to explain *why* something matters, add a concrete example, or push back with a
sharper angle — not just summarize or agree with the quoted post. No length-safety-flag interaction
(that flag only applies to `short`/`punch` formats, confirmed — reposts were never flagged).

**Also, same session**: confirmed the dashboard switch-over (see the note above, under "Done") — the
live server had already been serving only the React app; `public/index.html` moved to
`archive/legacy-dashboard.html`.

**No commit/push** (standing rule — stays yours). Server re-verified healthy (`/`, `/api/agents` both
200) after every edit in this pass, since changes were made directly against the live dev server
(`node --watch`), not an isolated scratch instance.

---

## Phase 14 — Punch self-help mix, repost reverted to neutral, Heron reshaped to 4 short + 2 mid ✅ BUILT + VERIFIED (2026-08-01)
Direct feedback after seeing real Telegram output from Quill and Heron. Three changes, confirmed via a
clarifying round before building:

**1. Quill punch posts now include self-help/personal-development.** `agents/quill.js`'s
`assignTopics()` prompt updated: domain list now explicitly includes self-help/personal-development
(discipline, mindset, habits, growth) alongside AI/startup/dev/wellness, with "at least 1-2 of the 4
topics must be self-help." **Real finding while verifying**: today's actual top-15 research was 100%
tech/AI (the self-improvement Reddit source is currently 429-rate-limited — confirmed in yesterday's
error log — so zero self-help candidates existed in the source data that day). Fixed by explicitly
allowing the LLM to propose a freetext self-help angle when the research list has no genuine candidate
("this category is required every day regardless of what's in today's research") — re-verified, now
correctly returns a real self-help/mindset topic even with an all-tech research pool.

**2. Reposts reverted from "add your own take" to "neutral highlight."** This directly undoes a change
made earlier in this same session — the user's real Telegram output showed reposts injecting Souvik's
personal opinion, which isn't what they wanted. `prompts/koelRepost.js` rewritten: no first-person
opinion language, present the post's own idea and why it's worth reading, still 3-6 lines/400-700 chars
(the "can be lengthier" part of the feedback stays). **Real bug found + fixed during verification**:
`agents/koel.js`'s `draftRepost()` was reusing `format:'short'` (280-char cap baked into that format's
own guide) for repost generation — even with the repost's 400-700 char instruction marked "highest
priority," a live test showed output landing at 281 chars, right at `short`'s boundary, not honoring the
override (same class of bug as Koel's earlier hardcoded-count issue). Fixed by giving reposts their own
dedicated format, `repost` (`prompts/koelWrite.js`'s `FORMAT_META` + a formatGuide branch stating the
400-700 char target directly, no competing number anywhere) — re-verified, real output landed at 525
chars, neutral/curatorial tone, no first-person language.

**3. Heron's daily automation reshaped**: was 1 full article + 2 Notes, now **4 short (Note-length)
posts + 2 mid-size posts (~100 words)**, spanning self-help / achievement / AI-updates — no article in
the automated daily drop (article-writing stays available on-demand on the Heron page, untouched).
- [x] New Koel format `heronMid` (`prompts/koelWrite.js`) — ~80-120 words, one developed thought.
  Verified live: real sample landed at 105 words.
- [x] `agents/heron.js` — new `assignDailyTopics()` (one LLM call, mirrors Quill's `assignTopics()`
  shape, returns `{short:[4], mid:[2]}` each tagged `category: self-help|achievement|ai`; achievement is
  freetext — Souvik's own journey, no research link needed; falls back to a plain research-slice split
  if the LLM call fails) and `writeMidPost()` (mirrors `writeNote()`'s shape exactly). Verified live:
  real call returned 2 self-help + 1 achievement + 1 ai (short) and 1 achievement + 1 ai (mid) — correct
  category spread.
- [x] `scheduler/heronDrop.js`'s `runHeronDrop()` — removed the unconditional `heron.writeArticle()`
  call; now calls `assignDailyTopics()` then loops the 4 short + 2 mid topics through `writeNote()`/
  `writeMidPost()` individually (each topic is distinct, so one `koel.write()` call per topic), batching
  each bucket into a single Telegram send (one header per bucket, matching Quill's daily-batch delivery
  style) rather than one message per topic. Dropped the old `searchTopics()`-based "no long-form-worthy
  topics" guard — no longer relevant since nothing here requires article-worthy material.
- **Verification**: `node -c` on every changed file, live dry-`require()` of `heronDrop.js`/`heron.js`
  confirming exports intact, server (`node --watch`) restarted clean after every edit. Real LLM calls
  for `assignDailyTopics()`, `writeMidPost()`, and `writeNote()` individually (no test-data cleanup
  needed — none of these persist to a store on their own outside the full route/drop path). Did not run
  a full real `runHeronDrop()` end-to-end (would send 2 real Telegram batches + register 6 real drafts
  for no additional verification signal beyond what the individual-piece tests already confirmed) — next
  real scheduled/catch-up run will exercise the full path naturally.

**Files touched**: `agents/quill.js` (`assignTopics()` prompt), `prompts/koelRepost.js` (full rewrite),
`agents/koel.js` (`draftRepost()` now uses `format:'repost'`), `prompts/koelWrite.js` (new `heronMid`
and `repost` formats), `agents/heron.js` (`assignDailyTopics()`, `writeMidPost()`, new requires for the
LLM call), `scheduler/heronDrop.js` (`runHeronDrop()` rewritten).

No commit/push (standing rule). No test-data left in the real queue/store beyond what earlier
verification passes already created (Phase 13's real article + drafts remain, unaffected by this pass).

---

## Phase 15 — Parrot · LinkedIn: fully automated posting ✅ DONE — LinkedIn connected, verified live (2026-08-01 → 2026-08-07)
The first and only agent in TinySparrow that actually posts automatically. Everything else in this app
(X/Koel/Quill, Substack/Heron) is draft-only by design — this is a deliberate, explicit, confirmed
exception, not a scope creep. See the updated hard-stop note at the top of this document.

**Why this is different, and how the exception was reached**: TinySparrow's standing rule is draft-only on
every platform — reinforced as recently as Phase 8, where a technically-possible Substack auto-publish
path was researched and then deliberately parked specifically to preserve this rule. When Souvik asked for
LinkedIn to auto-post on Approve, I flagged the direct conflict before writing any plan, rather than
assuming it was fine because it was the newest ask. His answer: **"Yes, override it for LinkedIn"** —
explicit, informed, scoped to LinkedIn only. X and Substack are completely unaffected.

**Feasibility, researched (not assumed)**: personal-profile LinkedIn posting (`w_member_social` scope, the
free/self-serve "Share on LinkedIn" product) does **not** require LinkedIn partner/company approval —
that's only needed for the Community Management API (organization pages), which isn't what's needed here.
**One real constraint that shapes the design**: standard apps get no refresh token — access tokens expire
after 60 days flat and renewing requires Souvik to re-authorize via LinkedIn's browser consent screen
again (silent permanent auto-refresh is a paid-partner-tier-only feature). Designed around directly: a
daily expiry check + a one-click re-auth URL + a Telegram warning before it silently breaks, not hidden or
ignored.

**Confirmed via clarifying questions before building:**
- Post volume/safety: **no cap** — every approved draft posts to LinkedIn immediately, no daily throttle.
  Generation itself defaults to 1 topic/day (adjustable), which naturally limits day-to-day exposure even
  with no post-side cap.
- Content: **career/professional growth + AI/tech commentary + building-in-public (SaaS journey)** — a
  more professional/thought-leadership tone than X's punchy style, personal story (transplant/medals) used
  sparingly, same restraint Heron's articles already use.

**Design (mirrors Heron's Phase 8b/8c patterns throughout — dedicated bot, own scheduler toggle, own
idempotency stamp):**
- `utils/linkedinAuth.js` (new) — OAuth URL builder, code exchange, token storage (`state/data/
  parrotAuth.json`, not `.env` — this one needs programmatic read/write on re-auth), expiry check with a
  warning margin.
- `utils/linkedinClient.js` (new) — `postToLinkedIn()` against LinkedIn's Posts API. Exact request schema
  confirmed against LinkedIn's live docs at build time (research flagged the older UGC Posts API is being
  migrated to a newer Posts API — a build-time detail, not guessed in the plan). No edit-post endpoint
  exists on LinkedIn's side (confirmed) — a posted draft can only be deleted and reposted, not corrected.
- `agents/parrot.js` (new) — `assignDailyTopics()` (mirrors `heron.assignDailyTopics()`),
  `writePost()` (mirrors `writeNote()`/`writeMidPost()`, reuses `listPillars()` — same content niche, just
  a different platform tone, no new pillars file), `postApprovedDraft()` — the one shared Approve-time
  hook called from both the dedicated Telegram bot and the web Queue's Approve button, so posting logic
  isn't duplicated between the two paths.
- `prompts/koelWrite.js` — new `linkedin` format: short paragraphs, professional tone, ~150-300 words, a
  few hashtags at the end **is** appropriate here (unlike X's no-hashtag house rule elsewhere in this
  file) — reuses all of Koel's existing voice/context/retry/sanitize machinery for free.
- `server/routes/parrotTelegram.js` (new) — structural near-copy of `heronTelegram.js` (own token/chat-id,
  own polling boot, same `d|a/d|r/d|rr/d|c/d|e/d|b` callback codes). Its Approve branch is the genuinely
  new piece: calls `parrot.postApprovedDraft()`, edits the Telegram message to `✅ Posted to LinkedIn ↗
  <url>` on success or a clear `⚠️ Approved, but LinkedIn post failed: <reason>` on failure (draft stays
  in the queue, nothing silently lost).
- Scheduling mirrors **Quill's** directly-editable-time pattern (not Heron's derived-offset pattern, per
  "auto-scheduling like Quill"): `state/schedulerStore.js` gains `parrotEnabled` (default off, opt-in),
  `parrotLastRun`, and `linkedinDrop` as its own editable `DEFAULT_TIMES` entry. New `scheduler/
  parrotDrop.js` mirrors `heronDrop.js`'s shape exactly (reuses `ensureTodaysResearch()`, same
  `maybeCatchUp()` idempotency pattern).
- `web/src/pages/ParrotPage.jsx` (new, replaces the placeholder) — near-copy of Heron's Notes-section
  shape, plus a LinkedIn-connection status card (connected / needs re-auth, with the one-click re-auth
  link) — the one genuinely new UI element, since no other agent has a credential-expiry concern.

**Status: code-complete, built and verified everything short of a real LinkedIn post.** Every file listed
above is written and wired. Verified live on scratch ports (all Telegram/LinkedIn credentials unset —
confirmed clean no-op boot for all three bots), `npm run build:web` clean, and one real end-to-end test of
the trickiest part — the approve→post flow's failure handling: generated a real LinkedIn draft via
`POST /api/parrot/write`, called `POST /api/draft/:id/transition {state:'queued'}` with no LinkedIn
connected, confirmed it failed with a clear `"LinkedIn isn't connected yet..."` message *and* the draft
stayed in the normal `generated`-state queue (not silently lost, not stuck in limbo) — meaning the exact
same Approve button/tap works as retry once LinkedIn is actually connected, no separate recovery flow
needed. (This required a mid-build design fix: the original design transitioned to `'queued'` *before*
attempting the post, which would have made a failed post vanish from the default Queue view with no way
back — reordered to post first, transition only on success.)

**One real design decision made during the build, not asked about beforehand — flagging it explicitly**:
on a successful post, the draft is transitioned through `'queued'` then immediately `'posted'` (both
together, atomically) rather than skipping straight to `'posted'`, specifically so Parrot drafts still
feed the learning loop (`approvedDrafts` → Koel's "what's working" context) exactly like every other
approved draft in this app. Worth knowing since it's a judgment call, not something explicitly specified.

**Update (2026-08-07) — fully connected and verified live**: Souvik created the LinkedIn Developer App
and Parrot's dedicated Telegram bot (`@TS_Parrot_lnkdln_bot`), added the credentials to `.env`, restarted
the server, and completed the OAuth consent flow. Confirmed live: `GET /api/parrot/status` returns
`{connected:true, valid:true, daysLeft:60}`, connected identity is "CONNECT SARKAR" (Souvik's real
LinkedIn profile), token valid until 2026-10-06. The Parrot Telegram bot is polling cleanly with no
conflicts against the main/Heron bots (confirmed via `getMe` + boot-log check). **No real post has been
triggered yet** — per the standing design, that first post stays a deliberate, watched moment, not
something run automatically the instant the connection was confirmed. "Parrot auto-runs" remains OFF in
Schedules (opt-in), so nothing posts on a schedule until Souvik flips it on.

**Memory note**: the cross-session memory `tinysparrow-hard-stop.md` was updated alongside this entry to
record the LinkedIn carve-out precisely, so a future session doesn't misapply the old blanket rule to
block this work, while keeping the X/Substack guarantee unchanged and clearly stated.

---

## Phase 16 — Parrot: Plan LinkedIn Posts + Titto natural-language LinkedIn drafting ✅ DONE (2026-08-07)
Follow-up ask after LinkedIn was connected: give Parrot the same "fresh search + plan" flow Quill has
(scoped to LinkedIn), and let Titto draft-and-hand-off a LinkedIn post from plain chat ("post to
linkedin: ..."), with Approve as the confirmation step. Also asked for LinkedIn trending-topic/post
search — **researched and found genuinely infeasible officially**: LinkedIn's API has no trending-topics
or feed-search capability at any access tier, including paid partner tiers (confirmed via LinkedIn's own
2026 docs, not assumed). The only path to real LinkedIn-native trending data is an unofficial RapidAPI-
style scraper (same pattern already used for X data in this app, but LinkedIn's terms discourage it more
explicitly) — **asked directly, Souvik chose not to add one**, so "search trending" reuses the same
cross-platform Raven research already powering Quill/Heron, reframed for LinkedIn angles.

**Also confirmed via a clarifying question**: Titto's new "post to LinkedIn" chat flow hands off to
Parrot's dedicated bot for the actual Approve/post step, rather than letting the main bot post directly —
keeps real-posting capability isolated to one channel, matching Phase 15's original design intent.

**Built (mirrors Quill's `planSuggestions()`/`draftFromSuggestion()` almost exactly — `agents/quill.js`):**
- `state/parrotSessionsStore.js` (new) — near-copy of `quillSessionsStore.js`, tracks plan sessions +
  drafts for the "Previous plans" history view.
- `prompts/parrotPlan.js` (new) — suggestion-matching prompt using Parrot's fixed 3 categories (career /
  ai / building-in-public) instead of Quill's content pillars.
- `agents/parrot.js` — new `planSuggestions({forceFresh})` (same fresh-vs-4h-stale-cache decision as
  Quill's) and `draftFromSuggestion()` (writes a real, approvable `linkedin`-format draft and — unlike
  Quill's version, which is copy-only — also delivers it to Parrot's Telegram bot, since Parrot's whole
  design is generate→Approve→real-post). `writePost()` gained an optional `extraInstructions` param
  (merged with the existing pillar note) so Titto can pass tone/angle notes through.
- `server/routes/api.js` — `POST /api/parrot/plan`, `POST /api/parrot/draft`, `GET /api/parrot/sessions[/:id]`.
- `web/src/pages/ParrotPage.jsx` — new Plan/Write tab toggle; the Plan tab has the "Fresh search"
  checkbox + suggestion groups by category + "Previous plans" history, same visual pattern as Quill's page.
- `prompts/tittoReason.js` — new `write_linkedin_post` intent (triggers only when "linkedin"/"Parrot" is
  explicitly named, so it doesn't steal professional-sounding X requests from `write_post`).
- `agents/titto.js` — new intent branch calling `parrot.writePost()` with `telegramSendParrotDraft`; no
  interview-first step (the delivered Approve/Reject/Edit card *is* the confirmation). `handleMessage()`
  gained a `telegramSendParrotDraft` param, threaded from both `server/routes/telegram.js` (read lazily
  off `app.locals` since `parrotTelegram.js` initializes after `telegram.js`) and `server/routes/api.js`'s
  `POST /api/chat`.

**Verification — real live tests, not just syntax checks**: `npm run build:web` clean; real
`POST /api/parrot/plan` call produced genuine category-spanning suggestions (2 career, 3 ai, 2
building-in-public); real `POST /api/parrot/draft` on one suggestion produced a real LinkedIn-voice draft
and correctly appended it to the session (`GET /api/parrot/sessions/:id` confirmed `drafts.length: 1`);
real Titto chat test (`"post to linkedin: why building constraints force better product decisions"`)
correctly classified as `write_linkedin_post`, generated a real draft in the background, registered it in
the queue, and replied confirming the hand-off without claiming to post anything itself. All three test
drafts were delivered to the real Parrot Telegram channel with working buttons — left in place rather than
deleted, since removing the underlying draft records would break the already-delivered Telegram buttons.

---

## Phase 17 — No-personal-angle rule for Parrot/Heron + Parrot Telegram auto-post clarity ✅ DONE (2026-08-07)
Two pieces of direct feedback after seeing real Parrot/Heron output.

**1. Stop injecting Souvik's personal angle/story into Parrot and Heron content.** Both agents had a
category explicitly built around Souvik's own narrative — Heron's "achievement" (transplant comeback,
medals) and Parrot's "building-in-public" (his SaaS journey) — plus the `linkedin` format guide
explicitly *invited* personal-story grounding ("if the topic is personal... ground it in a real detail").
All reframed to be topical/observational instead of autobiographical:
- `prompts/koelWrite.js` — `note`, `heronMid`, and `linkedin` format guides all gained an explicit
  no-personal-angle rule (mirrors the rule `punch` already had: no "in my experience"/"when I..." framing
  unless the format itself calls for it — `motivational`, X-only, was deliberately left untouched since
  personal story is the literal point of that format).
- `agents/heron.js`'s `assignDailyTopics()` — "achievement" category redefined as the psychology/practice
  of achievement and recognition in general, not Souvik's own story.
- `agents/parrot.js`'s `assignDailyTopics()` and `prompts/parrotPlan.js` — "building-in-public" category
  redefined as the practice of building in public as a topic, not Souvik's own story.
- **Verified live**: a real Parrot draft on "why building in public is harder than it looks" came back as
  a direct, observational take with zero first-person narrative — confirmed no "I"/"my journey" framing.
  A real Heron Note on "why achievement is often measured wrong" came back as a general observation, same
  result.

**2. Parrot's Telegram messages didn't make the auto-post behavior obvious.** The draft card looked
identical to every other bot's ("✅ Approve" — files a draft, nothing more everywhere else), with nothing
in the message clarifying that tapping Approve here actually posts to LinkedIn immediately. Fixed in
`server/routes/parrotTelegram.js`:
- New `parrotActionKeyboard()` (local to this file, not the shared `telegramCore.actionKeyboard()` every
  other bot uses) — the Approve button now reads **"✅ Approve & Post to LinkedIn"**.
- The draft message itself now says **"⚡ Approve posts this to LinkedIn immediately — no further step"**
  right in the header line.
- Real bug caught during implementation: the auto-post note couldn't just go on its own line above the
  blank-line separator — `telegramCore.stripHeader()` (used to strip the header back off before showing
  "✅ Posted"/"❌ Rejected"/etc.) only matches up to the *first* `\n\n`, so a two-line header would have
  left half of it stuck in every subsequent message. Fixed by keeping it a single line (`📝 Draft
  (linkedin) — ⚡ Approve posts this to LinkedIn immediately`), verified against the actual regex before
  shipping, then confirmed live with a real draft sent through the live bot.

No commit/push (standing rule).

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
- UI (legacy, retired 2026-08-01): `archive/legacy-dashboard.html` (was `public/index.html`)
- UI (live): `web/` — React app; `web/src/pages/*` (one per agent), `web/src/lib/{api,queries,ws,nav}.js`
- Docs: `USE.md` (operator guide), `DEPLOY.md` (Oracle Cloud deploy), `IMPLEMENTATION.md` (this tracker)
