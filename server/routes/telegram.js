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

  bot = new TelegramBot(token)

  const sendToUser = async (text) => {
    if (!chatId) return
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

  // Register webhook if URL provided
  if (webhookUrl) {
    bot.setWebHook(`${webhookUrl}/telegram/webhook`)
      .then(() => console.log('[Telegram] Webhook registered:', webhookUrl))
      .catch(err => console.warn('[Telegram] Webhook registration failed:', err.message))
  } else {
    console.warn('[Telegram] No TELEGRAM_WEBHOOK_URL — Telegram webhook not registered (add ngrok URL for local dev)')
  }

  // Webhook endpoint
  app.post('/telegram/webhook', (req, res) => {
    bot.processUpdate(req.body)
    res.sendStatus(200)
  })

  // Message handler
  bot.on('message', async (msg) => {
    const incomingChatId = String(msg.chat.id)
    const text = msg.text || ''
    console.log(`[Telegram] Message from ${incomingChatId}: ${text}`)

    // Reject if TELEGRAM_CHAT_ID is set and message is from a different chat
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
      })
      if (result.reply) await sendToUser(result.reply)
    } catch (err) {
      console.error('[Telegram] Handler error:', err.message)
      await sendToUser('Something went wrong on my end. Check the logs.')
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
