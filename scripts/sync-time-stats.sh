#!/usr/bin/env bash
set -Eeuo pipefail

export HOME="${HOME:-/root}"
export PATH="/root/.nvm/versions/node/v24.12.0/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"

BLOG_ROOT="${BLOG_ROOT:-/root/LLK/Y0uYuGe.github.io}"
NODE_BIN="${NODE_BIN:-/root/.nvm/versions/node/v24.12.0/bin/node}"
BUNDLE_BIN="${BUNDLE_BIN:-/usr/local/bin/bundle}"
GIT_BIN="${GIT_BIN:-/usr/bin/git}"
LOCK_FILE="${LOCK_FILE:-/tmp/llk-blog-time-sync.lock}"

log() {
  printf '[%s] %s\n' "$(date '+%F %T %z')" "$*"
}

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log "another sync is running; skip"
  exit 0
fi

cd "$BLOG_ROOT"
log "sync started in $BLOG_ROOT"

if "$GIT_BIN" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if "$GIT_BIN" diff --quiet && "$GIT_BIN" diff --cached --quiet; then
    "$GIT_BIN" pull --ff-only origin master || log "git pull skipped or failed"
  else
    log "local changes exist; skip pull"
  fi
fi

"$NODE_BIN" scripts/generate-time-stats.js

if [[ -x "$BUNDLE_BIN" ]]; then
  "$BUNDLE_BIN" exec jekyll build
else
  log "bundle not found at $BUNDLE_BIN; skip local jekyll build"
fi

if ! "$GIT_BIN" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  log "not a git repository; generated local blog data only"
  exit 0
fi

"$GIT_BIN" add -- \
  _data/time_stats.json \
  _includes/work-time-summary.html \
  _pages/about.md \
  scripts/generate-time-stats.js \
  scripts/sync-time-stats.sh

if "$GIT_BIN" diff --cached --quiet; then
  log "no tracked time-stat changes to commit"
  exit 0
fi

"$GIT_BIN" commit -m "Update work time stats"
"$GIT_BIN" push origin HEAD:master
log "sync finished and pushed"
