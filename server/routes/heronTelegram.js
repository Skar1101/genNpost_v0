// Heron's own, dedicated Telegram bot — Substack drafts (articles + Notes) and their hand-off only.
// Fully separate from the main bot in telegram.js: own token, own chat, own inbound handling. Mirrors
// telegram.js's shape but scoped down — no Titto chat routing, no reply-target/article-idea flows,
// since those are X/Quill concepts that don't apply here. Optional: no-ops cleanly if unconfigured.
const TelegramBot = require('node-telegram-bot-api')
const memory = require('../../state/memory')
const articlesStore = require('../../state/articlesStore')
const { REASONS, actionKeyboard, reasonKeyboard, escapeHtml, stripHeader } = require('./telegramCore')

let bot = null
let _sendDrafts = null
let _sendHeronHandoff = null

function init(app) {
  const token = process.env.HERON_TELEGRAM_BOT_TOKEN
  const webhookUrl = process.env.HERON_TELEGRAM_WEBHOOK_URL
  const chatId = process.env.HERON_TELEGRAM_CHAT_ID

  if (!token) {
    if (process.env.HERON_TELEGRAM_CHAT_ID) {
      console.log('[HeronTelegram] No HERON_TELEGRAM_BOT_TOKEN — using the main bot for Heron delivery instead (see [Telegram] logs for same-bot mode).')
    } else {
      console.warn('[HeronTelegram] No HERON_TELEGRAM_BOT_TOKEN/HERON_TELEGRAM_CHAT_ID — Heron\'s Telegram delivery disabled (drafts still land in the web Queue)')
    }
    return null
  }

  const sendToUser = async (text) => {
    if (!chatId || !bot) return
    try {
      await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' })
    } catch (err) {
      try { await bot.sendMessage(chatId, text) } catch (e) { console.warn('[HeronTelegram] Send failed:', e.message) }
    }
  }

  // Push Heron drafts (article previews, Notes) with one-tap Approve / Reject / Edit buttons —
  // identical shape to the main bot's sendDrafts, via the shared telegramCore keyboard.
  const sendDrafts = async (drafts, opts = {}) => {
    if (!chatId || !bot || !Array.isArray(drafts)) return
    if (opts.header) { try { await bot.sendMessage(chatId, opts.header) } catch (_) {} }
    for (const d of drafts) {
      if (!d || !d.id) continue
      const body = `📝 Draft (${d.format || 'article'})\n\n${d.text}`
      try {
        await bot.sendMessage(chatId, body, { reply_markup: actionKeyboard(d.id) })
      } catch (e) { console.warn('[HeronTelegram] sendDraft failed:', e.message) }
    }
  }
  _sendDrafts = sendDrafts

  // Hand off a Substack draft the moment it's approved. Articles: one line only — the full text +
  // image prompt live in the Heron dashboard, no more multi-message content dump into Telegram.
  // Notes: already short, sent as-is.
  const sendHeronHandoff = async (draft) => {
    if (!chatId || !bot || !draft || draft.platform !== 'substack') return
    try {
      if (draft.meta?.kind === 'article' && draft.meta?.articleId) {
        const record = articlesStore.get(draft.meta.articleId)
        const title = record?.title || 'your article'
        await sendToUser(`🦢 "${title}" approved — ready to publish. Open the Heron page in the dashboard for the full text + image prompt.`)
      } else {
        await sendToUser(`🦢 Ready to post as a Substack Note:\n\n${draft.text || ''}`)
      }
    } catch (e) {
      console.warn('[HeronTelegram] sendHeronHandoff failed:', e.message)
    }
  }
  _sendHeronHandoff = sendHeronHandoff

  // Edit-reply flow state — Notes only (articles redirect to the Heron page instead, see the 'e' branch below).
  const pendingEdit = {}

  if (webhookUrl && webhookUrl.trim()) {
    bot = new TelegramBot(token)
    const webhookSecret = (process.env.HERON_TELEGRAM_WEBHOOK_SECRET || '').trim()
    const hookOpts = webhookSecret ? { secret_token: webhookSecret } : {}
    if (!webhookSecret) console.warn('[HeronTelegram] WARNING: HERON_TELEGRAM_WEBHOOK_SECRET not set — webhook is unauthenticated')
    bot.setWebHook(`${webhookUrl}/telegram/heron/webhook`, hookOpts)
      .then(() => console.log('[HeronTelegram] Webhook mode — registered:', webhookUrl))
      .catch(err => console.warn('[HeronTelegram] Webhook registration failed:', err.message))
    app.post('/telegram/heron/webhook', (req, res) => {
      if (webhookSecret && req.headers['x-telegram-bot-api-secret-token'] !== webhookSecret) {
        return res.sendStatus(403)
      }
      bot.processUpdate(req.body)
      res.sendStatus(200)
    })
  } else {
    bot = new TelegramBot(token, { polling: true })
    console.log('[HeronTelegram] Polling mode started')
  }

  // ── Messages — only the pending-edit flow (Notes) matters here; no Titto chat routing. ──────
  bot.on('message', async (msg) => {
    const incomingChatId = String(msg.chat.id)
    const text = msg.text || ''

    // /chatid works from any chat this bot is in, even before HERON_TELEGRAM_CHAT_ID is set —
    // answered before the allowlist gate below.
    if (text.trim().toLowerCase() === '/chatid') {
      await bot.sendMessage(incomingChatId, `This chat's id is: ${incomingChatId}`).catch(() => {})
      return
    }

    if (chatId && incomingChatId !== String(chatId)) {
      console.warn('[HeronTelegram] Message from unknown chat, ignoring')
      return
    }
    if (pendingEdit[incomingChatId] && text && !text.startsWith('/')) {
      const { id } = pendingEdit[incomingChatId]
      delete pendingEdit[incomingChatId]
      try {
        memory.transition(memory.accounts.getActiveAccount(), id, 'edited', { editedText: text })
        await sendToUser('✅ Saved your edited version.')
      } catch (e) {
        await sendToUser('Could not save the edit: ' + e.message)
      }
      return
    }
    // No other commands here — this channel is Heron-only; use the main bot or the dashboard for everything else.
  })

  // ── Inline-button taps — same d|a/d|r/d|rr/d|c/d|e/d|b action codes as the main bot. ────────
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
        const updated = memory.transition(acct, id, 'queued')
        await bot.editMessageText(`✅ Approved\n\n${bodyText}`, { chat_id: chat, message_id: msgId }).catch(() => {})
        await sendHeronHandoff(updated)
        return ack('Approved — hand-off on its way')
      }
      if (action === 'r') {
        await bot.editMessageReplyMarkup(reasonKeyboard(id), { chat_id: chat, message_id: msgId }).catch(() => {})
        return ack('Pick a reason')
      }
      if (action === 'b') {
        await bot.editMessageReplyMarkup(actionKeyboard(id), { chat_id: chat, message_id: msgId }).catch(() => {})
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
        const rec = memory.getDraft(acct, id)
        if (rec?.platform === 'substack' && rec?.meta?.kind === 'article') {
          return ack('Articles are too long to edit here — open the Heron page in the dashboard to refine it.')
        }
        pendingEdit[chat] = { id, at: Date.now() }
        return ack('Reply with your edited version')
      }
      return ack()
    } catch (e) {
      console.warn('[HeronTelegram] callback error:', e.message)
      return ack()
    }
  })

  let _lastPollErrMsg = null
  let _lastPollErrLog = 0
  bot.on('polling_error', (err) => {
    const now = Date.now()
    const isRepeat = err.message === _lastPollErrMsg
    if (!isRepeat || now - _lastPollErrLog > 60000) {
      console.warn('[HeronTelegram] Polling error (network?):', err.message)
      _lastPollErrMsg = err.message
      _lastPollErrLog = now
    }
  })

  console.log('[HeronTelegram] Bot initialized')
  return { sendToUser }
}

// Returns the Heron draft sender (with inline buttons), or null if not configured.
function getHeronDraftSender() {
  return _sendDrafts
}

// Returns the Heron hand-off sender (fires on Substack draft approval), or null if not configured.
function getHeronHandoffSender() {
  return _sendHeronHandoff
}

module.exports = { init, getHeronDraftSender, getHeronHandoffSender }
