// pm2 process config for TinySparrow (24×7 hosting).
//   pm2 start ecosystem.config.js   # start
//   pm2 save && pm2 startup          # auto-start on reboot
//   pm2 reload tinysparrow           # zero-downtime restart (used by scripts/update.sh)
// Secrets come from .env via dotenv — pm2 does NOT carry keys.
const path = require('path')

module.exports = {
  apps: [
    {
      name: 'tinysparrow',
      script: path.join(__dirname, 'server', 'index.js'),
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',           // single instance — one Telegram poller only
      autorestart: true,           // restart on crash
      max_restarts: 15,
      min_uptime: '30s',           // must stay up 30s to count as a good start
      restart_delay: 4000,
      max_memory_restart: '400M',  // guard against leaks
      env: { NODE_ENV: 'production' },
      out_file: path.join(__dirname, 'logs', 'pm2-out.log'),
      error_file: path.join(__dirname, 'logs', 'pm2-error.log'),
      merge_logs: true,
      time: true,                  // timestamp pm2 log lines
    },
  ],
}
