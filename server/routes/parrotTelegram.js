// Parrot's own, dedicated Telegram bot — LinkedIn drafts and REAL auto-posting on Approve. This is the
// one bot in this app where "Approve" does not just file a draft — it calls the actual LinkedIn API.
// Fully separate from the main bot in telegram.js and from heronTelegram.js: own token, own chat, own
// inbound handling. Mirrors heronTelegram.js's shape closely; the Approve branch is the one genuinely
// different piece (a real post + a 'posted' transition, not a hand-off). Optional: no-ops cleanly if
// unconfigured — drafts still land in the web Queue either way, they just won't auto-post from there
// until a real LinkedIn connection + this bot are both configured.
const TelegramBot = require('node-telegram-bot-api')
const memory = require('../../state/memory')
const parrot = require('../../agents/parrot')
const { REASONS, reasonKeyboard, escapeHtml, stripHeader } = require('./telegramCore')

let bot = null
let _sendDrafts = null

// Parrot's own keyboard (not the shared telegramCore.actionKeyboard) — Approve is relabeled so it's
// unambiguous at a glance that tapping it posts to LinkedIn for real, immediately. Every other bot in
// this app uses the generic "Approve" (files a draft, nothing more) — Parrot is the one exception.
function parrotActionKeyboard(id) {
  return { inline_keyboard: [
    [
      { text: '✅ Approve & Post to LinkedIn', callback_data: `d|a|${id}` },
      { text: '❌ Reject', callback_data: `d|r|${id}` },
    ],
    [
      { text: '✏️ Edit', callback_data: `d|e|${id}` },
      { text: '📋 Copy', callback_data: `d|c|${id}` },
    ],
  ] }
}

