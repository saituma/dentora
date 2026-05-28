#!/usr/bin/env bash
# Daily Postgres backup — dumps to gzip, uploads to Cloudflare R2, keeps 30 days locally.
# Runs via cron: 0 3 * * * dentora /opt/dentora/scripts/backup-db.sh
# Requires: docker, rclone (install: curl https://rclone.org/install.sh | bash)
# Set up rclone R2 remote once: rclone config → name it "r2"

set -euo pipefail

APP_DIR="/opt/dentora"
BACKUP_DIR="$APP_DIR/backups"
DATE=$(date +%Y-%m-%d_%H-%M-%S)
FILENAME="dentora-db-$DATE.sql.gz"
FILEPATH="$BACKUP_DIR/$FILENAME"
R2_DEST="r2:${R2_BUCKET:-dentora-backups}/db-backups/$FILENAME"
KEEP_DAYS=30

# Load env for DB credentials
set -a
# shellcheck source=/dev/null
[ -f "$APP_DIR/.env.production" ] && source "$APP_DIR/.env.production"
set +a

POSTGRES_USER="${POSTGRES_USER:-dentora}"
POSTGRES_DB="${POSTGRES_DB:-dentora}"

echo "[$(date)] Starting backup: $FILENAME"

mkdir -p "$BACKUP_DIR"

# Dump via the running postgres container
docker compose -f "$APP_DIR/docker-compose.prod.yaml" exec -T postgres \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" \
  | gzip > "$FILEPATH"

SIZE=$(du -sh "$FILEPATH" | cut -f1)
echo "[$(date)] Dump complete: $SIZE"

# Upload to R2 if rclone is configured
if command -v rclone &>/dev/null && rclone listremotes | grep -q '^r2:'; then
  rclone copy "$FILEPATH" "r2:${R2_BUCKET:-dentora-backups}/db-backups/" \
    --s3-provider Cloudflare \
    --s3-region auto \
    --log-level INFO
  echo "[$(date)] Uploaded to R2: $R2_DEST"
else
  echo "[$(date)] rclone not configured — backup kept locally only"
fi

# Remove local backups older than KEEP_DAYS
find "$BACKUP_DIR" -name "dentora-db-*.sql.gz" -mtime +"$KEEP_DAYS" -delete
echo "[$(date)] Cleaned up backups older than $KEEP_DAYS days"

echo "[$(date)] Backup done: $FILEPATH"
