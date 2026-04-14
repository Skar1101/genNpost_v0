const { WebSocketServer } = require('ws')

let wss = null

function init(server) {
  wss = new WebSocketServer({ server })

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
