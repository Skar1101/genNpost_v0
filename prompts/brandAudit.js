// Brand-gap audit prompt — given Souvik's REAL tweets (with real engagement) and REAL high-performing
// niche posts (from Raven's own research pool, also real engagement), find the actual structural gap.
// Grounded in real numbers throughout — not generic "post more threads" advice.

function fmtTweet(t) {
  return `[eng:${t.engagement} views:${t.views}] "${t.text.replace(/\n+/g, ' ').slice(0, 220)}"`
}

function buildBrandAuditPrompt({ user, top, bottom, avgEngagement, avgViews, niche }) {
  const topList = top.map(fmtTweet).join('\n')
  const bottomList = bottom.map(fmtTweet).join('\n')
  const nicheList = niche.map(n => `[eng:${n.engagement} views:${n.views}] @${n.publisher}: "${(n.text || '').slice(0, 220)}"`).join('\n')

  return `You are a real, blunt social-growth analyst reviewing Souvik's actual X (Twitter) performance —
not a generic content coach. Every number below is real, pulled live from the X API. Be specific and
reference the actual tweets, not abstractions.

SOUVIK'S REAL PROFILE:
- ${user?.sub_count ?? '?'} followers, ${user?.statuses_count ?? '?'} total tweets posted, account created ${user?.created_at || 'unknown'}
- Bio: "${user?.desc || ''}"
- Real average per tweet (last ~36 original posts, one week): ${avgEngagement.toFixed(1)} engagement, ${avgViews.toFixed(1)} views

SOUVIK'S TOP PERFORMERS (of his own real tweets, still very low absolute numbers):
${topList}

SOUVIK'S BOTTOM PERFORMERS (real, zero-engagement):
${bottomList}

REAL HIGH-PERFORMING POSTS RIGHT NOW in the same niche (discipline/self-improvement/AI — from other
accounts, pulled by this app's own research, real engagement numbers):
${nicheList}

TASK: Compare Souvik's real output against the real niche comparison set and his own real top-vs-bottom
split. Identify the ACTUAL structural gap — not generic advice. Consider (grounded in what you actually
see in the text above, cite specifics):
- Hook quality: do his openers stop the scroll, or are they generic/templated ("X vs Y" bullet format,
  vague motivational lines)?
- Specificity: do the niche viral posts use concrete numbers/timeframes/stakes that his posts lack?
- Voice consistency: does his profile read as ONE coherent brand, or does it swing between AI-news-
  explainer, generic motivational quotes, personal life updates, and finance commentary with no throughline?
- AI-slop tells: do any of his posts read like unedited AI-generated summaries (corporate hedging phrases,
  "this insight highlights...", "a must-read", explainer tone) rather than a real opinionated voice?
- Format: single tweets only, or any threads? The niche's virals — are they threads or singles?
- What's actually working, even a little, in his OWN top performers — don't just tear it all down.

Return ONLY valid JSON — no markdown, no preamble:
{
  "summary": "2-3 sentence blunt diagnosis of the real, specific gap — not generic advice",
  "gaps": ["specific gap 1, citing an actual example from his tweets", "specific gap 2", "..."],
  "recommendations": ["specific, actionable change 1 — not generic ('post more threads') but concrete ('X')", "..."]
}`
}

module.exports = { buildBrandAuditPrompt }
