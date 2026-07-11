#!/usr/bin/env bash
# Hassle-free redeploy for TinySparrow.
#   - Run by cron every ~10 min (auto), or manually via `npm run update`.
#   - Pulls new commits from the deploy branch, reinstalls deps ONLY if they changed,
#     then zero-downtime reloads pm2.
#   - Never touches state/data or logs (both gitignored) — profile + learning stay safe.
set -euo pipefail

# Make node/npm/pm2 reachable under cron's minimal PATH.
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

cd "$(dirname "$0")/.."            # repo root
BRANCH="${DEPLOY_BRANCH:-main}"

git fetch --quiet origin "$BRANCH"
LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse "origin/$BRANCH")"

# Already up to date → quiet no-op (keeps the cron log clean).
[ "$LOCAL" = "$REMOTE" ] && exit 0

echo "[update $(date -u +%FT%TZ)] $LOCAL -> $REMOTE"

# Did dependencies change between the two revisions?
if git diff --quiet "$LOCAL" "$REMOTE" -- package-lock.json package.json; then
  DEPS_CHANGED=0
else
  DEPS_CHANGED=1
fi

git pull --ff-only origin "$BRANCH"

if [ "$DEPS_CHANGED" = "1" ]; then
  echo "[update] dependencies changed → npm ci"
  npm ci --omit=dev
fi

pm2 reload tinysparrow --update-env
echo "[update] done → reloaded tinysparrow"
