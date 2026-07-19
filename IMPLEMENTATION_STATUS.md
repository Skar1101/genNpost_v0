# TinySparrow — Status Snapshot (2026-07-19)

Companion to [IMPLEMENTATION.md](IMPLEMENTATION.md) (left untouched). This file is a dated snapshot
of what's changed since IMPLEMENTATION.md was last updated (commit `685a42d`, 2026-07-18 22:20) —
work done, what's still pending phase-wise, and what to test. Update or replace this file next time
there's a batch of work to report; IMPLEMENTATION.md stays the long-lived master doc.

---

## ✅ Work done since the last update

**Dashboard restoration + missing-functionality pass:**
- **Top-bar fix** — every page's subtitle used to literally read "existing page — same layout,
  reskinned" (a leftover placeholder), and Control Center/Queue showed hardcoded fake numbers
  ("12 drafts waiting"). Both now pull real, live data.
- **Raven**:
  - Added the **Logs view** — Today / Errors / per-source scrape logs (Hacker News, Reddit, GitHub,
    Twitter, YouTube, arXiv, Raven), reusing the existing `/api/logs/*` endpoints.
  - Added a **click-to-open detail modal** on every result row — source/type/score/publisher badges,
    snippet, "why it matters", the source link, Ask Titto + Open Article buttons. Matches the old
    dashboard's modal exactly.
- **Quill**: was missing several real functions the old panel had —
  - **Generate Today** (manual daily-drop trigger)
  - **Weekly Run** (manual weekly wrap trigger)
  - **Write Article** shortcut (jumps to the Article Writer)
  - **Latest Search** card (mirrors Raven's top research items, same colored badges)
  - **Previous Plans** (collapsible history of past planning sessions, with their drafts)
  - All wired to backend endpoints that already existed but had no UI.
- **Koel**: added **Reload Files** (reloads profile/voice/approvals from disk without a restart).
- **Titto activity page**: rebuilt to match the old dashboard — colored per-agent badges
  (Raven/Quill/Koel/Article/Tools/Analyst), colored trigger badges, a status dot, and a working
  **"Open →"** that deep-links to the right agent page (an Article entry opens that exact article).
- **Article Writer**: rebuilt with the old dashboard's **right-side control panel** — Model (+ "via
  OpenRouter" note), Actions (Edit/rewrite, Copy, Export .md), Versions (preview any version, "Make
  current" only mutates when you actually choose to revert), and cost pinned at the bottom.
  - Found and fixed a real bug: **References never rendered** — `sources` lives at the article-record
    level, not per-version, and the page was reading the wrong field.
  - Found and fixed a layout bug: the **Past Articles dropdown** had no width cap, so long article
    titles made the browser size it huge and wrap onto its own row — capped at `max-width:170px`
    (matching the old dashboard) and set `flex: none`.
- New shared module `web/src/lib/sourceMeta.js` — source/type badge metadata + time/score helpers,
  so Raven and Quill use identical badge styling instead of duplicated logic.

All of the above was verified against **real backend data** on isolated test instances (Telegram
disabled, scratch ports 3097–3099), then cleaned up. Nothing was committed automatically — per the
standing rule, commits/pushes are done by you. One round already landed as commit `685a42d`; three
files (`ArticleWriterPage.jsx`, `TittoPage.jsx`, `globals.css`) are the latest batch, still uncommitted
as of this snapshot.

---

## 🔲 What's pending, phase-wise

Same order as `IMPLEMENTATION.md`'s "What's left" — unchanged by this session's work, still accurate:

1. **One live test** — trigger the daily drop from Telegram and confirm the dashboard updates on its
   own, without a manual refresh. Not touched this session; still open.
2. **Switch over** — once the new dashboard's been used a bit and nothing's missing, retire the old
   single-file dashboard (`public/index.html`).
3. **Put it on a server** — currently only runs while your laptop is on. `DEPLOY.md` has a ready, free
   hosting plan (Oracle Cloud) for 24/7 uptime. Needs a few decisions (VM already set up or fresh?
   live now or after more dashboard use?) before starting.
4. *(Later, not started)* — LinkedIn (Parrot) and Substack (Heron) as additional platforms.
   Deliberately deferred until the above is solid.

---

## 🧪 What to test

1. **Restart/rebuild the dashboard** — `npm run build:web`, then restart the server — to pick up
   everything below.
2. **Raven**
   - Click a result row (not the Write/Ask Titto/↗ buttons) → detail modal opens with the right
     badges, snippet, "why it matters," and link.
   - Click the **Logs** tab → Today / Errors / per-source scrape logs all load.
3. **Quill**
   - Click **Generate Today** and **Weekly Run** — these are real triggers and will message Telegram.
   - Confirm the **Latest Search** card shows real current research items.
   - Confirm **Previous Plans** expands real past planning sessions with their drafts.
4. **Koel** — click **Reload Files**, confirm the confirmation message appears.
5. **Titto page** — confirm activity rows show colored agent badges, and **Open →** navigates
   correctly (try an Article entry — it should deep-link straight to that article).
6. **Article Writer**
   - Open a past article that has cited sources (e.g. "6 Morning Habits That Are Destroying Your
     Productivity") → confirm References now renders.
   - Confirm the **Past Articles** dropdown stays on the same row as Write Article, doesn't wrap.
   - Preview an older version, then try **Make current**.
7. *(Still open from before)* — the live `/drop`-from-Telegram test (pending item 1 above).
8. *(Ongoing)* — paste weekly tweet stats via `/perf` when you have them; decide on Oracle Cloud VM
   timing whenever you're ready (optional, no rush).
