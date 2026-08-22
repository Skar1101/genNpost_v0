const { sanitize } = require('../prompts/styleRules')

// Turns raw draft text into a publishable shape: segments, house-style polish, and per-platform
// validation.
//
// The important rule lives here: **polish is computed, never auto-applied to human writing.**
// finish() returns both the original and the polished text plus a list of what changed, and the
// caller decides. Agent-generated drafts get the polish applied; anything the user typed or pasted
// gets it offered as a diff. Silently rewriting someone's own words is not a feature.

// Per-platform limits. `hard` is a real platform ceiling; `soft` is a house target worth warning at.
const LIMITS = {
  x:        { hardPerSegment: 280, softMinWords: null, softMaxWords: null },
  linkedin: { hardPerSegment: 3000, softMinWords: 150, softMaxWords: 300 },
  substack: { hardPerSegment: 5000, softMinWords: null, softMaxWords: null },
}

// ── Thread splitting ─────────────────────────────────────────────────────────
// Koel emits threads as one blob with "Tweet 1/" markers, and until now nothing split them —
// agents/koel.js only counted the markers to warn when a thread ran long. A thread delivered as a
// single block is not a thread, so this is where it becomes one.
const TWEET_MARKER = /^[ \t]*Tweet[ \t]*(\d+)[ \t]*\/?[ \t]*:?[ \t]*/gim

function splitSegments(text, platform) {
  const body = String(text || '').trim()
  if (!body) return []

  // Only X has threads. LinkedIn and Substack are always one segment.
  if (platform !== 'x') return [{ text: body }]

  if (!/^[ \t]*Tweet[ \t]*\d+/im.test(body)) return [{ text: body }]

  const parts = []
  let last = null
  let cursor = 0
  TWEET_MARKER.lastIndex = 0
  let m
  while ((m = TWEET_MARKER.exec(body)) !== null) {
    if (last !== null) parts.push(body.slice(cursor, m.index).trim())
    last = m[1]
    cursor = m.index + m[0].length
  }
  if (last !== null) parts.push(body.slice(cursor).trim())

  const segs = parts.filter(Boolean).map(t => ({ text: t }))
  return segs.length ? segs : [{ text: body }]
}

// ── Capitalization guard ─────────────────────────────────────────────────────
// There was a real regression where every draft came back entirely lowercase. A prompt rule was
// added, but a prompt rule is not a guarantee — this is the deterministic backstop.
//
// Only fires on the actual regression signature (essentially no capitals anywhere). It deliberately
// does NOT touch text that already capitalizes normally, so a stylistically lowercase line inside
// otherwise normal writing is left alone.
function looksAllLowercase(text) {
  const letters = (text.match(/[a-zA-Z]/g) || []).length
  if (letters < 40) return false                      // too short to judge
  const uppers = (text.match(/[A-Z]/g) || []).length
  return uppers / letters < 0.005
}

function fixCapitalization(text) {
  let out = String(text || '')
  // Sentence starts: beginning of the string, or after . ! ? followed by whitespace, or a newline.
  out = out.replace(/(^|[.!?]\s+|\n\s*)([a-z])/g, (_, pre, ch) => pre + ch.toUpperCase())
  // Standalone "i" → "I".
  out = out.replace(/\bi\b/g, 'I')
  return out
}

// ── Validation (never mutates) ───────────────────────────────────────────────
function validate(segments, platform) {
  const limits = LIMITS[platform] || LIMITS.x
  const warnings = []

  segments.forEach((seg, i) => {
    const len = seg.text.length
    if (len > limits.hardPerSegment) {
      warnings.push({
        level: 'error',
        segment: i,
        message: `${platform === 'x' ? 'Tweet' : 'Post'} ${segments.length > 1 ? i + 1 + ' ' : ''}is ${len} characters — over the ${limits.hardPerSegment} limit by ${len - limits.hardPerSegment}.`,
      })
    }
  })

  if (limits.softMinWords || limits.softMaxWords) {
    const words = segments.map(s => s.text.split(/\s+/).filter(Boolean).length).reduce((a, b) => a + b, 0)
    if (limits.softMinWords && words < limits.softMinWords) {
      warnings.push({ level: 'warn', segment: null, message: `${words} words — under the ${limits.softMinWords}-word target for ${platform}. Short posts read as an X post that wandered in.` })
    }
    if (limits.softMaxWords && words > limits.softMaxWords) {
      warnings.push({ level: 'warn', segment: null, message: `${words} words — over the ${limits.softMaxWords}-word target for ${platform}.` })
    }
  }

  // Platform conventions that are cheap to check and easy to get wrong by hand.
  const all = segments.map(s => s.text).join('\n')
  const hashtags = (all.match(/#\w+/g) || []).length
  if (platform === 'x' && hashtags > 0) {
    warnings.push({ level: 'warn', segment: null, message: `${hashtags} hashtag${hashtags === 1 ? '' : 's'} — X posts here don't use them.` })
  }
  if (platform === 'substack' && hashtags > 0) {
    warnings.push({ level: 'warn', segment: null, message: `${hashtags} hashtag${hashtags === 1 ? '' : 's'} — Substack has no hashtag culture; they read as imported.` })
  }
  if (platform === 'linkedin') {
    if (hashtags === 0) warnings.push({ level: 'warn', segment: null, message: 'No hashtags — LinkedIn expects 3-5 specific ones at the end.' })
    else if (hashtags > 5) warnings.push({ level: 'warn', segment: null, message: `${hashtags} hashtags — LinkedIn works best with 3-5.` })
    if (/https?:\/\//.test(all)) warnings.push({ level: 'warn', segment: null, message: 'Link in the body — LinkedIn suppresses reach for these. Put it in the first comment.' })
  }

  return warnings
}

/**
 * @param {string} text      raw draft text
 * @param {string} platform  x | linkedin | substack
 * @returns {{ segments, polishedSegments, changes, warnings, changed }}
 *   `segments`          — split from the ORIGINAL text, unmodified
 *   `polishedSegments`  — the same, with house style applied
 *   `changes`           — human-readable list of what polish would do (empty if nothing)
 */
function finish({ text, platform = 'x' } = {}) {
  const raw = String(text || '')
  const segments = splitSegments(raw, platform)

  const changes = []
  const polishedSegments = segments.map(seg => {
    let t = seg.text
    const beforeSanitize = t
    t = sanitize(t)
    if (t !== beforeSanitize) changes.push('Removed em/en dashes and collapsed blank-line runs.')
    if (looksAllLowercase(t)) {
      t = fixCapitalization(t)
      changes.push('Restored sentence capitalization (text was entirely lowercase).')
    }
    return { ...seg, text: t }
  })

  return {
    segments,
    polishedSegments,
    changes: [...new Set(changes)],
    changed: polishedSegments.some((p, i) => p.text !== segments[i].text),
    // Warnings describe the ORIGINAL — they are informational and never gate anything.
    warnings: validate(segments, platform),
  }
}

module.exports = { finish, splitSegments, validate, fixCapitalization, looksAllLowercase, LIMITS }