function init(app) {
  const token = process.env.PARROT_TELEGRAM_BOT_TOKEN
  const webhookUrl = process.env.PARROT_TELEGRAM_WEBHOOK_URL
  const chatId = process.env.PARROT_TELEGRAM_CHAT_ID

  if (!token) {
    console.warn('[ParrotTelegram] No PARROT_TELEGRAM_BOT_TOKEN — Parrot\'s Telegram delivery disabled (drafts still land in the web Queue, but nothing auto-posts to LinkedIn from there without this bot)')
    return null
  }

  const sendToUser = async (text) => {
    if (!chatId || !bot) return
    try {
      await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' })
    } catch (err) {
      try { await bot.sendMessage(chatId, text) } catch (e) { console.warn('[ParrotTelegram] Send failed:', e.message) }
    }
  }

  // Push LinkedIn drafts with one-tap Approve / Reject / Edit buttons. Unlike every other bot in this
  // app, the message explicitly spells out what Approve does here — it's a real, immediate post.
  const sendDrafts = async (drafts, opts = {}) => {
    if (!chatId || !bot || !Array.isArray(drafts)) return
    if (opts.header) { try { await bot.sendMessage(chatId, opts.header) } catch (_) {} }
    for (const d of drafts) {
      if (!d || !d.id) continue
      // Single header line (not two) — telegramCore.stripHeader() only strips up to the first "\n\n",
      // so the auto-post note has to live on the same line as the header, not its own line above the blank.
      const body = `📝 Draft (${d.format || 'linkedin'}) — ⚡ Approve posts this to LinkedIn immediately\n\n${d.text}`
      try {
        await bot.sendMessage(chatId, body, { reply_markup: parrotActionKeyboard(d.id) })
      } catch (e) { console.warn('[ParrotTelegram] sendDraft failed:', e.message) }
    }
  }
  _sendDrafts = sendDrafts

  // Edit-reply flow state — LinkedIn drafts are short/medium (150-300 words), stored in full on the
  // draft record itself (no separate article store like Heron's articles), so inline edit-by-reply
  // works for every Parrot draft — no redirect-to-dashboard case needed here.
  const pendingEdit = {}

  if (webhookUrl && webhookUrl.trim()) {
    bot = new TelegramBot(token)
    const webhookSecret = (process.env.PARROT_TELEGRAM_WEBHOOK_SECRET || '').trim()
    const hookOpts = webhookSecret ? { secret_token: webhookSecret } : {}
    if (!webhookSecret) console.warn('[ParrotTelegram] WARNING: PARROT_TELEGRAM_WEBHOOK_SECRET not set — webhook is unauthenticated')
    bot.setWebHook(`${webhookUrl}/telegram/parrot/webhook`, hookOpts)
      .then(() => console.log('[ParrotTelegram] Webhook mode — registered:', webhookUrl))
      .catch(err => console.warn('[ParrotTelegram] Webhook registration failed:', err.message))
    app.post('/telegram/parrot/webhook', (req, res) => {
      if (webhookSecret && req.headers['x-telegram-bot-api-secret-token'] !== webhookSecret) {
        return res.sendStatus(403)
      }
      bot.processUpdate(req.body)
      res.sendStatus(200)
    })
  } else {
    bot = new TelegramBot(token, { polling: true })
    console.log('[ParrotTelegram] Polling mode started')
  }

  // ── Messages — only the pending-edit flow matters here; no Titto chat routing. ────────────────
  bot.on('message', async (msg) => {
    const incomingChatId = String(msg.chat.id)
    const text = msg.text || ''

    // /chatid works from any chat this bot is in, even before PARROT_TELEGRAM_CHAT_ID is set —
    // answered before the allowlist gate below.
    if (text.trim().toLowerCase() === '/chatid') {
      await bot.sendMessage(incomingChatId, `This chat's id is: ${incomingChatId}`).catch(() => {})
      return
    }

    if (chatId && incomingChatId !== String(chatId)) {
      console.warn('[ParrotTelegram] Message from unknown chat, ignoring')
      return
    }
    if (pendingEdit[incomingChatId] && text && !text.startsWith('/')) {
      const { id } = pendingEdit[incomingChatId]
      delete pendingEdit[incomingChatId]
      try {
        memory.transition(memory.accounts.getActiveAccount(), id, 'edited', { editedText: text })
        await sendToUser('✅ Saved your edited version. Tap Approve when ready — it will post to LinkedIn immediately.')
      } catch (e) {
        await sendToUser('Could not save the edit: ' + e.message)
      }
      return
    }
    // No other commands here — this channel is Parrot-only; use the main bot or the dashboard for everything else.
  })

  // ── Inline-button taps — same d|a/d|r/d|rr/d|c/d|e/d|b action codes as the other bots. Approve
  // is the one genuinely different branch: it calls the real LinkedIn API, not a hand-off. ────────
  bot.on('callback_query', async (q) => {
    const ack = (text) => bot.answerCallbackQuery(q.id, text ? { text } : undefined).catch(() => {})
    try {
      const chat = String(q.message?.chat?.id)
      if (chatId && chat !== String(chatId)) return ack()
      const parts = (q.data || '').split('|')
      if (parts[0] !== 'd') return ack()
      const [, action, id, code] = parts
      const acct = memory.accounts.getActiveAccount()
      const msgId = q.message.message_id
      const bodyText = stripHeader(q.message.text)

      if (action === 'a') {
        // Post FIRST, transition only on success — a failed post leaves the draft untouched
        // (still 'generated'), so this same Approve button works as retry with no extra UI needed.
        const draft = memory.getDraft(acct, id)
        await bot.editMessageText(`⏳ Posting to LinkedIn…\n\n${bodyText}`, { chat_id: chat, message_id: msgId }).catch(() => {})
        const result = await parrot.postApprovedDraft(draft)
        if (result.ok) {
          const linkLine = result.url ? `\n\n↗ ${result.url}` : ''
          await bot.editMessageText(`✅ Posted to LinkedIn${linkLine}\n\n${bodyText}`, { chat_id: chat, message_id: msgId }).catch(() => {})
          return ack('Posted to LinkedIn')
        }
        await bot.editMessageText(`⚠️ LinkedIn post failed: ${result.error}\n\nStill in your queue — tap Approve again to retry.\n\n${bodyText}`, { chat_id: chat, message_id: msgId, reply_markup: parrotActionKeyboard(id) }).catch(() => {})
        return ack('LinkedIn post failed — tap Approve to retry')
      }
      if (action === 'r') {
        await bot.editMessageReplyMarkup(reasonKeyboard(id), { chat_id: chat, message_id: msgId }).catch(() => {})
        return ack('Pick a reason')
      }
      if (action === 'b') {
        await bot.editMessageReplyMarkup(parrotActionKeyboard(id), { chat_id: chat, message_id: msgId }).catch(() => {})
        return ack()
      }
      if (action === 'rr') {
        const reason = REASONS[code] || 'other'
        memory.transition(acct, id, 'rejected', { reason })
        await bot.editMessageText(`❌ Rejected (${reason})\n\n${bodyText}`, { chat_id: chat, message_id: msgId }).catch(() => {})
        return ack(`Rejected`)
      }
      if (action === 'c') {
        await bot.sendMessage(chat, `<pre>${escapeHtml(bodyText)}</pre>`, { parse_mode: 'HTML' }).catch(() => {})
        return ack('Copy-ready text sent below 👇')
      }
      if (action === 'e') {
        pendingEdit[chat] = { id, at: Date.now() }
        return ack('Reply with your edited version')
      }
      return ack()
    } catch (e) {
      console.warn('[ParrotTelegram] callback error:', e.message)
      return ack()
    }
  })

  let _lastPollErrMsg = null
  let _lastPollErrLog = 0
  bot.on('polling_error', (err) => {
    const now = Date.now()
    const isRepeat = err.message === _lastPollErrMsg
    if (!isRepeat || now - _lastPollErrLog > 60000) {
      console.warn('[ParrotTelegram] Polling error (network?):', err.message)
      _lastPollErrMsg = err.message
      _lastPollErrLog = now
    }
  })

  console.log('[ParrotTelegram] Bot initialized')
  return { sendToUser }
}

// Returns the Parrot draft sender (with inline buttons), or null if not configured.
function getParrotDraftSender() {
  return _sendDrafts
}

module.exports = { init, getParrotDraftSender }
