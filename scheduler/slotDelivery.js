const assetsStore = require('../state/assetsStore')
const imagesStore = require('../state/imagesStore')
const videosStore = require('../state/videosStore')
const memory = require('../state/memory')
const linkedinClient = require('../utils/linkedinClient')
const activityStore = require('../state/activityStore')
const logger = require('../utils/logger')
const log = logger.source('slots')

// What happens when a scheduled slot comes due. Platform routing is deliberate and asymmetric,
// matching the hard stop in IMPLEMENTATION.md:
//
//   LinkedIn — posts for real. This is the one written exception, already live via Parrot.
//   X        — Telegram nudge with the finished text, copy-ready, plus a "Posted ✅" button.
//   Substack — the same, to Heron's chat. Substack has no publish API anyway.
//
// Nothing here can post to X. There is no code path to it, by design.

const PUBLIC_URL = process.env.PUBLIC_URL || ''

function assetText(asset) {
  return asset.segments.map(s => s.text).join('\n\n')
}

// Threads arrive as segments; a human copying them needs them visibly separated and individually
// pasteable, so they're numbered rather than run together.
function copyReadyText(asset) {
  if (asset.segments.length === 1) return asset.segments[0].text
  return asset.segments.map((s, i) => `[${i + 1}/${asset.segments.length}]\n${s.text}`).join('\n\n———\n\n')
}

function imageLine(account, asset) {
  const id = asset.segments?.[0]?.imageId
  if (!id) return ''
  const img = imagesStore.get(account, id)
  if (!img) return ''
  return PUBLIC_URL ? `\n\n🖼 Image: ${PUBLIC_URL}${img.url}` : `\n\n🖼 Image attached (open the Library to download it)`
}

// One asset, delivered. Returns { ok, mode, error? }.
async function deliverAsset({ account, asset, telegramSend, telegramSendHeronDraft, sendAssetCard }) {
  const label = `${asset.platform} · ${asset.title.slice(0, 40)}`

  // ── LinkedIn: real post ────────────────────────────────────────────────────
  if (asset.platform === 'linkedin') {
    try {
      // Media is uploaded and attached now — it used to be dropped entirely, so a LinkedIn post
      // with a picture went out as bare text.
      const { imagePath, videoPath } = mediaPaths(account, asset)
      const { postUrn, url } = await linkedinClient.postToLinkedIn({ text: assetText(asset), imagePath, videoPath })
      assetsStore.update(account, asset.id, { state: 'posted', note: 'auto-posted to LinkedIn' })
      activityStore.recordAndBroadcast(null, {
        agent: 'parrot', action: 'post', triggerLabel: '⏰ Slot',
        summary: `posted to LinkedIn${url ? ' — ' + url : ''}`, ref: { kind: 'library' },
      })
      log.info(`Posted to LinkedIn from slot: ${postUrn || '(no urn)'}`)
      if (telegramSend) await telegramSend(`🦜 Posted to LinkedIn — ${asset.title}${url ? `\n${url}` : ''}`).catch(() => {})
      return { ok: true, mode: 'posted' }
    } catch (err) {
      log.error(`LinkedIn slot post failed for ${asset.id}: ${err.message}`)
      // State is deliberately left as 'scheduled' so the next tick retries rather than the post
      // being silently lost.
      if (telegramSend) await telegramSend(`⚠️ LinkedIn post failed for "${asset.title}": ${err.message}`).catch(() => {})
      return { ok: false, mode: 'posted', error: err.message }
    }
  }

  // ── X and Substack: hand off for manual posting ────────────────────────────
  const isSubstack = asset.platform === 'substack'
  const header = isSubstack
    ? `🦢 Substack slot — ready to publish`
    : `⏰ X slot — ready to post`
  // No image/video URL line here any more: sendAssetCard attaches the real file, so a link would
  // duplicate it (and PUBLIC_URL is usually unset, which made that line useless anyway).
  const body = `${header}

${copyReadyText(asset)}${linkLine(asset)}`

  const send = isSubstack && telegramSendHeronDraft ? telegramSendHeronDraft : telegramSend
  if (!send) {
    log.warn(`No Telegram channel for ${asset.platform} — leaving ${asset.id} scheduled`)
    return { ok: false, mode: 'handoff', error: 'no telegram channel configured' }
  }

  try {
    // sendAssetCard carries the "Posted ✅" button; plain send is the fallback when the bot isn't up.
    if (sendAssetCard) await sendAssetCard({ asset, text: body, substack: isSubstack })
    else await send(body)
    assetsStore.update(account, asset.id, { state: 'ready', note: 'delivered to Telegram for manual posting' })
    activityStore.recordAndBroadcast(null, {
      agent: isSubstack ? 'heron' : 'quill', action: 'slot_handoff', triggerLabel: '⏰ Slot',
      summary: `${asset.platform} asset delivered — ${asset.title.slice(0, 50)}`, ref: { kind: 'library' },
    })
    log.info(`Delivered ${label} to Telegram for manual posting`)
    return { ok: true, mode: 'handoff' }
  } catch (err) {
    log.error(`Slot handoff failed for ${asset.id}: ${err.message}`)
    return { ok: false, mode: 'handoff', error: err.message }
  }
}

/**
 * Deliver everything whose slot has passed. Called from the existing 30-minute tick in
 * scheduler/cron.js — no new job. Safe to call repeatedly: an asset leaves 'scheduled' as soon as
 * it's delivered, so it can't go out twice.
 */
async function deliverDue({ account = null, telegramSend = null, telegramSendHeronDraft = null, sendAssetCard = null } = {}) {
  const acct = account || memory.accounts.getActiveAccount()
  const due = assetsStore.dueBefore(acct, new Date().toISOString())
  if (!due.length) return { delivered: 0, failed: 0 }

  log.info(`${due.length} scheduled asset(s) due`)
  let delivered = 0, failed = 0
  for (const asset of due) {
    const r = await deliverAsset({ account: acct, asset, telegramSend, telegramSendHeronDraft, sendAssetCard })
    if (r.ok) delivered++; else failed++
  }
  return { delivered, failed }
}

module.exports = { deliverDue, deliverAsset, copyReadyText }
