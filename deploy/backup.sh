#!/usr/bin/env bash
# Nightly Postgres backup. Installed on the server as a cron job by deploy docs:
#   0 3 * * * /opt/wordswipe/deploy/backup.sh >> /opt/wordswipe/backups/backup.log 2>&1
set -euo pipefail

DIR=/opt/wordswipe
BACKUPS="$DIR/backups"
KEEP_DAYS=7

mkdir -p "$BACKUPS"
STAMP=$(date +%Y-%m-%d_%H-%M)

docker compose -f "$DIR/docker-compose.prod.yml" exec -T postgres \
  pg_dump -U postgres wordswipe | gzip > "$BACKUPS/wordswipe-$STAMP.sql.gz"

find "$BACKUPS" -name 'wordswipe-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
echo "[$(date)] backup done: wordswipe-$STAMP.sql.gz"
