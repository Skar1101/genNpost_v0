# TinySparrow — Professional Social Media Manager: Architecture & Build Plan

## Vision
TinySparrow is a clean, minimal, professional **social media control center**. A team of AI agents,
led by a Chief of Staff, scouts each platform, drafts content in your voice, and learns from your
feedback. It evolves the existing engine rather than rewriting it. **Draft-only forever** — the
system never posts to any platform; you approve and post manually.

## Decisions (locked)
- **Stack:** React + Vite + Tailwind (frontend) · Node.js + Express (backend, existing). REST + WebSocket; Express serves the built React app in production (one deployable).
- **Home = Control Center:** landing page is the operations overview (team, runs, schedules, health). The Queue (triage inbox) is a one-click top-level tab.
- **Backend:** moderate reorg into layers; keep the agent engine intact.
- **Surfaces:** Web dashboard + Telegram at full parity (shared service layer feeds both).
- **Platforms:** X (now) + LinkedIn + Substack (this build); YouTube/Instagram later.
- **Draft-only** hard stop preserved on every platform. Audience: personal now, product-later.

---

## 1. The team (agent org)

```
Titto — Chief of Staff  (orchestrates the team; the chat you talk to)
│
├─ PLATFORM AGENTS   (each owns: trend sources · schedule · platform strategy)
│   ├─ Raven · X        research + X-shaped drafts   (today's engine, renamed)
│   ├─ Parrot · LinkedIn LinkedIn trends + posts     (data source TBD)
│   └─ Heron · Substack  articles + Notes, built ✅  (data source: Raven's research, filtered)
│
└─ SHARED SERVICES   (platform-agnostic; reused by every platform agent)
    ├─ Koel           the writer — drafts any platform's posts, format-aware
    ├─ Article Writer  dedicated long-form / essay tool (no persona)
    ├─ Analyst        performance & learning — cross-platform win-rates
    └─ Quill          content ops — batching, reposts, scheduling assembly
```

