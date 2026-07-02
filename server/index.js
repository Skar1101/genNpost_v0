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

// Routes
app.use('/api', apiRouter)

// Init Telegram
const telegramResult = telegram.init(app, ws.broadcast)
const telegramSend = telegramResult ? telegram.getSendFn() : null
const telegramSendDraft = telegramResult ? telegram.getDraftSender() : null
app.locals.telegramSend = telegramSend
app.locals.telegramSendDraft = telegramSendDraft

// Init scheduler
initScheduler(ws.broadcast, telegramSend, telegramSendDraft)

// Catch-all → serve index.html (no-store so a new build is always picked up)
app.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, must-revalidate')
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'))
})

const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  console.log(`\n🐦 TinySparrow running at http://localhost:${PORT}`)
  console.log(`   Titto is online. ChitraG is standing by.`)
  console.log(`   Scheduled runs: 6:00 AM + 6:00 PM daily\n`)
})
