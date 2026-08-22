// Standing rules distilled from the corrections Souvik actually makes to articles.
//
// Every "refine" instruction was already being recorded in the article version history and then
// completely ignored — 12 of them, saying the same three things over and over ("remove the link",
// "the first paragraph is not good", "make the headline more engaging"). Nothing read them, so the
// writer repeated the same mistakes indefinitely.
//
// These rules are injected into the article system prompt, so a correction given once becomes a
// standing instruction. Rules are editable and deletable — a wrong lesson steering every future
// article is worse than no lesson at all.
const fs = require('fs')
const accounts = require('./accounts')

const FILE = 'article-lessons.json'

function readJSON(file, fallback) {
  try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')) } catch (_) { /* ignore */ }
  return fallback
}
function writeJSON(file, data) {
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, file)
}

// { rules: [{ id, text, pinned, source }], learnedFrom, updatedAt }
function get(account) {
  const d = readJSON(accounts.accountFile(account, FILE), null)
  return d && Array.isArray(d.rules) ? d : { rules: [], learnedFrom: 0, updatedAt: null }
}

function save(account, { rules, learnedFrom }) {
  const current = get(account)
  // Two ways rules arrive: a re-learn passes a fresh list of LEARNED rules, and addRule passes the
  // whole current list with one new PINNED rule on the end. Both go through here, so the merge has
  // to keep pinned rules from EITHER source — an earlier version only kept pinned rules that were
  // already stored, which silently discarded every newly-added one.
  const normalized = (rules || [])
    .map(r => (typeof r === 'string' ? { text: r } : r))
    .filter(r => r && r.text && String(r.text).trim())
    .map((r, i) => ({
      id: r.id || `l${Date.now().toString(36)}${i}`,
      text: String(r.text).trim(),
      pinned: !!r.pinned,
      source: r.source || 'learned',
    }))

  // Pinned rules the user wrote by hand survive a re-learn even if the new list omits them.
  const incomingText = new Set(normalized.map(r => r.text.toLowerCase()))
  const survivingPinned = current.rules.filter(r => r.pinned && !incomingText.has(r.text.toLowerCase()))

  const seen = new Set()
  const merged = [...survivingPinned, ...normalized].filter(r => {
    const k = r.text.toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })

  const rec = {
    rules: merged,
    learnedFrom: learnedFrom ?? current.learnedFrom,
    updatedAt: new Date().toISOString(),
  }
  writeJSON(accounts.accountFile(account, FILE), rec)
  return get(account)
}

function addRule(account, text, { pinned = true } = {}) {
  const cur = get(account)
  cur.rules.push({ id: `l${Date.now().toString(36)}`, text: String(text).trim(), pinned, source: 'manual' })
  return save(account, { rules: cur.rules, learnedFrom: cur.learnedFrom })
}

function removeRule(account, id) {
  const cur = get(account)
  return save(account, { rules: cur.rules.filter(r => r.id !== id), learnedFrom: cur.learnedFrom })
}

// The block injected into the article system prompt. Empty string when nothing has been learned yet,
// so the prompt is unchanged until there is real signal.
function promptBlock(account) {
  const { rules, learnedFrom } = get(account)
  if (!rules.length) return ''
  return `
---
## LEARNED FROM SOUVIK'S OWN CORRECTIONS (${learnedFrom} edits so far)
He has asked for these changes before. Getting them wrong again is the most common way an article
gets rejected. These OUTRANK the general template above:
${rules.map(r => `- ${r.text}`).join('\n')}`
}

module.exports = { get, save, addRule, removeRule, promptBlock }
