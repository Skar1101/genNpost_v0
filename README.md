# GenNpost

A personal, draft-only AI social media manager for X, LinkedIn and Substack.

**The one rule: TinySparrow drafts, you post.** It never posts, replies, likes or retweets on X.
"Approve" files a draft in your local queue — you copy and post it yourself. LinkedIn is the single
deliberate exception: Parrot can publish there, and only after you tap Approve.

Everything runs on your machine. Drafts, research and history live in local JSON files, never a
hosted database.

---

## What it does

Positions the account around three content pillars — **AI**, **self-help**, **wellness** — and
produces a daily drop: short posts, threads, quote-reposts and article ideas, all in your voice,
grounded in that day's research.

## The agents

| Agent | Job |
|---|---|
| **Titto** | Chat. Understands, discusses, and hands work to the others *only when asked*. |
| **Raven** | Research. Fetches and ranks from Reddit, GitHub, Hacker News, X, YouTube and arXiv, and reads any link you paste. |
| **Koel** | Writes X posts, threads and replies. |
| **Quill** | Writes long-form X Articles. |
| **Heron** | Writes Substack newsletter posts. |
| **Parrot** | Writes LinkedIn posts — and is the only agent that can publish. |
| **Analyst** | Learns from your approvals, rejections and edits. |

Every hand-off Titto makes is recorded, so you can see exactly which instruction went to which agent.

## Requirements

- Node.js **18+**
- An `OPENAI_API_KEY`, or an `OPENROUTER_API_KEY` for access to more models

Everything else is optional and degrades gracefully: Telegram delivery, RapidAPI (X data), YouTube,
LinkedIn publishing, and image generation.

## Setup

```bash
npm install
cp .env.example .env      # then fill in at least one LLM key
npm run build:web         # build the dashboard
npm start                 # http://localhost:3000
```

The port defaults to **3000**; set `PORT` in `.env` to change it.

Use `npm start` for normal use. `npm run dev` adds `node --watch`, which restarts on **any** file
save — convenient while editing code, but it will kill a generation that's mid-stream.

After changing anything under `web/`, re-run `npm run build:web` and hard-refresh (Ctrl+Shift+R).

## Daily use

Most of the loop happens in Telegram: the drop arrives, you tap Approve / Reject / Edit on each
draft, and `/queue` gives you the keepers to copy.

**Rating drafts is the only thing that teaches it your voice.** An untouched draft teaches nothing;
`/triage` sends the newest unrated ones with one-tap buttons.

The dashboard covers the rest — Control Center (calendar), Studio (write a post with an image),
Library, Raven, Writer, Settings, and Titto's chat and activity feed.

## Documentation

- **[USE.md](USE.md)** — how to actually use it, step by step
- **[PIVOT_PLAN.txt](PIVOT_PLAN.txt)** — current product status: what's done, partial, or pending
- **[archive/IMPLEMENTATION.md](archive/IMPLEMENTATION.md)** — archived engineering changelog (pre-pivot build history, root-cause fixes, verified metrics)

## Your data

Everything lives in `state/data/` — drafts, approvals, research, articles, conversations — keyed by
account under `state/data/accounts/<handle>/`.

**`state/data/` is gitignored, so this repository is not a backup.** Deletions there are permanent;
back the directory up separately if the history matters to you.

## Layout

```
agents/      the seven agents above
prompts/     prompt builders + shared house style
sub-agents/  per-agent knowledge: voice, templates, examples
tools/       fetchers (GitHub, arXiv, Reddit, …), link reader, image generation
state/       JSON stores — the local database
scheduler/   cron jobs: research, the daily drop, the weekly wrap
server/      Express API + WebSocket streaming
web/         React dashboard (Vite → web/dist)
```

## Cost

Roughly a few dollars a month on `gpt-4o-mini` at normal volume. Every LLM call is priced and
recorded; Settings shows the running total, broken down by agent.
