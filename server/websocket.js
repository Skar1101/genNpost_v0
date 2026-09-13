const { WebSocketServer } = require('ws')

let wss = null

function init(server) {
  // Same gate as server/index.js's /api middleware — inert on localhost (no API_TOKEN set), required
  // once one is. Without this, the token protecting /api/* meant nothing for this channel: it
  // broadcasts live draft/chat content (koel_progress, chat_reply, activity, ...) to ANY client that
  // can open a WebSocket to this port, token or not — a real gap once this instance is reachable by
  // anyone beyond localhost (e.g. shared for a demo).
  const API_TOKEN = process.env.API_TOKEN || ''
  const verifyClient = API_TOKEN
    ? ({ req }, done) => {
        const url = new URL(req.url, 'http://localhost')
        done(url.searchParams.get('token') === API_TOKEN)
      }
    : undefined
  wss = new WebSocketServer({ server, verifyClient })

  wss.on('connection', (ws) => {
    console.log('[WS] Client connected')
    ws.on('close', () => console.log('[WS] Client disconnected'))
    ws.on('error', (err) => console.warn('[WS] Error:', err.message))
  })

  console.log('[WS] WebSocket server ready')
}

function broadcast(event) {
  if (!wss) return
  const msg = JSON.stringify(event)
  for (const client of wss.clients) {
    if (client.readyState === 1) { // OPEN
      client.send(msg)
    }
  }
}

module.exports = { init, broadcast }
