#!/bin/sh
set -e

echo "=================================================="
echo "🚀 DawaCore ERP - Production Container Entrypoint"
echo "=================================================="

# 1. Wait until PostgreSQL is ready and apply pending schema migrations
echo "⏳ Syncing Prisma Database Schema..."
npx prisma db push --accept-data-loss=false --skip-generate || npx prisma migrate deploy

# 2. Seed initial master data if AUTO_SEED is explicitly set to 'true'
if [ "$AUTO_SEED" = "true" ]; then
  echo "🌱 Running initial database seed..."
  npx ts-node prisma/seed.ts || echo "⚠️ Seed skipped or already applied."
fi

echo "✅ Starting DawaCore NestJS Production Server..."
exec node dist/main
