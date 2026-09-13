# genNpost — Product Brief for Presentation

*Prepared 2026-09-13. This is a source document for building a pitch deck, a LinkedIn/X post, or a demo video — every fact in here is real and drawn directly from the working codebase, not aspirational or invented. Sections are written so they can be lifted into slides largely as-is.*

---

## 1. One-liner

**genNpost is a chat-first, multi-agent content team that researches what's trending in your niche, learns your voice, drafts ready-to-post content for every platform you use, and lets you approve everything from a single Telegram chat.**

Internally, the orchestrator agent is named **Titto** — "Titto" is the product's personality; **genNpost** is the product name.

---

## 2. The Problem

- Creating good social content takes real time: finding what's worth writing about, writing it in a way that sounds like *you*, adapting it per platform, and actually posting on a schedule.
- Most people who'd benefit most — professionals, founders, and anyone building a personal brand — don't have an hour a day to spend on this.
- Existing tools solve one slice each, never the whole loop (see Section 6 — Competitive Landscape).
- Market signal (from research conducted for this product): AI-agent adoption in marketing/content workflows is already mainstream intent, not a hard sell — a large majority of marketing-tech leaders report actively piloting AI agents, and tailored, platform-specific AI content measurably outperforms generic AI content on engagement. The demand exists; the gap is a product that actually closes the whole loop end to end.

---

## 3. The Solution

genNpost runs the entire content pipeline as one connected system instead of a stack of disconnected tools:

**Research → Voice-matching → Multi-platform drafting → Your approval → Publish → Learn from the outcome**

The entire loop — from "here's an idea" to "this is live" — can happen without opening a dashboard. You talk to **Titto** the way you'd talk to a chief of staff, on Telegram or in a web chat, and it coordinates a team of specialist agents behind the scenes.

### How a piece of content actually moves through the system
1. **Research** — Raven scans six real sources (Hacker News, Reddit, GitHub, X/Twitter, YouTube, arXiv) for what's trending in your domain and ranks it.
2. **Drafting** — Koel (the writer) turns a topic — or a photo, see Section 5 — into a platform-correct draft: short/thread/longform for X, 150–300 words with hashtags for LinkedIn, Note or full post for Substack.
3. **Voice** — Every draft is written against your actual profile and your history of approvals, edits, and rejections — not a generic prompt. Rejections are remembered *with the reason* so the same mistake isn't repeated.
4. **Approval** — Nothing goes out unattended. Every draft — including real LinkedIn posts — waits for a tap from you, in Telegram, before it moves.
5. **Publish** — LinkedIn posts for real, immediately, on approval (official OAuth API, not a browser-automation hack). X and Substack arrive copy-ready, since neither offers a clean pay-per-post publish path worth automating yet.
6. **Learn** — What you approve, edit, and reject all feed back into the next draft. The system's output is designed to get more like *you* over time, not more generic.

---

## 4. The Agent Team

genNpost is not one model doing everything — it's a small team of purpose-built agents, each with a real, working responsibility:

| Agent | Role |
|---|---|
| **Titto** | Chief of Staff / orchestrator. The one thing you actually talk to — on Telegram and on the web. Understands intent, routes work to the right specialist, and remembers the conversation. |
| **Raven** | Research engine. Pulls and ranks trending content across 6 sources for your specific niche. |
| **Koel** | The writer. Platform-aware drafting (LinkedIn / X / Substack), calibrated against your real voice and approval history. |
| **Quill** | X's content manager — shapes Raven's research into the daily X drop, quote-reposts, and article ideas. |
| **Parrot** | LinkedIn's content manager — the one agent with a real, live auto-publish integration. |
| **Heron** | Substack's manager — full newsletter articles (with an image prompt) and short-form Notes. |
| **Analyst** | The learning engine — turns approvals, edits, and real post performance into concrete guidance that steers what gets written next. |

This multi-agent design is itself a differentiator: research, voice-matching, and per-platform drafting run as **specialized agents working in parallel**, not one generalist model working through platforms one at a time.

---

## 5. Feature Highlights

