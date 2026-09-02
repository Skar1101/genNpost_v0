const TelegramBot = require('node-telegram-bot-api')
const titto = require('../../agents/titto')
const memory = require('../../state/memory')
const koel = require('../../agents/koel')
const quill = require('../../agents/quill')
const replyTargetsStore = require('../../state/replyTargetsStore')
const articlesStore = require('../../state/articlesStore')
const assetsStore = require('../../state/assetsStore')
const finishDraft = require('../../utils/finishDraft')
const generateImage = require('../../tools/generateImage')
const { REASONS, actionKeyboard, decidedKeyboard, assetKeyboard, publishKeyboard, reasonKeyboard, escapeHtml, stripHeader } = require('./telegramCore')

let bot = null
let _sendDrafts = null
let _sendAssetCard = null
let _sendPublishRequest = null
let _sendReplyTargets = null
let _sendArticleIdeas = null
// Only set when Heron is configured in "same bot, second chat" mode (HERON_TELEGRAM_CHAT_ID set,
// HERON_TELEGRAM_BOT_TOKEN left empty) — see heronTelegram.js for the fully-separate-bot mode instead.
let _sendHeronDraft = null
let _sendHeronHandoff = null

function init(app, broadcast) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL
  const chatId = process.env.TELEGRAM_CHAT_ID
  const heronChatId = process.env.HERON_TELEGRAM_CHAT_ID
  // "Same bot, second chat" mode: Heron has a chat id but no separate bot token of its own — this
  // bot instance handles Heron delivery + inbound too, instead of heronTelegram.js booting a second
  // polling loop against the same token (which Telegram's API doesn't allow — only one active
  // long-poll per token at a time).
  const heronSameBot = !process.env.HERON_TELEGRAM_BOT_TOKEN && !!heronChatId

  if (!token) {
    console.warn('[Telegram] No TELEGRAM_BOT_TOKEN — Telegram disabled')
    return null
  }

  const sendToChat = async (targetChatId, text) => {
    if (!targetChatId || !bot) return
    try {
      await bot.sendMessage(targetChatId, text, { parse_mode: 'Markdown' })
    } catch (err) {
      try { await bot.sendMessage(targetChatId, text) } catch (e) { console.warn('[Telegram] Send failed:', e.message) }
    }
  }
  const sendToUser = (text) => sendToChat(chatId, text)

  // Push drafts to a given chat with one-tap Approve / Reject / Edit buttons.
  // drafts: [{ id, text, format, warn? }] (from koel result.draftRecords + format; optional `warn`
  // — e.g. "⚠️ 314/280" — rides in the header line so stripHeader() removes it automatically for
  // Copy/Approve/Edit, keeping the underlying draft text clean.)
  const sendDraftsToChat = async (targetChatId, drafts, opts = {}) => {
    if (!targetChatId || !bot || !Array.isArray(drafts)) return
    if (opts.header) { try { await bot.sendMessage(targetChatId, opts.header) } catch (_) {} }
    for (const d of drafts) {
      if (!d || !d.id) continue
      const body = `📝 Draft (${d.format || 'short'})${d.warn ? ` ${d.warn}` : ''}\n\n${d.text}`
      try {
        await bot.sendMessage(targetChatId, body, { reply_markup: actionKeyboard(d.id, d.text) })
      } catch (e) { console.warn('[Telegram] sendDraft failed:', e.message) }
    }
  }
  const sendDrafts = (drafts, opts) => sendDraftsToChat(chatId, drafts, opts)
  _sendDrafts = sendDrafts

  // A slot-delivered library asset: the finished, copy-ready text plus a "Posted ✅" button.
  // Substack goes to Heron's chat when one is configured, X to the main chat.
  const sendAssetCard = async ({ asset, text, substack = false }) => {
    const target = substack && heronChatId ? heronChatId : chatId
    if (!target || !bot) return
    try {
      await bot.sendMessage(target, text, { reply_markup: assetKeyboard(asset.id) })
    } catch (e) {
      console.warn('[Telegram] sendAssetCard failed:', e.message)
      try { await bot.sendMessage(target, text) } catch (_) {}
    }
  }
  _sendAssetCard = sendAssetCard

  // Studio's publish button routes through here instead of posting directly. Nothing goes live
  // until the Approve tap below.
  const sendPublishRequest = async ({ asset }) => {
    // Show exactly what will go out, threads numbered the same way the slot card does it.
    const text = asset.segments.length === 1
      ? asset.segments[0].text
      : asset.segments.map((sg, i) => `[${i + 1}/${asset.segments.length}]\n${sg.text}`).join('\n\n———\n\n')
    const target = asset.platform === 'substack' && heronChatId ? heronChatId : chatId
    if (!target || !bot) throw new Error('Telegram is not configured — cannot ask for approval')
    const header = asset.platform === 'linkedin'
      ? '❗ Publish to LinkedIn? This posts for real, immediately.'
      : `❗ Publish this ${asset.platform === 'substack' ? 'Substack' : 'X'} post?`
    await bot.sendMessage(target, `${header}

${text}`, { reply_markup: publishKeyboard(asset.id) })
  }
  _sendPublishRequest = sendPublishRequest

  // Heron delivery in same-bot mode — draft cards to the Heron chat, plus a short hand-off ping on
  // Approve. Articles: one line only (the full text/image prompt live in the Heron dashboard — no
  // more multi-message content dump into Telegram). Notes: already short, sent as-is.
  const sendHeronDraft = (drafts, opts) => sendDraftsToChat(heronChatId, drafts, opts)
  const sendHeronHandoff = async (draft) => {
    if (!heronChatId || !bot || !draft || draft.platform !== 'substack') return
    try {
      if (draft.meta?.kind === 'article' && draft.meta?.articleId) {
        const record = articlesStore.get(draft.meta.articleId)
        const title = record?.title || 'your article'
        await bot.sendMessage(heronChatId, `🦢 "${title}" approved — ready to publish. Open the Heron page in the dashboard for the full text + image prompt.`).catch(() => {})
      } else {
        await bot.sendMessage(heronChatId, `🦢 Ready to post as a Substack Note:\n\n${draft.text || ''}`).catch(() => {})
      }
    } catch (e) {
      console.warn('[Telegram] sendHeronHandoff failed:', e.message)
    }
  }
  if (heronSameBot) {
    _sendHeronDraft = sendHeronDraft
    _sendHeronHandoff = sendHeronHandoff
    console.log(`[Telegram] Heron same-bot mode active — routing Heron content to chat ${heronChatId}`)
  }

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

    // /chatid works from ANY chat this bot is a member of, even ones not yet configured — this is
    // how you discover a new group/channel's id to paste into TELEGRAM_CHAT_ID or
    // HERON_TELEGRAM_CHAT_ID. Deliberately answered before the chat-allowlist gate below.
    if (text.trim().toLowerCase() === '/chatid') {
      await bot.sendMessage(incomingChatId, `This chat's id is: ${incomingChatId}`).catch(() => {})
      return
    }

    const isHeronChat = heronSameBot && incomingChatId === String(heronChatId)
    const isMainChat = !!chatId && incomingChatId === String(chatId)
    if (chatId && !isMainChat && !isHeronChat) {
      console.warn('[Telegram] Message from unknown chat, ignoring')
      return
    }

    // ── Manual content ingest ────────────────────────────────────────────────
    // Work written outside the app, saved into the library. A photo with a caption is unambiguous
    // enough to handle on its own; bare text needs /save so it can't collide with Titto's intent
    // parsing. Nothing here rewrites what was sent — same rule as the compose page.
    //
    // Platform is inferred from the chat: the Heron chat means Substack, otherwise X, and either
    // can be overridden with a leading "linkedin:" / "substack:" / "x:" in the caption or command.
    const PLATFORM_PREFIX = /^\s*(x|linkedin|substack)\s*:\s*/i
    const savePlatform = (body) => {
      const m = body.match(PLATFORM_PREFIX)
      if (m) return { platform: m[1].toLowerCase(), text: body.replace(PLATFORM_PREFIX, '') }
      return { platform: isHeronChat ? 'substack' : 'x', text: body }
    }

    const saveManual = async ({ body, photoFileId }) => {
      const { platform, text: clean } = savePlatform(body || '')
      const acct = memory.accounts.getActiveAccount()
      let imageId = null

      if (photoFileId) {
        try {
          const link = await bot.getFileLink(photoFileId)
          const resp = await fetch(link)
          const buf = Buffer.from(await resp.arrayBuffer())
          imageId = generateImage.saveUpload({ data: buf, contentType: 'image/jpeg', platform, account: acct }).id
        } catch (e) {
          console.warn('[Telegram] photo download failed:', e.message)
        }
      }

      if (!clean.trim() && !imageId) {
        await sendToChat(incomingChatId, 'Send a photo with a caption, or `/save <your post>`, and I\'ll file it in the library.')
        return
      }

      const finished = finishDraft.finish({ text: clean, platform })
      const segments = finished.segments.map((s, i) => (i === 0 && imageId ? { ...s, imageId } : s))
      const asset = assetsStore.create(acct, { segments, platform, origin: 'manual', warnings: finished.warnings })
      // Your own writing is the strongest voice signal available — voice-examples.json has been
      // sitting at a single entry, which is why voice calibration is thin.
      if (clean.trim()) memory.voiceExamples.append(acct, { text: clean.slice(0, 600), platform, source: 'manual-telegram' })

      const bits = [`📥 Saved to the library — ${platform}${segments.length > 1 ? ` · ${segments.length} segments` : ''}${imageId ? ' · image attached' : ''}`]
      if (finished.changes.length) bits.push(`\nSaved exactly as you wrote it. Available if you want it: ${finished.changes.join(' ')}`)
      const errs = finished.warnings.filter(w => w.level === 'error')
      if (errs.length) bits.push(`\n⚠️ ${errs.map(w => w.message).join(' ')}`)
      await sendToChat(incomingChatId, bits.join('\n'))
    }

    if (msg.photo?.length) {
      // Highest-resolution variant is last in the array.
      await saveManual({ body: msg.caption || '', photoFileId: msg.photo[msg.photo.length - 1].file_id })
      return
    }
    if (/^\/save\b/i.test(text)) {
      await saveManual({ body: text.replace(/^\/save\b\s*/i, '') })
      return
    }

    // If awaiting an edit, treat this (non-command) message as the edited draft — reply in whichever
    // chat sent it (main or Heron).
    if (pendingEdit[incomingChatId] && text && !text.startsWith('/')) {
      const { id } = pendingEdit[incomingChatId]
      delete pendingEdit[incomingChatId]
      try {
        memory.transition(memory.accounts.getActiveAccount(), id, 'edited', { editedText: text })
        await sendToChat(incomingChatId, '✅ Saved your edited version — Koel will learn from it.')
      } catch (e) {
        await sendToChat(incomingChatId, 'Could not save the edit: ' + e.message)
      }
      return
    }

    // The Heron chat is Heron-only — no Titto command routing there (matches heronTelegram.js's
    // fully-separate-bot mode, which never wires Titto in at all).
    if (isHeronChat) return

    try {
      // Read lazily off app.locals (not captured at init time) — parrotTelegram.js's init() runs
      // after this module's, so its sender only exists once the server has finished booting, by
      // which point any real incoming message arrives well after.
      const result = await titto.handleMessage({
        text,
        sessionId: `telegram-${incomingChatId}`,
        source: 'telegram',
        broadcast,
        telegramSend: sendToUser,
        telegramSendDraft: sendDrafts,
        telegramSendReplyTargets: sendReplyTargets,
        telegramSendArticleIdeas: sendArticleIdeas,
        telegramSendParrotDraft: app.locals.telegramSendParrotDraft,
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
      const isHeronChat = heronSameBot && chat === String(heronChatId)
      const isMainChat = !!chatId && chat === String(chatId)
      if (chatId && !isMainChat && !isHeronChat) return ack()
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

      // ❗ Publish approval (pub|<action>|<id>) — Studio's publish button asks here first rather than
      // posting from the web UI. For LinkedIn this tap is what actually puts it on the feed, which is
      // irreversible, so nothing happens until it.
      if (parts[0] === 'pub') {
        const [, action, assetId] = parts
        const acct3 = memory.accounts.getActiveAccount()
        const asset = assetsStore.get(acct3, assetId)
        if (!asset) return ack('That post is gone')
        const msgId3 = q.message.message_id

        if (action === 'c') {
          await bot.editMessageText(`❌ Cancelled — nothing was posted.

${q.message.text}`, { chat_id: chat, message_id: msgId3 }).catch(() => {})
          return ack('Cancelled')
        }
        if (action === 'a') {
          await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chat, message_id: msgId3 }).catch(() => {})
          const slotDelivery = require('../../scheduler/slotDelivery')
          const result = await slotDelivery.deliverAsset({
            account: acct3,
            asset,
            telegramSend: sendToUser,
            telegramSendHeronDraft: sendHeronDraft,
            sendAssetCard,
          })
          const done = result.ok
            ? (result.mode === 'posted' ? '✅ Posted to LinkedIn' : '✅ Sent — copy-ready above')
            : `⚠️ Failed: ${result.error || 'delivery error'}`
          await bot.editMessageText(`${done}

${q.message.text}`, { chat_id: chat, message_id: msgId3 }).catch(() => {})
          return ack(result.ok ? 'Done' : 'Failed — see the message')
        }
        return ack()
      }

      // 📅 Slot-delivered library assets (as|<action>|<id>) — see scheduler/slotDelivery.js.
      // "Posted" is the only signal that anything shipped on X/Substack while the timeline ingest
      // stays deferred, so it also drives the learning loop via voiceExamples.
      if (parts[0] === 'as') {
        const [, action, assetId] = parts
        const acct2 = memory.accounts.getActiveAccount()
        const asset = assetsStore.get(acct2, assetId)
        if (!asset) return ack('That asset is gone')
        const msgId2 = q.message.message_id

        if (action === 'p') {
          assetsStore.update(acct2, assetId, { state: 'posted', note: 'marked posted from Telegram' })
          // Your own posted copy is the strongest voice signal there is — feed it back.
          memory.voiceExamples.append(acct2, {
            text: asset.segments.map(s => s.text).join('\n\n').slice(0, 600),
            platform: asset.platform,
            source: 'posted-asset',
          })
          await bot.editMessageText(`✅ Posted\n\n${q.message.text}`, { chat_id: chat, message_id: msgId2 }).catch(() => {})
          return ack('Marked posted — thanks, that teaches the voice')
        }
        if (action === 's') {
          const later = new Date(Date.now() + 60 * 60 * 1000).toISOString()
          assetsStore.setSchedule(acct2, assetId, later)
          await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chat, message_id: msgId2 }).catch(() => {})
          return ack('Snoozed an hour — I\'ll send it again')
        }
        return ack()
      }

      if (parts[0] !== 'd') return ack()
      const [, action, id, code] = parts
      const acct = memory.accounts.getActiveAccount()
      const msgId = q.message.message_id
      const bodyText = stripHeader(q.message.text)

      if (action === 'a') {
        const updated = memory.transition(acct, id, 'queued')
        // Keep a keyboard here. editMessageText without reply_markup DROPS the buttons, so approving
        // used to remove Copy — at the exact moment you want it, since approving is when you go post.
        await bot.editMessageText(`✅ Approved\n\n${bodyText}`, {
          chat_id: chat, message_id: msgId, reply_markup: decidedKeyboard(id, bodyText),
        }).catch(() => {})
        if (isHeronChat && updated?.platform === 'substack') await sendHeronHandoff(updated)
        return ack('Approved — added to your queue')
      }
      if (action === 'r') {
        await bot.editMessageReplyMarkup(reasonKeyboard(id), { chat_id: chat, message_id: msgId }).catch(() => {})
        return ack('Pick a reason')
      }
      if (action === 'b') {
        await bot.editMessageReplyMarkup(actionKeyboard(id, bodyText), { chat_id: chat, message_id: msgId }).catch(() => {})
        return ack()
      }
      if (action === 'rr') {
        const reason = REASONS[code] || 'other'
        memory.transition(acct, id, 'rejected', { reason })
        await bot.editMessageText(`❌ Rejected (${reason})\n\n${bodyText}`, {
          chat_id: chat, message_id: msgId, reply_markup: decidedKeyboard(id, bodyText),
        }).catch(() => {})
        return ack(`Rejected — I'll avoid this`)
      }
      // Undo a mis-tapped approve/reject — previously unrecoverable from chat, the message just sat
      // there decided. Returns the draft to unrated and restores the full action row.
      if (action === 'u') {
        memory.transition(acct, id, 'generated')
        await bot.editMessageText(bodyText, {
          chat_id: chat, message_id: msgId, reply_markup: actionKeyboard(id, bodyText),
        }).catch(() => {})
        return ack('Undone — back to unrated')
      }
      if (action === 'c') {
        // Send the draft as a copyable code block (Telegram shows a tap-to-copy icon)
        await bot.sendMessage(chat, `<pre>${escapeHtml(bodyText)}</pre>`, { parse_mode: 'HTML' }).catch(() => {})
        return ack('Copy-ready text sent below 👇')
      }
      if (action === 'e') {
        if (isHeronChat) {
          const rec = memory.getDraft(acct, id)
          if (rec?.platform === 'substack' && rec?.meta?.kind === 'article') {
            return ack('Articles are too long to edit here — open the Heron page in the dashboard to refine it.')
          }
        }
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

// Sends a slot-delivered library asset with its "Posted ✅" button. Null when Telegram is disabled,
// in which case slotDelivery falls back to a plain message.
function getAssetCardSender() {
  return _sendAssetCard
}

// Returns the reply-target sender (each with a "Draft reply" button), or null if not configured.
function getReplyTargetSender() {
  return _sendReplyTargets
}

// Returns the article-idea sender (numbered tap-to-write buttons), or null if not configured.
function getArticleIdeaSender() {
  return _sendArticleIdeas
}

// Returns the Heron draft sender / hand-off sender, but ONLY when this bot owns Heron delivery
// (same-bot mode — HERON_TELEGRAM_CHAT_ID set, HERON_TELEGRAM_BOT_TOKEN empty). Null otherwise, so
// server/index.js can tell this module isn't the one responsible (a separate bot is, or Heron isn't
// configured at all).
function getHeronDraftSender() {
  return _sendHeronDraft
}
function getHeronHandoffSender() {
  return _sendHeronHandoff
}

module.exports = {
  getPublishRequestSender: () => _sendPublishRequest,
  init, getSendFn, getDraftSender, getAssetCardSender, getReplyTargetSender, getArticleIdeaSender,
  getHeronDraftSender, getHeronHandoffSender,
}
