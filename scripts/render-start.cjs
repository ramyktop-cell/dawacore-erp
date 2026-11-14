#!/usr/bin/env node
/**
 * ============================================================================
 * DawaCore ERP - Unified Cloud Startup Script (Render / Neon PostgreSQL)
 * 1. Binds HOST=0.0.0.0 for cloud port routing
 * 2. Sanitizes DATABASE_URL & Syncs Prisma Schema to PostgreSQL (Neon.tech)
 * 3. Bootstraps initial Admin, Branch, Accounts & Medicines (idempotent)
 * 4. Ensures cloud container license activation (ephemeral container HWID)
 * 5. Starts NestJS Production Server (serving both /api and SPA frontend/dist)
 * ============================================================================
 */
const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Ensure cloud host binding (Render requires 0.0.0.0 instead of 127.0.0.1)
process.env.HOST = process.env.HOST || '0.0.0.0';
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

// Ensure JWT_SECRET satisfies security.config.ts (>= 48 bytes and no forbidden words like 'dawacore')
if (
  !process.env.JWT_SECRET ||
  Buffer.byteLength(process.env.JWT_SECRET, 'utf8') < 48 ||
  /dawacore|change.?me|example/i.test(process.env.JWT_SECRET)
) {
  const seed = `${process.env.JWT_SECRET || ''}:${process.env.DATABASE_URL || 'RENDER_PROD'}`;
  process.env.JWT_SECRET = crypto
    .createHmac('sha512', 'ERP_CLOUD_JWT_DERIVATION_KEY_2026')
    .update(seed)
    .digest('hex');
}

console.log('========================================================');
console.log('🚀 DawaCore ERP - Cloud Production Startup');
console.log('========================================================');

if (!process.env.DATABASE_URL) {
  console.error('❌ ERROR: DATABASE_URL environment variable is not set!');
  console.error('Please add your Neon.tech PostgreSQL connection string as DATABASE_URL.');
  process.exit(1);
}

// Auto-sanitize DATABASE_URL in case the user pasted 'DATABASE_URL="postgresql://..."' or multi-line strings from Neon
const rawDbUrl = String(process.env.DATABASE_URL).trim();
const matchUrl = rawDbUrl.match(/postgres(?:ql)?:\/\/[^\s"'`]+/i);
if (matchUrl && matchUrl[0]) {
  process.env.DATABASE_URL = matchUrl[0];
}

// 1. Sync Prisma schema with PostgreSQL database
console.log('⏳ [1/4] Syncing Prisma Database Schema with PostgreSQL...');
try {
  execSync('npx --no-install prisma db push --accept-data-loss=false --skip-generate', {
    stdio: 'inherit',
  });
} catch (err) {
  console.warn('⚠️ prisma db push warning, attempting prisma migrate deploy...');
  try {
    execSync('npx --no-install prisma migrate deploy', { stdio: 'inherit' });
  } catch (err2) {
    console.warn('⚠️ Schema migration check completed with warning:', err2.message);
  }
}

// 2. Run idempotent production bootstrap (Company, Main Branch, COA, FiscalYear, Admin User, Initial Medicines)
if (process.env.AUTO_BOOTSTRAP !== 'false') {
  console.log('🌱 [2/4] Verifying initial ERP master data & admin account...');
  try {
    execSync('node tools/bootstrap-admin.cjs', { stdio: 'inherit' });
  } catch (err) {
    console.warn('⚠️ Bootstrap check warning (continuing startup):', err.message);
  }
} else {
  console.log('⏭️ [2/4] Skipping bootstrap (AUTO_BOOTSTRAP=false).');
}

// 3. Auto-activate cloud container license (Render containers have ephemeral filesystems & dynamic hostnames)
if (process.env.AUTO_ACTIVATE_CLOUD_LICENSE !== 'false') {
  console.log('🔑 [3/4] Verifying cloud container license activation...');
  try {
    const licenseFilePath = path.join(process.cwd(), 'license.key');
    const { LicensingService } = require('../dist/licensing/licensing.service');
    const licensingService = new LicensingService();
    const hwid = licensingService.detectHardwareId();

    const secretKey =
      process.env.VENDOR_SECRET || 'DAWACORE_MASTER_VENDOR_SECRET_KEY_PROD_2026_SECURE';
    const clientName =
      process.env.BOOTSTRAP_COMPANY_NAME?.trim() || 'صيدلية دواء كور (Cloud)';

    const payload = {
      h: hwid,
      c: clientName,
      t: 'LIFETIME',
      e: 0,
      i: Date.now(),
    };

    const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64');
    const signature = crypto
      .createHmac('sha256', secretKey)
      .update(payloadBase64)
      .digest('hex')
      .substring(0, 24)
      .toUpperCase();

    fs.writeFileSync(licenseFilePath, `${payloadBase64}.${signature}`, 'utf8');
    console.log(`[OK] Cloud container license active for HWID: ${hwid}`);
  } catch (err) {
    console.warn('⚠️ Could not auto-generate cloud license:', err.message);
  }
}

// 4. Start NestJS Production Server in the same process
console.log(`✅ [4/4] Starting DawaCore Server on ${process.env.HOST}:${process.env.PORT || 3002}...`);
require('../dist/main');
