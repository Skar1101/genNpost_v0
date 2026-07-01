const TelegramBot = require('node-telegram-bot-api')
const titto = require('../../agents/titto')
const memory = require('../../state/memory')

let bot = null
let _sendDrafts = null

const REASONS = { hook: 'weak hook', voice: 'off-voice', topic: 'wrong topic', seen: 'seen before', other: 'other' }

// One-tap action keyboards (callback_data stays well under Telegram's 64-byte limit)
function actionKeyboard(id) {
  return { inline_keyboard: [
    [
      { text: '✅ Approve', callback_data: `d|a|${id}` },
      { text: '❌ Reject', callback_data: `d|r|${id}` },
      { text: '✏️ Edit', callback_data: `d|e|${id}` },
    ],
    [{ text: '📋 Copy', callback_data: `d|c|${id}` }],
  ] }
}
const escapeHtml = (t) => (t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
function reasonKeyboard(id) {
  return { inline_keyboard: [
    [{ text: 'weak hook', callback_data: `d|rr|${id}|hook` }, { text: 'off-voice', callback_data: `d|rr|${id}|voice` }],
    [{ text: 'wrong topic', callback_data: `d|rr|${id}|topic` }, { text: 'seen before', callback_data: `d|rr|${id}|seen` }],
    [{ text: '↩ back', callback_data: `d|b|${id}` }],
  ] }
}
const stripHeader = (t) => (t || '').replace(/^📝[^\n]*\n\n/, '')

function init(app, broadcast) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL
  const chatId = process.env.TELEGRAM_CHAT_ID

  if (!token) {
    console.warn('[Telegram] No TELEGRAM_BOT_TOKEN — Telegram disabled')
    return null
  }

  const sendToUser = async (text) => {
    if (!chatId || !bot) return
    try {
      await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' })
    } catch (err) {
      try { await bot.sendMessage(chatId, text) } catch (e) { console.warn('[Telegram] Send failed:', e.message) }
    }
  }

  // Push drafts to Telegram with one-tap Approve / Reject / Edit buttons.
  // drafts: [{ id, text, format }] (from koel result.draftRecords + format)
  const sendDrafts = async (drafts, opts = {}) => {
    if (!chatId || !bot || !Array.isArray(drafts)) return
    if (opts.header) { try { await bot.sendMessage(chatId, opts.header) } catch (_) {} }
    for (const d of drafts) {
      if (!d || !d.id) continue
      const body = `📝 Draft (${d.format || 'short'})\n\n${d.text}`
      try {
        await bot.sendMessage(chatId, body, { reply_markup: actionKeyboard(d.id) })
      } catch (e) { console.warn('[Telegram] sendDraft failed:', e.message) }
    }
  }
  _sendDrafts = sendDrafts

  // Edit-reply flow state: when the user taps ✏️ Edit, the next plain message is the new text.
  const pendingEdit = {}

  if (webhookUrl && webhookUrl.trim()) {
    bot = new TelegramBot(token)
    bot.setWebHook(`${webhookUrl}/telegram/webhook`)
      .then(() => console.log('[Telegram] Webhook mode — registered:', webhookUrl))
      .catch(err => console.warn('[Telegram] Webhook registration failed:', err.message))
    app.post('/telegram/webhook', (req, res) => { bot.processUpdate(req.body); res.sendStatus(200) })
  } else {
    bot = new TelegramBot(token, { polling: true })
    console.log('[Telegram] Polling mode started')
  }

  // ── Messages ──────────────────────────────────────────────────────
  bot.on('message', async (msg) => {
    const incomingChatId = String(msg.chat.id)
    const text = msg.text || ''
    console.log(`[Telegram] Message from ${incomingChatId}: ${text}`)
    if (chatId && incomingChatId !== String(chatId)) {
      console.warn('[Telegram] Message from unknown chat, ignoring')
      return
    }

    // If awaiting an edit, treat this (non-command) message as the edited draft.
    if (pendingEdit[incomingChatId] && text && !text.startsWith('/')) {
      const { id } = pendingEdit[incomingChatId]
      delete pendingEdit[incomingChatId]
      try {
        memory.transition(memory.accounts.getActiveAccount(), id, 'edited', { editedText: text })
        await sendToUser('✅ Saved your edited version — Koel will learn from it.')
      } catch (e) {
        await sendToUser('Could not save the edit: ' + e.message)
      }
      return
    }

    try {
      const result = await titto.handleMessage({
        text,
        sessionId: `telegram-${incomingChatId}`,
        source: 'telegram',
        broadcast,
        telegramSend: sendToUser,
        telegramSendDraft: sendDrafts,
      })
      if (result.reply) await sendToUser(result.reply)
    } catch (err) {
      console.error('[Telegram] Handler error:', err.message)
      await sendToUser('Something went wrong on my end. Check the logs.')
    }
  })

  // ── Inline-button taps ────────────────────────────────────────────
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
        memory.transition(acct, id, 'queued')
        await bot.editMessageText(`✅ Approved\n\n${bodyText}`, { chat_id: chat, message_id: msgId }).catch(() => {})
        return ack('Approved — added to your queue')
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
        return ack(`Rejected — I'll avoid this`)
      }
      if (action === 'c') {
        // Send the draft as a copyable code block (Telegram shows a tap-to-copy icon)
        await bot.sendMessage(chat, `<pre>${escapeHtml(bodyText)}</pre>`, { parse_mode: 'HTML' }).catch(() => {})
        return ack('Copy-ready text sent below 👇')
      }
      if (action === 'e') {
        pendingEdit[chat] = { id, at: Date.now() }
        return ack('Reply with your edited version')
      }
      return ack()
    } catch (e) {
      console.warn('[Telegram] callback error:', e.message)
      return ack()
    }
  })

  let _lastPollErrMsg = null
  let _lastPollErrLog = 0
  bot.on('polling_error', (err) => {
    const now = Date.now()
    const isRepeat = err.message === _lastPollErrMsg
    if (!isRepeat || now - _lastPollErrLog > 60000) {
      console.warn('[Telegram] Polling error (network?):', err.message)
      _lastPollErrMsg = err.message
      _lastPollErrLog = now
    }
  })

  console.log('[Telegram] Bot initialized')
  return { sendToUser }
}

function getSendFn() {
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!bot || !chatId) return null
  return async (text) => {
    try { await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' }) }
    catch (_) { await bot.sendMessage(chatId, text).catch(() => {}) }
  }
}

// Returns the draft sender (with inline buttons), or null if Telegram isn't configured.
function getDraftSender() {
  return _sendDrafts
}

module.exports = { init, getSendFn, getDraftSender }
