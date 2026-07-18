# AGENTS.md (Raven — Functional Instructions)

## Research Run Flow

1. Read `tools/sources.config.js` to get enabled sources
2. Run all enabled fetchers in parallel (`Promise.allSettled`)
3. Collect raw results, deduplicate by URL
4. Truncate each item to: title + 200-char snippet + source + url
5. Apply instruction delta from Titto (if any)
6. Build ranking prompt via `prompts/rankResults.js`
7. ONE LLM call → ranked JSON array (top 12–15)
8. Write to `state/data/research-latest.json`
9. Archive to `state/data/research-archive/YYYYMMDD-HHmm.json`
10. Return results to Titto

---

## Topic Filters

### Include
- New AI model releases (GPT, Claude, Gemini, Llama, Mistral, etc.)
- AI tools and product launches
- AI automation, agents, workflows
- LLM research breakthroughs
- Tech startup news and funding
- Dev tools and frameworks
- Economic updates relevant to tech
- GitHub trending AI/ML repos
- YouTube videos from monitored channels with high view velocity

### Exclude (hard filter — never include)
- Religion
- Sports
- Celebrity gossip / entertainment
- Politics and government
- General lifestyle content

---

## Source Configuration

All sources defined in `tools/sources.config.js`. Each source has:
- `enabled`: toggle without code change
- `tier`: 1 = higher weight in ranking, 2 = lower weight
- `fetcher`: the tool file to call
- `maxResults`: cap per source

### Current Sources
| ID | Source | Tier | Key Required |
|---|---|---|---|
| hackernews | Hacker News | 1 | No |
| twitter | Twitter / X | 1 | Yes (fallback: scrape) |
| reddit | Reddit | 1 | No |
| github | GitHub | 1 | No |
| youtube | YouTube | 1 | Yes |
| arxiv | arXiv | 2 | No |
| googleai | Google AI Blog | 2 | No |

---

## YouTube Channels (Priority Order)

### Tier 1 (weight: 1.5× in ranking)
1. Matt Wolfe — AI tools & news
2. Liam Ottley — AI agency business
3. Greg Isenberg — Startup & AI strategy
4. Nick Saraev — AI automation & n8n
5. Corbin AI — AI agency income
6. Dave Shapiro — AI ethics/business
7. Ben's Bites / Pete Huang — AI newsletter
8. Ethan Mollick — AI education & research

### Tier 2 (weight: 1.0× in ranking)
9. Andrej Karpathy — Deep AI/ML
10. Fireship — Fast tech releases
11. AI Explained — Research simplified
12. Yannic Kilcher — Paper breakdowns
13. The AI Advantage — Practical AI tools
14. Wes Roth — LLM news
15. Jeff Su — AI productivity

---

## Reddit Subreddits to Monitor
- r/artificial
- r/MachineLearning
- r/LocalLLaMA
- r/startups
- r/technology
- r/singularity
- r/ChatGPT
- r/OpenAI

---

## Trending Score Calculation

Each result gets a score 0–100 based on:
- Engagement (upvotes, views, retweets) — 40%
- Recency (last 24hr = full score, older = decay) — 30%
- Source tier weight — 10%
- Relevance to AI/tech/startup topics — 20%

---

## Cache Policy

- Raw results cached in memory for 2 hours after a run
- Feedback/re-rank within 2hr: use cached raw results (no re-fetch)
- Feedback/re-rank after 2hr: full re-fetch from all sources
- `state/data/research-latest.json` always reflects the last successful run

---

## Output Schema

```json
{
  "runId": "20260404-0600",
  "triggeredBy": "scheduler | user | feedback-redo",
  "rankedAt": "ISO timestamp",
  "instructions": "optional delta from Titto",
  "sourcesRun": ["hackernews", "twitter", "reddit", "github", "youtube", "arxiv", "googleai"],
  "sourcesFailed": [],
  "totalFetched": 94,
  "results": [
    {
      "rank": 1,
      "title": "...",
      "summary": "...",
      "source": "hackernews",
      "url": "...",
      "trendingScore": 87,
      "postPotential": "thread",
      "why": "High engagement on HN, touches new Claude model release",
      "fetchedAt": "ISO timestamp"
    }
  ]
}
```
