# AGENTS.md (Quill — Functional Instructions)

## What Quill Does
Quill is the daily content planner. It runs automatically after ChitraG's morning research
and produces a full day's worth of X post drafts across multiple formats.

## Daily Run (`runDaily`)
Triggered by: scheduler at 6am IST (after ChitraG) OR `POST /api/quill/trigger`

### Step 1: Topic Assignment (1 LLM call)
Given ChitraG's top 15 results, assign topics:
- `motivational` — 3 freetext prompts grounded in Souvik's story
- `threads` — 1-2 research topics for thread format
- `shorts` — 3 research topics for short tweet format
- `trending` — 1 top viral item for short tweet

### Step 2: Koel Calls (sequential)
Calls `koel.write()` for each assignment:
- motivational ×3: `format='motivational'`, `inputType='freetext'`
- thread ×1: `format='thread'`, `inputType='topic'`
- short ×3: `format='short'`, `inputType='topic'`
- trending ×1: `format='short'`, `inputType='topic'`

Each call returns 3 drafts. Total: ~24 individual drafts.

### Step 3: Telegram Delivery
Each draft sent as a separate Telegram message with emoji prefix:
- `✍️ *Motivational · Draft N*`
- `🧵 *Thread · [topic]*`
- `💬 *Short · Draft N · [topic]*`
- `🔥 *Trending · Draft N*`

## Weekly Run (`runWeekly`)
Triggered by: scheduler on Sunday 6am IST OR `POST /api/quill/weekly`

1. Reads last 7 days of research archive
2. ONE LLM call: generates 4 long-form viral article angles
3. ONE Koel call: writes GitHub trending thread from week's GitHub items
4. Sends both to Telegram

## API Endpoints
- `GET  /api/quill/latest` — returns today's generated drafts
- `POST /api/quill/trigger` — manually trigger daily run (uses latest research)
- `POST /api/quill/weekly` — manually trigger weekly run

## State
- Output saved to `state/data/quill-latest.json`
- Schema: `{ generatedAt, assignments, drafts: [{ type, topic, text, draftIndex }], totalDrafts }`
