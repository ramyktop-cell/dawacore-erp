#!/bin/sh
# ==============================================================================
# DawaCore ERP - PostgreSQL Disaster Recovery & Restore Script (Linux / Docker)
# Usage:
#   ./scripts/restore-db.sh /backups/dawacore_dawacore_prod_20261018_020000.sql.gz
# ==============================================================================

set -e

BACKUP_FILE="$1"
PGHOST="${PGHOST:-postgres}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-dawacore}"
PGDATABASE="${PGDATABASE:-dawacore_prod}"

if [ -z "$BACKUP_FILE" ]; then
  echo "❌ Error: Please provide the path to the backup file (.sql.gz)."
  echo "👉 Usage: $0 <path-to-backup.sql.gz>"
  echo ""
  echo "Available backups:"
  ls -lh "${BACKUP_DIR:-./backups}"/dawacore_*.sql.gz 2>/dev/null || echo "   (No backups found)"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ Error: File not found: $BACKUP_FILE"
  exit 1
fi

# Verify SHA-256 integrity if checksum file exists
if [ -f "${BACKUP_FILE}.sha256" ]; then
  echo "🔍 Verifying backup SHA-256 integrity..."
  sha256sum -c "${BACKUP_FILE}.sha256"
fi

echo "⚠️  Restoring database '${PGDATABASE}' on '${PGHOST}:${PGPORT}' from '${BACKUP_FILE}'..."
gunzip -c "$BACKUP_FILE" | psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1

echo "✅ Database '${PGDATABASE}' restored successfully!"
