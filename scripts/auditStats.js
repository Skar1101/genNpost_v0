#!/usr/bin/env node
// Reports drafts containing a statistic that looks invented. READ-ONLY — changes nothing on disk.
//
// Why this matters most for APPROVED drafts: analyst.analyze() treats approvals as voice examples,
// so a fabricated stat that sits in the approved set teaches the system that inventing numbers is
// house style. Un-approve the bad ones via Telegram /triage or the Queue.
//
// Usage:
//   node scripts/auditStats.js              # approved drafts only (the ones that matter)
//   node scripts/auditStats.js --all        # approved + queue + rejected
//   node scripts/auditStats.js --limit 40

const fs = require('fs')
const path = require('path')
const { findUngroundedStat } = require('../prompts/styleRules')

const args = process.argv.slice(2)
const showAll = args.includes('--all')
const limitArg = args.indexOf('--limit')
const LIMIT = limitArg > -1 ? parseInt(args[limitArg + 1], 10) || 50 : 50

const ACCOUNTS_DIR = path.join(__dirname, '..', 'state', 'data', 'accounts')

function readDrafts(file) {
  if (!fs.existsSync(file)) return []
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'))
    return Array.isArray(j) ? j : (j.drafts || [])
  } catch (_) {
    return []
  }
}

// A draft's own stored source material, when it kept any — that is what makes a figure "grounded".
function sourceFor(d) {
  return [
    d.sourceText, d.input, d.snippet, d.context,
    ...(Array.isArray(d.sources) ? d.sources.map((s) => `${s.title || ''} ${s.url || ''}`) : []),
  ].filter(Boolean).join('\n')
}

function auditFile(account, name, label) {
  const drafts = readDrafts(path.join(ACCOUNTS_DIR, account, name))
  const hits = []
  for (const d of drafts) {
    const text = d.editedText || d.text || ''
    const stat = findUngroundedStat(text, sourceFor(d))
    if (stat) hits.push({ stat, text, id: d.id, when: (d.createdAt || '').slice(0, 10), label })
  }
  return { total: drafts.length, hits }
}

// Directories only — the accounts dir also holds _active.json.
const accounts = fs.existsSync(ACCOUNTS_DIR)
  ? fs.readdirSync(ACCOUNTS_DIR).filter((n) => fs.statSync(path.join(ACCOUNTS_DIR, n)).isDirectory())
  : []
if (!accounts.length) {
  console.log('No accounts found under', ACCOUNTS_DIR)
  process.exit(0)
}

for (const account of accounts) {
  const targets = showAll
    ? [['approved-drafts.json', 'APPROVED'], ['draft-queue.json', 'QUEUE'], ['rejected-drafts.json', 'REJECTED']]
    : [['approved-drafts.json', 'APPROVED']]

  console.log(`\n═══ ${account} ═══`)
  let grand = 0
  for (const [file, label] of targets) {
    const { total, hits } = auditFile(account, file, label)
    grand += hits.length
    const pct = total ? Math.round((hits.length / total) * 100) : 0
    console.log(`\n${label}: ${hits.length} of ${total} drafts carry an ungrounded stat (${pct}%)`)
    hits.slice(0, LIMIT).forEach((h, i) => {
      const snippet = h.text.replace(/\s+/g, ' ').trim().slice(0, 150)
      console.log(`\n  ${i + 1}. [${h.stat}]  ${h.when}  id=${h.id || '?'}`)
      console.log(`     ${snippet}${h.text.length > 150 ? '…' : ''}`)
    })
    if (hits.length > LIMIT) console.log(`\n  …and ${hits.length - LIMIT} more (raise with --limit)`)
  }

  if (grand) {
    console.log(`\n→ Un-approve the fabricated ones: send /triage in Telegram, or open the Queue.`)
    console.log(`  Rejecting them is what stops the analyst learning invented stats as your voice.`)
  } else {
    console.log('\n✅ No ungrounded statistics found.')
  }
}

console.log('\n(Read-only — nothing was modified.)')