- **Chat-first control, not another dashboard.** The primary interface is a conversation — Telegram or an in-app chat with Titto — not a screen you have to remember to check. Titto messages *you* when something needs a decision.
- **Multi-platform from one idea.** One research hit becomes a LinkedIn post, an X thread, and a Substack piece — each genuinely shaped for that platform's register, not the same text pasted three times.
- **A real taste/feedback loop.** Every approve, edit, and reject is training data. This is a substantive subsystem, not a footnote: profile, voice examples, and a full approved/rejected history all persist and actively shape the next draft.
- **Photo-grounded generation.** Send Titto a photo on Telegram with an instruction like *"write a LinkedIn post about this"* and it uses computer vision to actually see what's in the image, then writes content genuinely grounded in it — not just the caption text.
- **Visual calendar with natural-language scheduling.** A real hour-by-hour drag-and-drop weekly calendar (not a mockup). Posts can be rescheduled from the web app *or* from Telegram chat in plain English — "tomorrow 9am," "Friday 6pm," or an exact date.
- **One-click bridge from approval to calendar.** Anything approved (via Telegram or the web) can be dropped straight onto the calendar at a chosen time, closing a gap most competitors don't even have (approving content and scheduling it are usually two disconnected steps).
- **Real LinkedIn auto-posting.** Official LinkedIn OAuth + REST publish API — approve on Telegram and it's live immediately. This is the one platform genNpost actually publishes to on your behalf; everything else is deliberately copy-ready-and-review rather than silently automated, by design (see Section 8).
- **Image generation.** Generate on-brand visuals from a post, a subject, or a raw prompt — approved images become training data for a visual style tuned to you over time.
- **Cost-aware by design.** Every LLM and image-generation call is priced and logged; a global spend guard can hard-stop runaway usage.
- **History, not a black hole.** Every draft's full lifecycle — pending, accepted, rejected (with reason), posted — stays visible and searchable in the app, not just scrolled past in a chat log.

---

## 6. Competitive Landscape — Why genNpost Is Different

Real market research (not assumption) shows every existing competitor covers only one slice of this loop:

| Category | Examples | What's missing |
|---|---|---|
| **Schedulers** | Buffer, Postiz | Distribute content you already wrote. No research step, no taste-learning. |
| **Single-platform ghostwriters** | Taplio, Supergrow, Typefully, TweetHunter | Locked to one platform (LinkedIn *or* X). Little to no real trending-topic research feeding the drafts; many rely on browser-session automation rather than official APIs, which carries real ban/ToS risk. |
| **Repurposers** | Blotato, Repurpose.io | Reformat one input into many platforms. No ideation or research step — a commoditized category. |
| **Enterprise brand-voice platforms** | Jasper | Built for teams and enterprise workflows, not chat-first, not built around a solo builder's Telegram-driven day. |
| **Closest direct competitor** | **ClimbX** | Does research → voice-matched drafts → engagement suggestions → learns from edits/performance → schedule — genuinely the nearest comparable product. But it's **X-only** and **web-dashboard-first** (not chat-first), priced around $29–39/mo. |

**No competitor found combines** trending-topic research → persisted taste-memory → multi-platform drafting with images → a visual calendar → chat-based control → real auto-posting, in one connected product. That full stack is what genNpost already has built and working — this is a genuine structural differentiator, not a hypothesis still to be validated.

---

## 7. Product Experience & Design

- **Brand identity:** genNpost — green as the foundation color (trust, growth), a distinct warm orange reserved only for calls-to-action, so the one thing you're meant to click always stands out.
- **Landing page** (`/welcome`): honest, no fabricated testimonials, user counts, or invented pricing — "Free while in beta" is stated plainly because that's the truth today.
- **Information architecture:** Titto (chat) is pinned as the top-level entry point; Studio (create) and Scheduler (the calendar) are the two daily-use surfaces; individual platform-manager pages (Quill/Parrot/Heron/etc.) still exist for anyone who wants agent-level detail, de-emphasized rather than removed.
- **Studio:** one composer for writing or generating, attaching media, saving, scheduling, and sending — replacing what used to be several disconnected steps.
- **History:** unrated drafts and already-decided ones (accepted/rejected, with reasons) are both visible and actionable in one place.

---

## 8. Trust, Safety & Guardrails

This is a deliberate, load-bearing part of the product story, not an afterthought:

