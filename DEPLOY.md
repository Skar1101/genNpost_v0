# Deploy TinySparrow 24×7 on Oracle Cloud (Always Free)

Runs the bot always-on for **$0** on an Oracle Ampere (ARM) VM with **pm2** (auto-restart + start-on-boot) and
**auto-updates** (just `git push`). Telegram uses polling, so **no inbound ports** are opened; the dashboard is
reached over an SSH tunnel. Cron is pinned to UTC, so the VM's timezone doesn't matter.

> ⚠️ **Run only ONE bot at a time.** Once the VM is live, **stop the laptop's server** — otherwise both poll
> Telegram and you'll get double replies.

---

## 1. Create the VM (Oracle console, ~5 min)
1. Sign in → **Compute → Instances → Create instance**.
2. **Image & shape → Change shape → Ampere** → `VM.Standard.A1.Flex` (ARM). 1 OCPU / 6 GB is plenty (free
   allowance is up to 4 OCPU / 24 GB).
3. **Image:** Canonical **Ubuntu 22.04**.
4. **SSH keys:** "Generate a key pair for me" → **download the private key** (e.g. `oracle.key`).
5. Create. Note the instance's **Public IP**.
   - *If you see "out of host capacity" for ARM:* retry, or pick a different **Availability Domain**, or try
     again later — free ARM capacity comes and goes.

Local key permissions (Mac/Linux): `chmod 600 oracle.key`. On Windows use the key path as-is with `ssh -i`.

## 2. SSH in
```bash
ssh -i oracle.key ubuntu@<PUBLIC_IP>
```

## 3. Install Node 20 + git + pm2 (on the VM)
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git
sudo npm install -g pm2
node -v   # should be v20.x (arm64)
```

## 4. Get the code
```bash
git clone https://github.com/Skar1101/TinySparrow_social_media_manager_V0.git
cd TinySparrowV0
npm ci --omit=dev
```

## 5. Add your secrets (`.env`)
Create `.env` with the **same keys as your laptop** (never committed):
```bash
nano .env
```
```
OPENAI_API_KEY=sk-...
OPENROUTER_API_KEY=sk-or-...
RAPIDAPI_KEY=...
YOUTUBE_API_KEY=...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
HOST=127.0.0.1
PORT=3000
```
(Keep `HOST=127.0.0.1` so the dashboard/API stays private — reached only via the SSH tunnel in step 9.)

## 6. Bring your profile + learning data (so the bot isn't "cold")
`state/data/` is gitignored, so it isn't in the repo. Copy it from the **laptop** (run on the laptop, not the
VM):
```bash
scp -i oracle.key -r state/data ubuntu@<PUBLIC_IP>:~/TinySparrowV0/state/
```
*(Skip this only if you want to start fresh — then re-do `/profile` and lose past approvals/insights.)*

## 7. Start it under pm2 (auto-restart + start-on-boot)
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup          # prints a `sudo env PATH=... pm2 startup systemd -u ubuntu ...` line — run THAT line
```

## 8. Enable auto-updates ("just push" deploys)
```bash
crontab -e
```
Add this line (checks GitHub every 10 min; pulls + reloads only when there are new commits):
```
*/10 * * * * cd ~/TinySparrowV0 && bash scripts/update.sh >> logs/update.log 2>&1
```
From now on: **edit → commit → `git push`** → the VM self-updates within ~10 min (zero-downtime `pm2 reload`,
`npm ci` only if deps changed, `state/data` untouched). Need it now? `npm run update` on the VM.

## 9. Verify
- `pm2 status` → `tinysparrow` is **online**.
- `pm2 logs tinysparrow` → shows `[Scheduler] Cron jobs armed …`.
- In **Telegram**: send `/health` (confirms fresh code + keys) and `/drop` (delivers today's drop).
- Reboot test: `sudo reboot`, wait ~1 min, `pm2 status` → back online automatically.

## 10. Open the dashboard (optional, secure)
No public port is exposed. Tunnel it over SSH from your laptop:
```bash
ssh -i oracle.key -L 3000:localhost:3000 ubuntu@<PUBLIC_IP>
```
Then open `http://localhost:3000` in your browser (works while the SSH session is open).

---

## Everyday workflow
| Task | Command |
|---|---|
| Ship a new version | `git push` (VM auto-updates in ≤10 min) |
| Update the VM right now | `npm run update` (on the VM) |
| See logs | `pm2 logs tinysparrow` · updates: `tail -f logs/update.log` |
| Restart | `pm2 reload tinysparrow` |
| Health check | send `/health` in Telegram |

## Notes & gotchas
- **One poller only** — stop the laptop server once the VM is live (`Ctrl+C` its terminal).
- **Secrets** never leave `.env` (gitignored, plus `state/data/` and `logs/`).
- **Persistence** — everything lives on the VM's boot volume (survives reboots). Nothing ephemeral.
- **ARM capacity** — if instance creation fails with "out of host capacity", retry / other AD.
- **cron PATH** — `scripts/update.sh` sets a safe PATH; if `pm2`/`npm` aren't found in cron, they're in
  `/usr/bin` after the NodeSource install above.
