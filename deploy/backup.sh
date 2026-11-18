#!/usr/bin/env bash
# Backs up the production database to a compressed file, checks it, optionally copies it off the server, and
# deletes old local copies. Run it by hand or from cron (see DEPLOYMENT.md, "Backups").
#
# Optional settings go in ~/.personnelq-backup.env (one NAME=value per line):
#   BACKUP_REMOTE=b2:personnelq-backups   an rclone remote:bucket to copy each backup to (needs rclone set up)
#   HEALTHCHECK_URL=https://hc-ping.com/xxxx   pinged after a good backup; the service emails you when pings stop
#   KEEP_DAYS=30                          how long local copies are kept (default 30)
#   BACKUP_DIR=$HOME/backups              where local copies go
set -euo pipefail

[ -f "$HOME/.personnelq-backup.env" ] && . "$HOME/.personnelq-backup.env"
KEEP_DAYS="${KEEP_DAYS:-30}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
FILE="$BACKUP_DIR/personnelq-$(date +%F-%H%M).sql.gz"

cd "$APP_DIR"
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T db \
  sh -c 'pg_dump -U "${POSTGRES_USER:-personnelq}" "${POSTGRES_DB:-personnelq}"' | gzip > "$FILE"

# A failed dump leaves a tiny or corrupt file: refuse to call that a backup.
gzip -t "$FILE"
[ "$(stat -c %s "$FILE")" -gt 2000 ] || { echo "Backup looks empty: $FILE" >&2; rm -f "$FILE"; exit 1; }
chmod 600 "$FILE"
echo "Backup written: $FILE ($(du -h "$FILE" | cut -f1))"

if [ -n "${BACKUP_REMOTE:-}" ]; then
  rclone copy "$FILE" "$BACKUP_REMOTE"
  echo "Copied to $BACKUP_REMOTE"
fi

find "$BACKUP_DIR" -name 'personnelq-*.sql.gz' -mtime +"$KEEP_DAYS" -delete

[ -n "${HEALTHCHECK_URL:-}" ] && curl -fsS -m 10 --retry 3 "$HEALTHCHECK_URL" >/dev/null || true
