#!/usr/bin/env node
/**
 * ============================================================================
 * DawaCore ERP - Unified Cloud Build Script (Render / PaaS)
 * Builds Prisma Client, NestJS Backend (dist/), and React Vite SPA (frontend/dist/)
 * ============================================================================
 */
const { execSync } = require('child_process');
const path = require('path');

function run(cmd, cwd = process.cwd()) {
  console.log(`\n▶ [BUILD] ${cmd} (cwd: ${cwd})`);
  execSync(cmd, {
    cwd,
    stdio: 'inherit',
    env: {
      ...process.env,
      PUPPETEER_SKIP_DOWNLOAD: 'true',
      PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: 'true',
      NPM_CONFIG_PRODUCTION: 'false',
    },
  });
}

console.log('========================================================');
console.log('🔨 DawaCore Cloud Build (Backend API + Frontend SPA)');
console.log('========================================================');

// 1. Install backend dependencies (including devDependencies required for NestJS & Prisma build)
run('npm install --include=dev --no-audit --no-fund');

// 2. Generate Prisma Client & compile NestJS backend into dist/
run('npx prisma generate');
run('npm run build');

// 3. Install frontend dependencies & compile React SPA into frontend/dist/
const frontendDir = path.join(process.cwd(), 'frontend');
run('npm install --include=dev --no-audit --no-fund', frontendDir);
run('npm run build', frontendDir);

console.log('\n========================================================');
console.log('✅ DawaCore Cloud Build Completed Successfully!');
console.log('========================================================');
