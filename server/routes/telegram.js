const TelegramBot = require('node-telegram-bot-api')
const titto = require('../../agents/titto')

let bot = null

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
      // Markdown parse errors — retry as plain text
      try {
        await bot.sendMessage(chatId, text)
      } catch (e) {
        console.warn('[Telegram] Send failed:', e.message)
      }
    }
  }

  if (webhookUrl && webhookUrl.trim()) {
    // ── Webhook mode (production) ──────────────────────────────
    bot = new TelegramBot(token)
    bot.setWebHook(`${webhookUrl}/telegram/webhook`)
      .then(() => console.log('[Telegram] Webhook mode — registered:', webhookUrl))
      .catch(err => console.warn('[Telegram] Webhook registration failed:', err.message))

    app.post('/telegram/webhook', (req, res) => {
      bot.processUpdate(req.body)
      res.sendStatus(200)
    })
  } else {
    // ── Polling mode (local dev — no public URL needed) ────────
    bot = new TelegramBot(token, { polling: true })
    console.log('[Telegram] Polling mode started')
  }

  // Message handler (same for both modes)
  bot.on('message', async (msg) => {
    const incomingChatId = String(msg.chat.id)
    const text = msg.text || ''
    console.log(`[Telegram] Message from ${incomingChatId}: ${text}`)

    if (chatId && incomingChatId !== String(chatId)) {
      console.warn('[Telegram] Message from unknown chat, ignoring')
      return
    }

    try {
      const result = await titto.handleMessage({
        text,
        sessionId: `telegram-${incomingChatId}`,
        source: 'telegram',
        broadcast,
        telegramSend: sendToUser,
      })
      if (result.reply) await sendToUser(result.reply)
    } catch (err) {
      console.error('[Telegram] Handler error:', err.message)
      await sendToUser('Something went wrong on my end. Check the logs.')
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
    try {
      await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' })
    } catch (_) {
      await bot.sendMessage(chatId, text).catch(() => {})
    }
  }
}

module.exports = { init, getSendFn }
