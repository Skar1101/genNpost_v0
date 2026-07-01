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
app.use(express.static(path.join(__dirname, '..', 'public')))

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

// Catch-all → serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'))
})

const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  console.log(`\n🐦 TinySparrow running at http://localhost:${PORT}`)
  console.log(`   Titto is online. ChitraG is standing by.`)
  console.log(`   Scheduled runs: 6:00 AM + 6:00 PM daily\n`)
})
