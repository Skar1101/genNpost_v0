require('dotenv').config()
const http = require('http')
const express = require('express')
const path = require('path')
const ws = require('./websocket')
const apiRouter = require('./routes/api')
const telegram = require('./routes/telegram')
const { initScheduler } = require('../scheduler/cron')

const app = express()
const server = http.createServer(app)

// Middleware
app.use(express.json())
// Never cache HTML so the dashboard always loads the latest build (static assets can still cache).
app.use(express.static(path.join(__dirname, '..', 'public'), {
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

// Init Telegram
const telegramResult = telegram.init(app, ws.broadcast)
const telegramSend = telegramResult ? telegram.getSendFn() : null
const telegramSendDraft = telegramResult ? telegram.getDraftSender() : null
const telegramSendReplyTargets = telegramResult ? telegram.getReplyTargetSender() : null
const telegramSendArticleIdeas = telegramResult ? telegram.getArticleIdeaSender() : null
app.locals.telegramSend = telegramSend
app.locals.telegramSendDraft = telegramSendDraft
app.locals.telegramSendReplyTargets = telegramSendReplyTargets
app.locals.telegramSendArticleIdeas = telegramSendArticleIdeas

// Init scheduler
initScheduler(ws.broadcast, telegramSend, telegramSendDraft, telegramSendArticleIdeas)

// Catch-all → serve index.html (no-store so a new build is always picked up)
app.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, must-revalidate')
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'))
})

const PORT = process.env.PORT || 3000
// Bind to localhost by default so nothing on the LAN can reach the API. When deploying to a
// 24x7 server, set HOST=0.0.0.0 (and API_TOKEN) in .env to expose it safely.
const HOST = process.env.HOST || '127.0.0.1'
server.listen(PORT, HOST, () => {
  console.log(`\n🐦 TinySparrow running at http://${HOST}:${PORT}`)
  console.log(`   Titto is online. ChitraG is standing by.`)
  console.log(`   Scheduled runs: 6:00 AM + 6:00 PM daily\n`)
})
