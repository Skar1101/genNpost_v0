// Pure, closure-free Telegram formatting helpers shared by every bot instance (the main bot in
// telegram.js and Heron's dedicated bot in heronTelegram.js). No bot/chatId dependency here —
// safe to import from anywhere, safe to unit-test directly.

const REASONS = { hook: 'weak hook', voice: 'off-voice', topic: 'wrong topic', seen: 'seen before', other: 'other' }

// Telegram's native copy button (Bot API 7.11+) puts the text straight on the clipboard with no new
// message. It's capped at 256 characters, so anything longer falls back to the old behaviour —
// sending the draft as a <pre> block you tap to copy.
const COPY_TEXT_MAX = 256

function copyButton(id, text) {
  const t = String(text || '')
  return (t.length && t.length <= COPY_TEXT_MAX)
    ? { text: '📋 Copy', copy_text: { text: t } }
    : { text: '📋 Copy', callback_data: `d|c|${id}` }
}

// One-tap action keyboards (callback_data stays well under Telegram's 64-byte limit).
// `text` is optional — pass the draft body to get a real one-tap clipboard copy.
function actionKeyboard(id, text = '') {
  return { inline_keyboard: [
    [
      { text: '✅ Approve', callback_data: `d|a|${id}` },
      { text: '❌ Reject', callback_data: `d|r|${id}` },
      { text: '✏️ Edit', callback_data: `d|e|${id}` },
    ],
    [copyButton(id, text)],
  ] }
}

// Shown AFTER approve/reject. Previously the keyboard was dropped entirely at that point — approving
// a draft removed the Copy button, which is exactly when you want it, since approving is the moment
// you go and post the thing. Undo is here because a mis-tap was otherwise unrecoverable from chat.
function decidedKeyboard(id, text = '') {
  return { inline_keyboard: [
    [copyButton(id, text), { text: '↩ Undo', callback_data: `d|u|${id}` }],
  ] }
}

// Slot-delivered assets (scheduler/slotDelivery.js). Separate namespace from drafts ('d|') because
// these are library assets, not draft-queue records.
//
// "Posted ✅" matters more than it looks: with the real-tweet ingest deferred, this tap is the ONLY
// signal that anything actually shipped on X or Substack. Without it, assets stall exactly the way
// 12 approved drafts sat at 'queued' from June onward.
function assetKeyboard(id) {
  return { inline_keyboard: [
    [
      { text: '✅ Posted', callback_data: `as|p|${id}` },
      { text: '⏰ Snooze 1h', callback_data: `as|s|${id}` },
    ],
  ] }
}

function reasonKeyboard(id) {
  return { inline_keyboard: [
    [{ text: 'weak hook', callback_data: `d|rr|${id}|hook` }, { text: 'off-voice', callback_data: `d|rr|${id}|voice` }],
    [{ text: 'wrong topic', callback_data: `d|rr|${id}|topic` }, { text: 'seen before', callback_data: `d|rr|${id}|seen` }],
    [{ text: '↩ back', callback_data: `d|b|${id}` }],
  ] }
}

const escapeHtml = (t) => (t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const stripHeader = (t) => (t || '').replace(/^📝[^\n]*\n\n/, '')

// Split long text into Telegram-safe chunks (message cap is 4096 chars), preferring paragraph
// boundaries so a chunk break never lands mid-sentence. Hard-splits any single paragraph that alone
// exceeds maxLen.
function chunkForTelegram(text, maxLen = 3500) {
  const paras = String(text || '').split(/\n{2,}/)
  const chunks = []
  let cur = ''
  for (const p of paras) {
    const piece = cur ? `${cur}\n\n${p}` : p
    if (piece.length > maxLen) {
      if (cur) chunks.push(cur)
      if (p.length > maxLen) {
        for (let i = 0; i < p.length; i += maxLen) chunks.push(p.slice(i, i + maxLen))
        cur = ''
      } else {
        cur = p
      }
    } else {
      cur = piece
    }
  }
  if (cur) chunks.push(cur)
  return chunks
}

module.exports = { REASONS, actionKeyboard, decidedKeyboard, copyButton, assetKeyboard, reasonKeyboard, escapeHtml, stripHeader, chunkForTelegram }
