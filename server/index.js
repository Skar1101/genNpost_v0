require('dotenv').config()
const http = require('http')
const express = require('express')
const path = require('path')
const ws = require('./websocket')
const apiRouter = require('./routes/api')
const telegram = require('./routes/telegram')
const heronTelegram = require('./routes/heronTelegram')
const parrotTelegram = require('./routes/parrotTelegram')
const { initScheduler } = require('../scheduler/cron')

const app = express()
const server = http.createServer(app)

// Middleware
// 15mb rather than the 100kb default: images are posted as base64 data URLs (browser FileReader on
// the compose page, Telegram photo buffers). That avoids adding a multipart dependency for what is
// a single-user app.
app.use(express.json({ limit: '15mb' }))
// Video is the one thing too big for the JSON path: it's uploaded as raw binary on its own route,
// which keeps the no-multipart-dependency choice above intact.
app.use('/api/videos/upload', express.raw({ type: ['video/*', 'application/octet-stream'], limit: '200mb' }))

// Generated + uploaded images. They live outside web/dist because they are user data, not build
// output — a rebuild must never wipe them. Long cache is safe: filenames are content-unique ids.
app.use('/assets/images', express.static(path.join(__dirname, '..', 'state', 'data', 'assets', 'images'), {
  maxAge: '30d',
  setHeaders(res) { res.setHeader('Cache-Control', 'public, max-age=2592000, immutable') },
}))
// Uploaded video. Same reasoning as images, but served with range support (express.static handles
// Range requests already) so a preview can scrub without downloading the whole file.
app.use('/assets/videos', express.static(path.join(__dirname, '..', 'state', 'data', 'assets', 'videos'), {
  maxAge: '30d',
  setHeaders(res) { res.setHeader('Cache-Control', 'public, max-age=2592000, immutable') },
}))
// Serve the built React dashboard (web/dist — run `npm run build:web` after any UI change).
// Never cache HTML so the dashboard always loads the latest build (static assets can still cache).
app.use(express.static(path.join(__dirname, '..', 'web', 'dist'), {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-store, must-revalidate')
  },
}))

// Init WebSocket
ws.init(server)
app.locals.broadcast = ws.broadcast

// Optional shared-secret auth for the API surface. Inert on localhost (no token needed);
// set API_TOKEN in .env when deploying to a public server to lock down /api/*.
// Token may be supplied as `Authorization: Bearer <t>`, `x-api-token: <t>`, or `?token=<t>`.
const API_TOKEN = process.env.API_TOKEN || ''
if (API_TOKEN) {
  app.use('/api', (req, res, next) => {
    const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    const supplied = bearer || req.headers['x-api-token'] || req.query.token || ''
    if (supplied === API_TOKEN) return next()
    return res.status(401).json({ error: 'Unauthorized' })
  })
  console.log('   🔒 API token auth: ENABLED')
}

// Routes
app.use('/api', apiRouter)

// Init Telegram (main bot)
const telegramResult = telegram.init(app, ws.broadcast)
const telegramSend = telegramResult ? telegram.getSendFn() : null
const telegramSendDraft = telegramResult ? telegram.getDraftSender() : null
const telegramSendReplyTargets = telegramResult ? telegram.getReplyTargetSender() : null
const telegramSendArticleIdeas = telegramResult ? telegram.getArticleIdeaSender() : null
// Slot-delivered library assets, with their "Posted ✅" button (scheduler/slotDelivery.js).
const telegramSendAssetCard = telegramResult ? telegram.getAssetCardSender() : null
const telegramSendPublishRequest = telegramResult ? telegram.getPublishRequestSender() : null
app.locals.telegramSend = telegramSend
app.locals.telegramSendDraft = telegramSendDraft
app.locals.telegramSendReplyTargets = telegramSendReplyTargets
app.locals.telegramSendArticleIdeas = telegramSendArticleIdeas
app.locals.telegramSendAssetCard = telegramSendAssetCard
app.locals.telegramSendPublishRequest = telegramSendPublishRequest

// Init Telegram (Heron delivery — either a fully separate bot, or the main bot in "same bot, second
// chat" mode. heronTelegram.js only actually boots a second bot/polling loop when HERON_TELEGRAM_BOT_TOKEN
// is set; otherwise it no-ops and telegram.js's own getters below resolve instead.)
const heronTelegramResult = heronTelegram.init(app)
const telegramSendHeronDraft = telegram.getHeronDraftSender() || (heronTelegramResult ? heronTelegram.getHeronDraftSender() : null)
const telegramSendHeronHandoff = telegram.getHeronHandoffSender() || (heronTelegramResult ? heronTelegram.getHeronHandoffSender() : null)
app.locals.telegramSendHeronDraft = telegramSendHeronDraft
app.locals.telegramSendHeronHandoff = telegramSendHeronHandoff

// Init Telegram (Parrot — LinkedIn). Either a fully separate bot (PARROT_TELEGRAM_BOT_TOKEN set), or
// the main bot in same-bot mode (the default — Titto is the one Telegram bot for the user unless a
// dedicated Parrot bot is explicitly configured). parrotTelegram.js only actually boots a second
// bot/polling loop when PARROT_TELEGRAM_BOT_TOKEN is set; otherwise it no-ops and telegram.js's own
// getter below resolves instead. Approve still triggers a real, immediate LinkedIn post either way.
const parrotTelegramResult = parrotTelegram.init(app)
const telegramSendParrotDraft = telegram.getParrotDraftSender() || (parrotTelegramResult ? parrotTelegram.getParrotDraftSender() : null)
app.locals.telegramSendParrotDraft = telegramSendParrotDraft

// Init scheduler
initScheduler(ws.broadcast, telegramSend, telegramSendDraft, telegramSendArticleIdeas, telegramSendHeronDraft, telegramSendParrotDraft, telegramSendAssetCard, telegramSendPublishRequest)

// Catch-all → serve the React app's index.html (no-store so a new build is always picked up)
app.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, must-revalidate')
  res.sendFile(path.join(__dirname, '..', 'web', 'dist', 'index.html'))
})

const PORT = process.env.PORT || 3000
// Bind to localhost by default so nothing on the LAN can reach the API. When deploying to a
// 24x7 server, set HOST=0.0.0.0 (and API_TOKEN) in .env to expose it safely.
const HOST = process.env.HOST || '127.0.0.1'
server.listen(PORT, HOST, () => {
  console.log(`\n🐦 TinySparrow running at http://${HOST}:${PORT}`)
  console.log(`   Titto is online. Raven is standing by.`)
  console.log(`   Scheduled runs: 6:00 AM + 6:00 PM daily\n`)
})