- **Nothing posts unattended.** Every real LinkedIn post — the one platform genNpost can actually publish to — waits for an explicit human tap, every time, no exceptions.
- **X is intentionally manual-copy, not auto-post,** by design — X's API now charges per post, and genNpost chose not to pass that cost/risk to the user silently. Marketed honestly as "LinkedIn auto-posts, X is one-tap-ready," not "auto-posts everywhere."
- **Spend guardrails.** LLM and image-generation calls are priced, logged, and capped against a hard daily ceiling — a runaway loop or unexpected usage can't spend past a set limit unnoticed.
- **Access control.** The API and its live-update channel both require an access token once configured — not wide open by default.
- **No password sharing.** LinkedIn connects through its own official sign-in flow (OAuth); genNpost never sees or stores a LinkedIn password.

---

## 9. Under the Hood (for a technical slide)

- **Backend:** Node.js / Express, JSON-file-backed state (per-account), WebSocket for live updates.
- **Frontend:** React + Vite single-page dashboard, plus a fully separate public marketing site.
- **Control surface:** Telegram Bot API (polling mode — no inbound ports required) doubles as the primary UI; a parallel web chat exists for the same conversation.
- **AI:** OpenAI / OpenRouter for text generation (model-agnostic — DeepSeek, Claude, GPT are all swappable), a vision-capable model for photo-grounded drafting, and a dedicated image-generation pipeline.
- **Scheduling:** A real cron-driven scheduler plus an hour-granular calendar data model — any post can sit at any exact time, not just fixed daily slots.
- **Integrations:** LinkedIn (official OAuth + Posts API), 6 research sources for Raven, Telegram Bot API.

---

## 10. Current Status — Honest Framing

genNpost is a **working V0/beta**, built and refined through real, continuous use — not a mockup or a pitch-only prototype. What that means concretely:

**Live and real today:**
- The full research → draft → approve → publish loop, for a single user/account.
- Real LinkedIn auto-posting.
- The learning/taste loop (profile, voice, approval history).
- The visual calendar, Studio, and History pages.
- Photo-grounded generation, natural-language rescheduling, and the guardrails in Section 8.

**Deliberately out of scope for V0 (by decision, not oversight):**
- Multi-user / multi-tenant support — today it's a single account per deployment. This was a deliberate scoping call to polish the single-user experience fully before building tenancy.
- Instagram — deferred; Meta's Graph API + business-account + app-review process is an external blocker not worth risking a launch date on.
- Real-time X auto-posting — deferred due to X's per-post API pricing.

This "single working product, honestly scoped" position is itself a strength for a pitch: it's not a deck describing something that might get built — it's a live product with a clear, deliberate next stage.

---

## 11. Roadmap (what's next)

1. **Invite-only beta** — the natural next step once single-user polish (already largely done) is complete.
2. **Multi-tenancy** — per-user accounts, isolated data and LinkedIn connections, a real login system.
3. **Monetization** — billing (nothing exists yet; pricing today is "free while in beta" by necessity, not strategy).
4. **Platform expansion** — Instagram, and revisiting real-time X auto-posting once the economics make sense.

---

## 12. Quick-Reference Facts (for slide bullets / captions)

- **What it is:** a chat-first, multi-agent AI content team for social media — research, writing, scheduling, and (for LinkedIn) real publishing, all from one Telegram conversation.
- **Platforms covered:** LinkedIn (auto-post), X (copy-ready), Substack (copy-ready + full articles).
- **Research sources:** 6 — Hacker News, Reddit, GitHub, X/Twitter, YouTube, arXiv.
- **Agent team:** 7 named agents (Titto, Raven, Koel, Quill, Parrot, Heron, Analyst), each with a distinct, real responsibility.
- **Closest competitor:** ClimbX (X-only, dashboard-first, $29–39/mo) — genNpost differentiates on multi-platform + chat-first control.
- **Safety-first:** nothing posts without an explicit human approval; hard spend caps on AI usage.
- **Stage:** working V0/beta, single-user by deliberate design, real infrastructure already built — not a prototype.

---

*Everything above reflects the actual, working codebase as of 2026-09-13. If a generated slide, post, or video script adds a specific number, statistic, or claim not present in this document, verify it against this brief before publishing — the product's own landing page and every document in this repo hold to a strict no-fabrication standard, and this brief should be treated the same way.*
