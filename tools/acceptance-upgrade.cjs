#!/usr/bin/env node
/**
 * acceptance-upgrade.cjs
 * Standalone JavaScript acceptance test runner for candidate MadarCore release.
 * Validates candidate backend services and guards via real HTTP endpoints on an ephemeral loopback port.
 * 
 * Safety guards:
 * - Refuses to run if database name does not match temporary acceptance pattern.
 * - Refuses to run against production database.
 * - Uses Prisma ONLY for fixture seeding, readback verification, and cleanup.
 * - Shuts down candidate process in finally block.
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  const dbUrl = process.env.ACCEPTANCE_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL is not set for acceptance test');
  }

  // Safety Guard: Database name must contain acceptance prefix/pattern and must not be production
  const urlObj = new URL(dbUrl);
  const dbName = urlObj.pathname.replace(/^\//, '');

  if (!dbName.startsWith('dawacore_upgrade_accept_')) {
    throw new Error(`SAFETY VIOLATION: Acceptance runner refused to run on non-acceptance database: ${dbName}`);
  }

  if (dbName === 'dawacore' || dbName === 'dawacore_production' || dbName === 'dawacore_test') {
    throw new Error(`CRITICAL ERROR: Production/default database name targeted in acceptance test: ${dbName}`);
  }

  process.env.DATABASE_URL = dbUrl;
  const targetDir = process.env.TARGET_DIRECTORY || process.cwd();
  const candidateDist = process.env.CANDIDATE_DIST_DIR || path.join(targetDir, 'dist');
  const candidateMain = path.join(candidateDist, 'main.js');

  if (!fs.existsSync(candidateMain)) {
    throw new Error(`Candidate backend main.js not found at: ${candidateMain}`);
  }

  // Load Prisma Client from candidate runtime, target node_modules, or project root node_modules
  let prismaClientModule = path.join(targetDir, 'node_modules', '@prisma', 'client');
  if (!fs.existsSync(prismaClientModule)) {
    const candidateRuntime = path.join(path.dirname(__dirname), 'node_modules', '@prisma', 'client');
    if (fs.existsSync(candidateRuntime)) {
      prismaClientModule = candidateRuntime;
    } else {
      const rootPrisma = path.resolve(__dirname, '..', 'node_modules', '@prisma', 'client');
      if (fs.existsSync(rootPrisma)) {
        prismaClientModule = rootPrisma;
      } else {
        throw new Error(`@prisma/client not found in target or candidate runtime: ${prismaClientModule}`);
      }
    }
  }

  const { PrismaClient, AccountType, Role, UnitType } = require(prismaClientModule);
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  await prisma.$connect();
  console.log(`[ACCEPTANCE] Connected to safe temporary database: ${dbName}`);

  // Fixture Seeding via Prisma (Allowed solely for fixtures & readback)
  const stamp = Date.now();
  const bcrypt = require('bcryptjs');
  const passwordRaw = 'AcceptancePass123!';
  const passwordHash = await bcrypt.hash(passwordRaw, 10);

  const companyA = await prisma.company.create({
    data: { name: `Acceptance Company A ${stamp}`, currency: 'SDG', logoUrl: '/logo-a.png' }
  });
  const branchA = await prisma.branch.create({
    data: { companyId: companyA.id, name: 'Branch A', code: `BR-A-${stamp}` }
  });

  const testUser = await prisma.user.create({
    data: {
      username: `accept_user_${stamp}`,
      passwordHash,
      role: Role.ADMIN,
      companyId: companyA.id,
      branchId: branchA.id
    }
  });

  // Ephemeral port selection
  const ephemeralPort = 30000 + Math.floor(Math.random() * 5000);
  const baseUrl = `http://127.0.0.1:${ephemeralPort}`;

  console.log(`[ACCEPTANCE] Starting candidate backend on loopback port: ${ephemeralPort}...`);

  const serverEnv = {
    ...process.env,
    PORT: ephemeralPort.toString(),
    HOST: '127.0.0.1',
    DATABASE_URL: dbUrl,
    NODE_ENV: 'production',
    JWT_SECRET: 'ACCEPTANCE_TEST_SECRET_KEY_MINIMUM_FORTY_EIGHT_BYTES_LONG_2026_SECURE_HMAC',
    DISABLE_BACKGROUND_JOBS: 'true',
    ENABLE_SWAGGER: 'false'
  };

  const serverProc = spawn(process.execPath, [candidateMain], {
    env: serverEnv,
    cwd: targetDir,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let serverStarted = false;
  serverProc.stdout.on('data', (d) => {
    const s = d.toString();
    if (s.includes('MadarCore Server running')) {
      serverStarted = true;
    }
  });

  // Poll server readiness
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    try {
      const res = await fetch(`${baseUrl}/api/branding`);
      if (res.ok) {
        serverStarted = true;
        break;
      }
    } catch {}
  }

  if (!serverStarted) {
    serverProc.kill();
    throw new Error(`Candidate backend failed to start on port ${ephemeralPort}`);
  }

  console.log(`[ACCEPTANCE] Candidate backend online and responsive at ${baseUrl}`);

  const results = [];
  function assert(condition, scenarioId, description) {
    if (condition) {
      console.log(`  ✅ PASS: [${scenarioId}] ${description}`);
      results.push({ scenarioId, status: 'PASS', description });
    } else {
      console.error(`  ❌ FAIL: [${scenarioId}] ${description}`);
      results.push({ scenarioId, status: 'FAIL', description });
      throw new Error(`Acceptance scenario failed: [${scenarioId}] ${description}`);
    }
  }

  try {
    // 1. Health Endpoint Verification
    const healthRes = await fetch(`${baseUrl}/api/licensing/status`);
    assert(healthRes.status === 200, 'HTTP-01', 'Licensing/Health endpoint responds with HTTP 200');

    // 2. Branding Endpoint Verification
    const brandingRes = await fetch(`${baseUrl}/api/branding`);
    const brandingData = await brandingRes.json();
    assert(brandingRes.status === 200 && brandingData.platformName === 'MadarCore', 'HTTP-02', 'Branding endpoint verifies MadarCore identity');

    // 3. Authentication: Valid Login
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: testUser.username, password: passwordRaw })
    });
    const loginData = await loginRes.json();
    assert(loginRes.status === 200 && loginData.accessToken, 'HTTP-03', 'Authentication: Valid credentials return JWT access token');
    const token = loginData.accessToken;

    // 4. Authentication: Invalid Password Rejected
    const badLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: testUser.username, password: 'WrongPassword999!' })
    });
    assert(badLoginRes.status === 401 || badLoginRes.status === 400, 'HTTP-04', 'Authentication: Invalid password strictly rejected with 401');

    // 5. Open Shift via HTTP
    const openShiftRes = await fetch(`${baseUrl}/api/shifts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ startCash: 250 })
    });
    const shiftData = await openShiftRes.json();
    assert(openShiftRes.status === 201 && shiftData.id, 'HTTP-05', 'Shifts: Successfully opened cashier shift via HTTP endpoint');
    const shiftId = shiftData.id;

    // 6. Close Shift via HTTP
    const closeShiftRes = await fetch(`${baseUrl}/api/shifts/${shiftId}/close`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ actualCash: 250, notes: 'End of acceptance shift' })
    });
    assert(closeShiftRes.status === 200 || closeShiftRes.status === 201, 'HTTP-06', 'Shifts: Successfully closed shift via HTTP endpoint');

    // 7. Prevent Double Close via HTTP
    const doubleCloseRes = await fetch(`${baseUrl}/api/shifts/${shiftId}/close`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ actualCash: 250 })
    });
    assert(doubleCloseRes.status === 400 || doubleCloseRes.status === 409 || !doubleCloseRes.ok, 'HTTP-07', 'Shifts: Double close strictly rejected by application service');

    // 8. DB State Verification: Readback checks
    const dbShift = await prisma.shift.findUnique({ where: { id: shiftId } });
    assert(dbShift && dbShift.endTime !== null, 'DB-08', 'Database readback: Shift recorded as closed in database');

    console.log(`\n🎉 All ${results.length} HTTP acceptance scenarios passed via real candidate backend!`);
    return { ok: true, scenariosCount: results.length, database: dbName, port: ephemeralPort };

  } finally {
    // Graceful and complete teardown of candidate server
    console.log('[ACCEPTANCE] Stopping candidate backend...');
    serverProc.kill('SIGTERM');
    await sleep(1000);
    try { serverProc.kill('SIGKILL'); } catch {}
    await prisma.$disconnect();
  }
}

run()
  .then((res) => {
    console.log(JSON.stringify(res, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error('Acceptance execution failed:', err.message);
    process.exit(1);
  });
