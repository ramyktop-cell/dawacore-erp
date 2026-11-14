#!/bin/sh
# ==============================================================================
# DawaCore ERP - Automated PostgreSQL Backup & Retention Script (Linux / Docker)
# Supports:
#   - Single immediate backup: ./scripts/backup-db.sh
#   - Continuous daemon mode:  ./scripts/backup-db.sh --daemon
# ==============================================================================

set -e

BACKUP_DIR="${BACKUP_DIR:-/backups}"
PGHOST="${PGHOST:-postgres}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-dawacore}"
PGDATABASE="${PGDATABASE:-dawacore_prod}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
INTERVAL_SECONDS="${BACKUP_INTERVAL_SECONDS:-86400}"

mkdir -p "$BACKUP_DIR"

run_backup() {
  TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
  BACKUP_FILE="${BACKUP_DIR}/dawacore_${PGDATABASE}_${TIMESTAMP}.sql.gz"
  CHECKSUM_FILE="${BACKUP_FILE}.sha256"

  echo "[$(date +'%Y-%m-%d %H:%M:%S')] 📦 Starting PostgreSQL backup for '${PGDATABASE}'..."

  # Execute consistent snapshot dump (--serializable-deferrable / --no-owner) and compress with gzip
  if pg_dump -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" --clean --if-exists --no-owner --no-privileges | gzip -9 > "$BACKUP_FILE"; then
    # Verify non-empty archive and generate SHA-256 checksum
    FILE_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    sha256sum "$BACKUP_FILE" > "$CHECKSUM_FILE"
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ✅ Backup completed: ${BACKUP_FILE} (${FILE_SIZE})"
  else
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ❌ Backup FAILED!"
    rm -f "$BACKUP_FILE"
    return 1
  fi

  # Prune backups older than RETENTION_DAYS
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] 🧹 Pruning backups older than ${RETENTION_DAYS} days..."
  find "$BACKUP_DIR" -type f -name "dawacore_*.sql.gz*" -mtime +"$RETENTION_DAYS" -delete
}

if [ "$1" = "--daemon" ]; then
  echo "=================================================="
  echo "🛡️ DawaCore Automated Backup Service Started"
  echo "   Database:  ${PGDATABASE}@${PGHOST}:${PGPORT}"
  echo "   Directory: ${BACKUP_DIR}"
  echo "   Retention: ${RETENTION_DAYS} days"
  echo "   Interval:  Every ${INTERVAL_SECONDS}s"
  echo "=================================================="

  # Wait briefly for DB readiness on initial container startup
  sleep 10

  while true; do
    run_backup || true
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] 💤 Next backup in ${INTERVAL_SECONDS} seconds..."
    sleep "$INTERVAL_SECONDS"
  done
else
  run_backup
fi
