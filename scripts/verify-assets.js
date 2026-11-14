#!/usr/bin/env node
/**
 * DawaCore — Assets Verifier
 *
 * Verifies that all required static assets (fonts, etc.) exist before build.
 *
 * Usage:
 *   node scripts/verify-assets.js              # fail on missing (prebuild)
 *   node scripts/verify-assets.js --warn-only  # warn only (postinstall)
 */

const fs = require('fs');
const path = require('path');

const WARN_ONLY = process.argv.includes('--warn-only');

const ASSETS = [
  {
    path: 'src/shared/report-kit/assets/fonts/Cairo.ttf',
    minSizeBytes: 100 * 1024,
    description: 'Cairo font for Arabic PDF reports',
  },
];

const ROOT = path.join(__dirname, '..');

function checkAsset(asset) {
  const fullPath = path.join(ROOT, asset.path);

  if (!fs.existsSync(fullPath)) {
    return {
      ok: false,
      reason: `missing at ${asset.path}`,
    };
  }

  const stat = fs.statSync(fullPath);
  if (!stat.isFile()) {
    return {
      ok: false,
      reason: `not a file: ${asset.path}`,
    };
  }

  if (stat.size < asset.minSizeBytes) {
    return {
      ok: false,
      reason: `too small (${stat.size} bytes, min ${asset.minSizeBytes})`,
    };
  }

  return { ok: true, size: stat.size };
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function main() {
  const missing = [];

  for (const asset of ASSETS) {
    const result = checkAsset(asset);
    if (result.ok) {
      console.log(`✅ ${asset.description} (${formatSize(result.size)})`);
    } else {
      console.log(`❌ ${asset.description} — ${result.reason}`);
      missing.push(asset);
    }
  }

  if (missing.length === 0) {
    console.log('\n🎉 All assets verified.');
    process.exit(0);
  }

  const message = [
    '',
    '⚠️  Missing assets detected:',
    ...missing.map((a) => `   - ${a.path}`),
    '',
    '👉 Run: npm run fonts:download',
    '',
  ].join('\n');

  if (WARN_ONLY) {
    console.warn(message);
    process.exit(0);
  } else {
    console.error(message);
    process.exit(1);
  }
}

main();
