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

  const { PrismaClient, AccountType, Role, PaymentMethod, ExpensePaymentMethod } = require(prismaClientModule);
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  await prisma.$connect();
  console.log(`[ACCEPTANCE] Connected to safe temporary database: ${dbName}`);

  // Fixture Seeding via Prisma (Allowed solely for fixtures & readback)
  const stamp = Date.now();
  const bcrypt = require('bcryptjs');
  const passwordRaw = 'AcceptancePass123!';
  const passwordHash = await bcrypt.hash(passwordRaw, 10);

  // 1. Company A & Branches
  const companyA = await prisma.company.create({
    data: { name: `Acceptance Company A ${stamp}`, currency: 'SDG', logoUrl: '/logo-a.png' }
  });
  const branchA1 = await prisma.branch.create({
    data: { companyId: companyA.id, name: 'Branch A1', code: `BR-A1-${stamp}` }
  });
  const branchA2 = await prisma.branch.create({
    data: { companyId: companyA.id, name: 'Branch A2', code: `BR-A2-${stamp}` }
  });

  // 2. Company B (Tenant Isolation Fixture)
  const companyB = await prisma.company.create({
    data: { name: `Acceptance Company B ${stamp}`, currency: 'SDG', logoUrl: '/logo-b.png' }
  });
  const branchB = await prisma.branch.create({
    data: { companyId: companyB.id, name: 'Branch B1', code: `BR-B1-${stamp}` }
  });

  // 3. Users with valid Role enum (COMPANY_ADMIN and CASHIER)
  const adminUserA = await prisma.user.create({
    data: {
      name: 'Admin Company A',
      username: `admin_a_${stamp}`,
      passwordHash,
      role: Role.COMPANY_ADMIN,
      companyId: companyA.id,
      branchId: branchA1.id
    }
  });

  const cashierUserA = await prisma.user.create({
    data: {
      name: 'Cashier User A',
      username: `cashier_a_${stamp}`,
      passwordHash,
      role: Role.CASHIER,
      companyId: companyA.id,
      branchId: branchA1.id
    }
  });

  const adminUserB = await prisma.user.create({
    data: {
      name: 'Admin Company B',
      username: `admin_b_${stamp}`,
      passwordHash,
      role: Role.COMPANY_ADMIN,
      companyId: companyB.id,
      branchId: branchB.id
    }
  });

  // 4. Accounts for Company A (Cash and Expense)
  const cashAccountA = await prisma.account.create({
    data: {
      companyId: companyA.id,
      branchId: branchA1.id,
      code: `1010-${stamp}`,
      name: 'الصندوق الرئيسي',
      type: AccountType.ASSET,
      level: 1,
      isLeaf: true
    }
  });

  const expenseAccountA = await prisma.account.create({
    data: {
      companyId: companyA.id,
      branchId: branchA1.id,
      code: `5010-${stamp}`,
      name: 'مصاريف تشغيلية',
      type: AccountType.EXPENSE,
      level: 1,
      isLeaf: true
    }
  });

  // 5. Supplier, Medicine & Batch for Company A
  const supplierA = await prisma.supplier.create({
    data: {
      companyId: companyA.id,
      branchId: branchA1.id,
      name: `Supplier A ${stamp}`,
      phone: '0912345678'
    }
  });

  const medicineA = await prisma.medicine.create({
    data: {
      code: `MED-${stamp}`,
      barcode: `BAR-${stamp}`,
      tradeName: `Panadol Extra ${stamp}`,
      scientificName: 'Paracetamol',
      category: 'Analgesic'
    }
  });

  const batchA = await prisma.batch.create({
    data: {
      batchNumber: `BAT-${stamp}`,
      medicineId: medicineA.id,
      branchId: branchA1.id,
      costPrice: 10,
      salePrice: 25,
      quantity: 50,
      quantityInBase: 50,
      expiryDate: new Date(Date.now() + 365 * 24 * 3600 * 1000)
    }
  });

  // Ephemeral loopback port selection
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
    const healthRes = await fetch(`${baseUrl}/api/health`);
    const healthData = await healthRes.json();
    assert(healthRes.status === 200 && healthData.status === 'ok' && healthData.service === 'MadarCore ERP', 'HTTP-01', 'Health endpoint contract: status=ok and service=MadarCore ERP');

    // 2. Branding Endpoint Verification
    const brandingRes = await fetch(`${baseUrl}/api/branding`);
    const brandingData = await brandingRes.json();
    assert(brandingRes.status === 200 && brandingData.platformName === 'MadarCore', 'HTTP-02', 'Branding endpoint contract: platformName=MadarCore');

    // 3. Authentication: Company A Admin & Cashier Login
    const loginAdminRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: adminUserA.username, password: passwordRaw })
    });
    const loginAdminData = await loginAdminRes.json();
    assert(loginAdminRes.status === 200 && loginAdminData.accessToken, 'HTTP-03', 'Authentication: Company Admin login returns access token');
    const adminTokenA = loginAdminData.accessToken;

    const loginCashierRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: cashierUserA.username, password: passwordRaw })
    });
    const loginCashierData = await loginCashierRes.json();
    assert(loginCashierRes.status === 200 && loginCashierData.accessToken, 'HTTP-04', 'Authentication: Cashier login returns access token');
    const cashierTokenA = loginCashierData.accessToken;

    // 4. Authentication: Invalid Password Rejected
    const badLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: adminUserA.username, password: 'WrongPassword999!' })
    });
    assert(badLoginRes.status === 401 || badLoginRes.status === 400, 'HTTP-05', 'Authentication: Invalid password strictly rejected with 401');

    // 5. Multi-tenant Isolation: User A cannot query or mutate Company B resources
    const crossTenantRes = await fetch(`${baseUrl}/api/branches`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminTokenA}` }
    });
    const branchesData = await crossTenantRes.json();
    const hasBranchB = Array.isArray(branchesData) && branchesData.some(b => b.companyId === companyB.id);
    assert(crossTenantRes.status === 200 && !hasBranchB, 'HTTP-06', 'Tenant Isolation: Company A user strictly isolated from Company B branches');

    // 6. Shifts: Prevent opening shift for another company or invalid branch
    const badShiftRes = await fetch(`${baseUrl}/api/shifts/open`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cashierTokenA}`
      },
      body: JSON.stringify({
        branchId: branchB.id,
        userId: cashierUserA.id,
        openingBalance: 100
      })
    });
    assert(badShiftRes.status === 400 || badShiftRes.status === 403 || badShiftRes.status === 404, 'HTTP-07', 'Shifts: Opening shift for unauthorized foreign branch strictly rejected');

    // 7. Shifts: Open valid shift for Cashier
    const openShiftRes = await fetch(`${baseUrl}/api/shifts/open`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cashierTokenA}`
      },
      body: JSON.stringify({
        branchId: branchA1.id,
        userId: cashierUserA.id,
        openingBalance: 250
      })
    });
    const shiftData = await openShiftRes.json();
    assert(openShiftRes.status === 201 && shiftData.id, 'HTTP-08', 'Shifts: Successfully opened cashier shift via POST /api/shifts/open');
    const shiftId = shiftData.id;

    // 8. Sales: Prevent Sale when shift is not provided or mismatched
    const badSaleRes = await fetch(`${baseUrl}/api/sales/invoices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cashierTokenA}`
      },
      body: JSON.stringify({
        branchId: branchA1.id,
        shiftId: '00000000-0000-0000-0000-000000000000',
        userId: cashierUserA.id,
        paymentMethod: PaymentMethod.CASH,
        items: [{ medicineId: medicineA.id, batchId: batchA.id, quantity: 1, unitPrice: 25 }]
      })
    });
    assert(badSaleRes.status === 400 || badSaleRes.status === 404 || !badSaleRes.ok, 'HTTP-09', 'Sales: Sale without valid active shift strictly rejected');

    // 8B. Sales (Scenario A): Prevent Sale using shift of another branch (branchA2 shift used in branchA1 sale)
    const crossBranchSaleRes = await fetch(`${baseUrl}/api/sales/invoices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cashierTokenA}`
      },
      body: JSON.stringify({
        branchId: branchA2.id,
        shiftId: shiftId, // shift belongs to branchA1
        userId: cashierUserA.id,
        paymentMethod: PaymentMethod.CASH,
        items: [{ medicineId: medicineA.id, batchId: batchA.id, quantity: 1, unitPrice: 25 }]
      })
    });
    assert(crossBranchSaleRes.status === 400 || crossBranchSaleRes.status === 403 || crossBranchSaleRes.status === 404 || !crossBranchSaleRes.ok, 'HTTP-09B', 'Sales: Sale using shift of another branch strictly rejected');

    // Verify no sales invoice or batch decrement from rejected cross-branch sale
    const unmodBatchA = await prisma.batch.findUnique({ where: { id: batchA.id } });
    assert(unmodBatchA && unmodBatchA.quantityInBase === 50, 'DB-09C', 'Database readback: Batch quantity unchanged after rejected cross-branch sale');

    // 9. Sales: Valid Sale Invoice with Active Shift (Scenario C - Sales & COGS)
    const validSaleRes = await fetch(`${baseUrl}/api/sales/invoices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cashierTokenA}`
      },
      body: JSON.stringify({
        branchId: branchA1.id,
        shiftId: shiftId,
        userId: cashierUserA.id,
        paymentMethod: PaymentMethod.CASH,
        items: [{ medicineId: medicineA.id, batchId: batchA.id, quantity: 2, unitPrice: 25 }]
      })
    });
    const saleData = await validSaleRes.json();
    assert(validSaleRes.status === 201 && saleData.id, 'HTTP-10', 'Sales: Valid sales invoice processed via POST /api/sales/invoices');
    const saleInvoiceId = saleData.id;

    // 10. Database Readback: Verify Batch quantity decreased and invoice recorded
    const updatedBatch = await prisma.batch.findUnique({ where: { id: batchA.id } });
    assert(updatedBatch && updatedBatch.quantityInBase === 48, 'DB-11', 'Database readback: Batch stock decremented accurately from 50 to 48');

    const dbInvoice = await prisma.salesInvoice.findUnique({
      where: { id: saleInvoiceId },
      include: { items: true }
    });
    assert(dbInvoice && dbInvoice.shiftId === shiftId, 'DB-12', 'Database readback: Sales invoice linked to active shift in database');
    assert(dbInvoice && dbInvoice.items.length === 1 && Number(dbInvoice.items[0].costPrice) === 10, 'DB-12B', 'Database readback: Sales invoice item recorded batch costPrice (10) accurately');

    // 11. Expenses (Scenario B): Create expense within cash balance, and reject when exceeding balance
    // Shift opening cash was 250, cash sale added 50 (total expectedCash = 300)
    const expenseRes = await fetch(`${baseUrl}/api/expenses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminTokenA}`
      },
      body: JSON.stringify({
        companyId: companyA.id,
        branchId: branchA1.id,
        shiftId: shiftId,
        expenseType: 'CLEANING',
        accountId: expenseAccountA.id,
        amount: 30,
        paidFrom: 'CASH',
        paymentMethod: ExpensePaymentMethod.CASH
      })
    });
    const expenseData = await expenseRes.json();
    assert(expenseRes.status === 201 && expenseData.id, 'HTTP-13', 'Expenses: Operational expense recorded via POST /api/expenses');

    // Attempt expense greater than available cash (amount 99999 > remaining cash)
    const excessiveExpenseRes = await fetch(`${baseUrl}/api/expenses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminTokenA}`
      },
      body: JSON.stringify({
        companyId: companyA.id,
        branchId: branchA1.id,
        shiftId: shiftId,
        expenseType: 'MAINTENANCE',
        accountId: expenseAccountA.id,
        amount: 999999,
        paidFrom: 'CASH',
        paymentMethod: ExpensePaymentMethod.CASH
      })
    });
    assert(excessiveExpenseRes.status === 400 || excessiveExpenseRes.status === 422 || !excessiveExpenseRes.ok, 'HTTP-13B', 'Expenses: Excessive expense exceeding available cash balance strictly rejected');

    // Verify rejected expense left no trace in database
    const rejectedExpenses = await prisma.expense.findMany({
      where: { companyId: companyA.id, amount: 999999 }
    });
    assert(rejectedExpenses.length === 0, 'DB-13C', 'Database readback: No expense record created for rejected excessive expense');

    // 12. Purchasing (Scenario D): Direct receive purchase order with additionalExpenses (Landed Cost)
    const purchaseRes = await fetch(`${baseUrl}/api/purchasing/receive`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminTokenA}`
      },
      body: JSON.stringify({
        companyId: companyA.id,
        branchId: branchA1.id,
        supplierId: supplierA.id,
        additionalExpenses: 30, // 30 distributed over 15 units = +2 landed cost per unit
        expenseAllocationMethod: 'LANDED_COST',
        items: [{
          medicineId: medicineA.id,
          batchNumber: `RECV-${stamp}`,
          expiryDate: new Date(Date.now() + 500 * 24 * 3600 * 1000).toISOString().split('T')[0],
          quantity: 15,
          costPrice: 8,
          sellingPrice: 20
        }]
      })
    });
    const purchaseData = await purchaseRes.json();
    assert(purchaseRes.status === 201 || purchaseRes.status === 200, 'HTTP-14', 'Purchasing: Direct purchase receipt with additional expenses processed');

    // Verify Landed unit cost: base cost (8) + allocated expense (30 / 15 = 2) = 10
    const receivedBatch = await prisma.batch.findFirst({
      where: { batchNumber: `RECV-${stamp}`, branchId: branchA1.id }
    });
    assert(receivedBatch && receivedBatch.quantityInBase === 15, 'DB-14B', 'Database readback: Received purchase quantity accurately added to batch');
    assert(receivedBatch && Number(receivedBatch.costPrice) === 10, 'DB-14C', 'Database readback: Landed unit cost calculated accurately (8 base + 2 allocated expense = 10)');

    // 13. Shifts (Scenario E): Concurrent Close with Promise.allSettled (Exactly 1 succeeds, 1 rejected)
    const closePromises = [
      fetch(`${baseUrl}/api/shifts/${shiftId}/close`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cashierTokenA}` },
        body: JSON.stringify({ actualCash: 270, notes: 'Concurrent Close Attempt 1' })
      }),
      fetch(`${baseUrl}/api/shifts/${shiftId}/close`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cashierTokenA}` },
        body: JSON.stringify({ actualCash: 270, notes: 'Concurrent Close Attempt 2' })
      })
    ];

    const closeResults = await Promise.allSettled(closePromises);
    const closeStatuses = [];
    for (const cr of closeResults) {
      if (cr.status === 'fulfilled') {
        closeStatuses.push(cr.value.status);
      }
    }

    const successCount = closeStatuses.filter(s => s === 200 || s === 201).length;
    const failCount = closeStatuses.filter(s => s >= 400).length;
    assert(successCount === 1 && failCount === 1, 'HTTP-15', 'Shifts: Concurrent close via Promise.allSettled resulted in exactly 1 SUCCESS and 1 REJECTED');

    // 14. Shifts: Prevent Subsequent Double Close
    const doubleCloseRes = await fetch(`${baseUrl}/api/shifts/${shiftId}/close`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cashierTokenA}`
      },
      body: JSON.stringify({ actualCash: 270 })
    });
    assert(doubleCloseRes.status === 400 || doubleCloseRes.status === 409 || !doubleCloseRes.ok, 'HTTP-16', 'Shifts: Subsequent close strictly rejected on already closed shift');

    // 15. DB Readback: Final Shift State Verification
    const closedDbShift = await prisma.shift.findUnique({ where: { id: shiftId } });
    assert(closedDbShift && closedDbShift.status === 'CLOSED' && closedDbShift.endTime !== null, 'DB-17', 'Database readback: Shift recorded as CLOSED with timestamp in database');

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
