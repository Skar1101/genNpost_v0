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
app.use(express.json())
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
app.locals.telegramSend = telegramSend
app.locals.telegramSendDraft = telegramSendDraft
app.locals.telegramSendReplyTargets = telegramSendReplyTargets
app.locals.telegramSendArticleIdeas = telegramSendArticleIdeas

// Init Telegram (Heron delivery — either a fully separate bot, or the main bot in "same bot, second
// chat" mode. heronTelegram.js only actually boots a second bot/polling loop when HERON_TELEGRAM_BOT_TOKEN
// is set; otherwise it no-ops and telegram.js's own getters below resolve instead.)
const heronTelegramResult = heronTelegram.init(app)
const telegramSendHeronDraft = telegram.getHeronDraftSender() || (heronTelegramResult ? heronTelegram.getHeronDraftSender() : null)
const telegramSendHeronHandoff = telegram.getHeronHandoffSender() || (heronTelegramResult ? heronTelegram.getHeronHandoffSender() : null)
app.locals.telegramSendHeronDraft = telegramSendHeronDraft
app.locals.telegramSendHeronHandoff = telegramSendHeronHandoff

// Init Telegram (Parrot — LinkedIn). Always a fully separate, dedicated bot (no same-bot fallback
// mode like Heron's — this is the one bot where Approve triggers a real platform post, so it stays
// on its own dedicated channel by design). No-ops cleanly if PARROT_TELEGRAM_BOT_TOKEN is unset.
const parrotTelegramResult = parrotTelegram.init(app)
const telegramSendParrotDraft = parrotTelegramResult ? parrotTelegram.getParrotDraftSender() : null
app.locals.telegramSendParrotDraft = telegramSendParrotDraft

// Init scheduler
initScheduler(ws.broadcast, telegramSend, telegramSendDraft, telegramSendArticleIdeas, telegramSendHeronDraft, telegramSendParrotDraft)

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