**Flow:** a platform agent scouts *where its platform's signal lives* and *what shape a post takes
there*, hands its picks to **Koel** (with that platform's format guide), and **Analyst** learns
across all of them. Platform agents share the research engine, writer, and learner — they differ
only in sources + strategy + format. Each appears in the Control Center with its own runs & schedule.

- **Rename:** ChitraG → **Raven** everywhere (file `chitrag.js`→`raven.js`, requires, internal ids
  `agent:'chitrag'`, WS/event names, prompts, UI, docs). Full rename, no legacy split. ✅ done.
- **Trend data for LinkedIn/Substack:** deferred. Design the platform-agent structure now; pick the
  actual source (creator/publication watchlist vs scraper/API) when we build each platform.

---

## 2. Backend structure (moderate reorg)

Service layer so web + Telegram share logic; platform abstraction so networks are adapters, not forks.

```
server/
  index.js          bootstrap: express + ws + telegram + scheduler
  app.js            middleware, static, auth (API_TOKEN gate)
  routes/           thin HTTP — validate, call a service, return JSON
    drafts.js  agents.js  research.js  replies.js  articles.js
    profile.js  insights.js  platforms.js  schedules.js  system.js
  ws/hub.js         websocket broadcast + typed event names
  telegram/         bot + handlers (call services, same as routes)
services/           orchestration shared by every surface
  draftService  researchService  contentService  articleService
  insightsService  replyService  profileService  agentService (roster/status/run-now)
agents/             the team
  titto.js          Chief of Staff (thin router → services)
  raven.js          X platform agent  (was chitrag.js)
  koel.js  quill.js  analyst.js  articleWriter.js  toolsAgent.js
core/
  researchEngine.js extracted fetch → dedup → balance → rank (reused by all platform agents)
platforms/          registry + one config per network
  index.js          registry: list, byId, personas
  x.js              { persona:'Raven', emoji, sources[], trendPrompt, formats, schedule }
  linkedin.js       { persona:'Parrot', … }        substack.js  { persona:'Heron', … }
prompts/  tools/  scheduler/  config/  utils/   (largely unchanged)
knowledge/          (today's sub-agents/) Koel + Article-Writer knowledge files
state/              JSON stores now, SQLite-ready interfaces (unchanged signatures)
```

**Platform-agent model:** a small generic runner + per-platform config. `raven.js` (X) is the first;
when LinkedIn/Substack land, the shared fetch/rank logic moves to `core/researchEngine.js` and each
platform agent = engine + its `platforms/*.js` config (sources, trend prompt, format guide, persona,
schedule). Personas (Raven/Parrot/Heron) are metadata on the config, so the Control Center lists them
as agents automatically.

**Built-vs-planned note (Heron, shipped):** when Heron actually got built, the `platforms/` registry +
`core/researchEngine.js` abstraction above turned out to be premature for a single second platform — it
was deferred (per the "reduce complexity" principle already used for the v1 X-only build). Heron
shipped instead as a plain `agents/heron.js` (same one-file-per-agent shape as every other agent),
which orchestrates by adding a `platform` param to the existing shared pieces: `articleWriter.js`
(`platform:'substack'` branches the template/prompt/output-parsing) and `koel.js` (`platform` threaded
through to the draft record; a `note` format added for Substack Notes). No new fetch/rank engine was
needed — Heron reuses Raven's existing research output (`postPotential`/`trendingScore` fields),
filtered for long-form-worthy items, via a new `state/heronTopicsStore.js`. If/when Parrot·LinkedIn is
built next, revisit then whether two platform agents justify extracting the registry — don't build it
speculatively for a third.

### Data model
- **Draft** gains `platform` (default `'x'`) + `sourceDraftId` (repurpose lineage). Lifecycle
  (`generated → queued/rejected/edited → posted → measured`) already platform-agnostic.
- **Agent run** records (extend `activityStore`): `{ agent, platform, startedAt, status, summary, ref }`
  power the Control Center roster + history.
- **Schedule** entries become data (per platform/agent), surfaced + toggleable in the UI.
- Account-keyed under `state/data/accounts/<account>/`; win-rates segment by platform.

### API contract (REST) + WS
```
GET  /api/agents                 roster: status, lastRun, nextRun, summary
POST /api/agents/:id/run         run-now (research/batch/etc.)
GET  /api/schedules  PUT /api/schedules/:id     (toggle / retime)
GET/PUT /api/profile             GET /api/platforms
GET  /api/drafts?platform=&state=   POST /api/drafts   POST /api/drafts/:id/transition
POST /api/drafts/:id/repurpose?to=linkedin
GET  /api/research/latest  POST /api/research/run  GET /api/research/archive
GET  /api/replies/latest   POST /api/replies/draft
GET/POST /api/articles  POST /api/articles/:id/refine|revert  GET .../export
GET  /api/insights  POST /api/performance
GET  /api/activity   GET /api/system/health|status
WS: agent:run  agent:done  draft:new  draft:updated  research:complete
    article:token|done  reply:targets  activity
```
Auth: existing `API_TOKEN` Bearer gate; frontend stores token in localStorage.

---

## 3. Frontend (React + Vite + Tailwind) — Control-Center first

Server state via **TanStack Query** (maps 1:1 to REST resources); thin WebSocket bridge pushes live
updates. No Redux. Minimal, professional design (Linear/Buffer feel): neutral + one accent, light/dark.

```
web/src/
  api/       client.js (fetch+token)  ws.js  queries.js
  layout/    AppShell  Sidebar(two-tier)  TopBar  TittoDock(persistent chat)
  pages/     ControlCenter  Queue  Compose  Calendar(later)
             AgentView (Raven/Parrot/Heron/Koel/Quill/Analyst/ArticleWriter)
             Insights  Activity  Schedules  Settings
  components/ AgentCard  RunTimeline  ScheduleRow  HealthPill  DraftCard
             PlatformBadge  FilterChips  StreamingText  Button Modal Toast EmptyState
  styles/    globals.css (Tailwind + tokens)
```

### Navigation (two-tier)
```
TinySparrow
────────────
▸ Control Center        ← home
WORK
  Queue                 ← triage inbox (approve/reject/edit/repurpose)
  Compose
  Calendar (later)
AGENTS
  Titto   (chat)
  Raven · X
  Parrot · LinkedIn
  Heron · Substack
  Koel · Writer
  Article Writer
  Analyst
  Quill · Ops
SYSTEM
  Activity   Schedules   Settings
```

### Control Center (home) — the operations overview
```
+-------------+------------------------------------------------+
| TinySparrow |  CONTROL CENTER          Titto: "Drop ready ▸" |
|             |  TEAM                                          |
| ▸ Control C.|  ┌ Raven·X ─────┐ ┌ Parrot·LI ─┐ ┌ Koel ────┐ |
| WORK        |  │ ✓ idle       │ │ ⏸ setup    │ │ ✓ idle   │ |
|   Queue  12 |  │ last 3:00 PM │ │ no source  │ │ 6 drafts │ |
|   Compose   |  │ next 6:00 PM │ │ [connect]  │ │ [open]   │ |
| AGENTS      |  └──────────────┘ └────────────┘ └──────────┘ |
|   Raven·X   |  TODAY   6 posts · 2 reposts · 3 ideas  [review]|
|   Parrot·LI |  SCHEDULES  3:00 research·3:45 drop·6:00·Sun ⏻ |
|   ...       |  HEALTH  ● HN ● X ● Reddit ○ arXiv    keys ✓✓✓ |
| SYSTEM      |  ACTIVITY  raven ran · koel wrote 6 · …         |
+-------------+------------------------------------------------+
```
- **Team roster:** each agent = an `AgentCard` (status, last run, **next scheduled run**, last output, Run-now/Open).
- **Today · Schedules · Health · Activity** panels — reuse existing `activityStore` + `/health` data.
- **Titto** lives as a persistent chat dock and a "team lead" line up top.

### Queue (main work surface)
Triage inbox: platform filter chips (All · X · LinkedIn · Substack); each `DraftCard` →
Approve / Reject(reason) / Edit / Copy / **Repurpose →**.

---

## 4. Build phases

**Phase 1 — Rename, contracts & scaffolding (no behavior change)**
- Full **Raven → Raven** rename.
- Backend: extract `services/`; split `routes/`; add `platforms/` registry (X only) + `platform` on
  drafts; add `/api/agents` + `/api/schedules`. Document REST + WS.
- Frontend: scaffold Vite+React+Tailwind, AppShell + two-tier Sidebar + Titto dock, API/WS/auth, TanStack Query.

**Phase 2 — Control Center + Queue MVP (web parity with today, X only)**
- Build Control Center (roster/today/schedules/health/activity), Queue, Compose, Raven/Koel/Quill/
  Analyst/Article-Writer views, Insights, Activity, Schedules, Settings — full parity with the current dashboard.

**Phase 3 — Platform agents (LinkedIn + Substack)**
- **Substack · Heron — done.** Shipped as `agents/heron.js` (see the "Built-vs-planned note" above for
  why this skipped the `platforms/`+`core/researchEngine.js` abstraction). Topic search reuses Raven's
  research (no new trend source); writes full Substack articles (subject/preview/subtitle/body +
  a text image-generation prompt) and short Notes tied to content pillars. **No auto-posting** — Substack
  has no official publishing API, so approving on Telegram hands off everything (formatted article,
  image prompt, or Note) ready to paste — the final "hit publish" click on Substack's own site stays
  manual, same draft-only hard stop as X. Each draft gets the normal approve/reject/edit card on
  generation; hand-off fires as a second, separate Telegram delivery the moment it's approved.
- **LinkedIn · Parrot — not started.** Deliberately deferred until Heron proved out the platform-agent
  pattern. When picked up: extract `core/researchEngine.js` only if a `platforms/*.js` registry is
  actually justified by then; **repurpose** flow (approved X draft/article → LinkedIn). Telegram reaches
  parity. Appears in the Control Center once real.

**Phase 4 — Production**
- Build frontend → served by Express; deploy to VPS (HOST/API_TOKEN, PM2); daily `state/data/` backups;
  route legacy agents through the model layer (per-task model choice).

**Phase 5 — Polish (on demand)**
- Calendar view; SQLite behind store interfaces when JSON strains; further product-readiness.

**Already done:** weekly-wrap crash fix (`quill` now required in `scheduler/cron.js`).

## 5. Verification per phase
- P1: old dashboard + Telegram unchanged; `/api/agents` + `/api/schedules` return parity data; Raven rename complete (grep: no `chitrag`); React shell loads authed.
- P2: every current action reproducible in React; Control Center shows live agent status via WS; schedules toggle.
- P3: Heron appears as a real agent with runs — real topic search, a real Substack article (word count,
  subject/preview/subtitle/image-prompt all present, markers stripped from the stored body), a real
  Note, both showing up as `platform:'substack'` in the Queue; approving one exercises the Telegram
  hand-off path without throwing; a parallel real X-article generation confirms zero regression. Parrot
  (once built): appears as an agent with runs; `/linkedin <topic>` + Repurpose produce platform-tagged
  drafts; X drop unchanged.
- P4: boots on VPS via PM2; dashboard reachable with token / 401 without; backup restores; `/health` green.
- Regression each phase: server boots clean, hard-stop intact (no publish path anywhere).
