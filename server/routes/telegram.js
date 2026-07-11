const TelegramBot = require('node-telegram-bot-api')
const titto = require('../../agents/titto')
const memory = require('../../state/memory')
const koel = require('../../agents/koel')
const quill = require('../../agents/quill')
const replyTargetsStore = require('../../state/replyTargetsStore')

let bot = null
let _sendDrafts = null
let _sendReplyTargets = null
let _sendArticleIdeas = null

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

  // Send reply targets, each with a "💬 Draft reply" button (rd|<idx> = index into the saved qualified list).
  // targets: [{ idx, title, impressions, i2c, ageMinutes, url }]
  const sendReplyTargets = async (targets, opts = {}) => {
    if (!chatId || !bot || !Array.isArray(targets)) return
    if (opts.header) { try { await bot.sendMessage(chatId, opts.header) } catch (_) {} }
    for (const t of targets) {
      const body = `${t.title}\n${(t.impressions || 0).toLocaleString()} imp · I2C ${t.i2c} · ${t.ageMinutes}m old\n${t.url}`
      try {
        await bot.sendMessage(chatId, body, { reply_markup: { inline_keyboard: [[{ text: '💬 Draft reply', callback_data: `rd|${t.idx}` }]] } })
      } catch (e) { console.warn('[Telegram] sendReplyTarget failed:', e.message) }
    }
  }
  _sendReplyTargets = sendReplyTargets

  // Send the article-idea picker: one message + a row of number buttons (aw|<idx> writes that idea).
  // ideas: [{ idx, title, angle }]
  const sendArticleIdeas = async (ideas, opts = {}) => {
    if (!chatId || !bot || !Array.isArray(ideas) || !ideas.length) return
    const lines = ideas.map((x, i) => `${i + 1}. *${x.title}*\n_${x.angle || ''}_`).join('\n\n')
    const buttons = ideas.map((x, i) => ({ text: `✍️ ${i + 1}`, callback_data: `aw|${x.idx != null ? x.idx : i}` }))
    // Chunk buttons into rows of 5 (Telegram is happier with short rows).
    const rows = []
    for (let i = 0; i < buttons.length; i += 5) rows.push(buttons.slice(i, i + 5))
    const header = opts.header || '📝 *Article ideas* — tap a number and I\'ll write the full article (ready in the Writer shortly):'
    try {
      await bot.sendMessage(chatId, `${header}\n\n${lines}`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: rows } })
    } catch (e) { console.warn('[Telegram] sendArticleIdeas failed:', e.message) }
  }
  _sendArticleIdeas = sendArticleIdeas

  // Edit-reply flow state: when the user taps ✏️ Edit, the next plain message is the new text.
  const pendingEdit = {}

  if (webhookUrl && webhookUrl.trim()) {
    bot = new TelegramBot(token)
    // Register the webhook with a secret token; Telegram echoes it back in the
    // X-Telegram-Bot-Api-Secret-Token header so we can reject forged POSTs.
    const webhookSecret = (process.env.TELEGRAM_WEBHOOK_SECRET || '').trim()
    const hookOpts = webhookSecret ? { secret_token: webhookSecret } : {}
    if (!webhookSecret) console.warn('[Telegram] WARNING: TELEGRAM_WEBHOOK_SECRET not set — webhook is unauthenticated')
    bot.setWebHook(`${webhookUrl}/telegram/webhook`, hookOpts)
      .then(() => console.log('[Telegram] Webhook mode — registered:', webhookUrl))
      .catch(err => console.warn('[Telegram] Webhook registration failed:', err.message))
    app.post('/telegram/webhook', (req, res) => {
      // Verify the secret Telegram sends back before trusting the payload.
      if (webhookSecret && req.headers['x-telegram-bot-api-secret-token'] !== webhookSecret) {
        return res.sendStatus(403)
      }
      bot.processUpdate(req.body)
      res.sendStatus(200)
    })
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
        telegramSendReplyTargets: sendReplyTargets,
        telegramSendArticleIdeas: sendArticleIdeas,
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

      // 💬 Draft reply for a saved reply target (rd|<idx>)
      if (parts[0] === 'rd') {
        const idx = parseInt(parts[1])
        const data = replyTargetsStore.readLatest()
        const target = data?.qualified?.[idx]
        if (!target) return ack('That reply list expired — run /replies again')
        ack('Drafting your reply…')
        try {
          const result = await koel.draftReply({
            sourceText: target.fullText || target.title,
            author: target.author || target.publisher,
            triggerLabel: '📱 Reply (Telegram)',
          })
          const rec = (result.draftRecords && result.draftRecords[0]) || {}
          await sendDrafts([{ id: rec.id, text: rec.text || result.drafts[0], format: 'reply' }],
            { header: `💬 Reply to ${target.author || target.publisher || 'post'} — ${target.url}` })
        } catch (e) {
          console.warn('[Telegram] reply draft failed:', e.message)
          await sendToUser('Reply draft failed. Check the logs.')
        }
        return
      }

      // ✍️ Write the full article for a chosen idea (aw|<idx>) — background, then ping when ready.
      if (parts[0] === 'aw') {
        const idx = parseInt(parts[1])
        ack('✍️ Writing the article — I\'ll ping you when it\'s ready…')
        try {
          await sendToUser('✍️ Writing that article now… (~30–60s). I\'ll send it when ready.')
          const out = await quill.writeArticleFromIdea({ idx, broadcast })
          await sendToUser(`✅ Article ready: *${out.title}*\n${out.words} words${out.cost != null ? ` · $${out.cost.toFixed(4)}` : ''}\n\nOpen the *Writer* tab to review, edit, and export.`)
        } catch (e) {
          console.warn('[Telegram] article write failed:', e.message)
          await sendToUser('Couldn\'t write that one — the idea list may have refreshed. Run /ideas again.')
        }
        return
      }

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

// Returns the reply-target sender (each with a "Draft reply" button), or null if not configured.
function getReplyTargetSender() {
  return _sendReplyTargets
}

// Returns the article-idea sender (numbered tap-to-write buttons), or null if not configured.
function getArticleIdeaSender() {
  return _sendArticleIdeas
}

module.exports = { init, getSendFn, getDraftSender, getReplyTargetSender, getArticleIdeaSender }
