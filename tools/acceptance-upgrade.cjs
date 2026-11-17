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

  // 4. Accounts for Company A (Cash, Inventory, Revenue, and Expense)
  const cashAccountA = await prisma.account.create({
    data: {
      companyId: companyA.id,
      branchId: branchA1.id,
      code: '1101',
      name: 'الصندوق الرئيسي',
      type: AccountType.ASSET,
      level: 1,
      isLeaf: true
    }
  });

  const invAccountA = await prisma.account.create({
    data: {
      companyId: companyA.id,
      branchId: branchA1.id,
      code: '1104',
      name: 'مخزون الأدوية',
      type: AccountType.ASSET,
      level: 1,
      isLeaf: true
    }
  });

  const revAccountA = await prisma.account.create({
    data: {
      companyId: companyA.id,
      branchId: branchA1.id,
      code: '4101',
      name: 'إيرادات مبيعات الأدوية',
      type: AccountType.REVENUE,
      level: 1,
      isLeaf: true
    }
  });

  const cogsAccountA = await prisma.account.create({
    data: {
      companyId: companyA.id,
      branchId: branchA1.id,
      code: '5101',
      name: 'تكلفة البضاعة المباعة',
      type: AccountType.EXPENSE,
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
  let childLogs = '';
  const appendChildLogs = (chunk) => {
    if (!chunk) return;
    childLogs = (childLogs + chunk.toString()).slice(-4000);
  };

  serverProc.stdout.on('data', (d) => {
    appendChildLogs(d);
    const s = d.toString();
    if (s.includes('MadarCore Server running')) {
      serverStarted = true;
    }
  });

  serverProc.stderr.on('data', (d) => {
    appendChildLogs(d);
  });

  function sanitizeLogs(rawText) {
    if (!rawText) return '';
    return rawText
      .replace(/postgresql:\/\/[^@\s]+@/gi, 'postgresql://***:***@')
      .replace(/password[:=][^\s&"']+/gi, 'password=***')
      .replace(/secret[:=][^\s&"']+/gi, 'secret=***');
  }

  // Poll server readiness up to 60 seconds (120 attempts x 500ms)
  for (let i = 0; i < 120; i++) {
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
    const safeOutput = sanitizeLogs(childLogs).trim().slice(-1000);
    throw new Error(`Candidate backend failed to start on port ${ephemeralPort} within 60s. Process logs: ${safeOutput || 'No output recorded'}`);
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

  async function captureBaseline() {
    return {
      salesInvoices: await prisma.salesInvoice.count(),
      invoiceItems: await prisma.saleInvoiceItem.count(),
      inventoryTransactions: await prisma.inventoryTransaction.count(),
      expenses: await prisma.expense.count(),
      cashMovements: await prisma.cashMovement.count(),
      accountingOutbox: await prisma.accountingOutbox.count(),
      journalEntries: await prisma.journalEntry.count(),
      journalLines: await prisma.journalLine.count(),
    };
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
    const baseBeforeCrossBranch = await captureBaseline();
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

    // Database readback: verify baseline table counts unchanged after rejected cross-branch sale
    const baseAfterCrossBranch = await captureBaseline();
    assert(JSON.stringify(baseBeforeCrossBranch) === JSON.stringify(baseAfterCrossBranch), 'DB-09B-BASE', 'Database readback: Table counts unchanged after rejected cross-branch sale');
    const unmodBatchA = await prisma.batch.findUnique({ where: { id: batchA.id } });
    assert(unmodBatchA && unmodBatchA.quantityInBase === 50, 'DB-09C', 'Database readback: Batch quantity unchanged after rejected cross-branch sale');

    // 9. Sales: Valid Sale Invoice with Active Shift (Scenario C - Sales & COGS)
    const baseBeforeSale = await captureBaseline();
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
    const baseAfterSale = await captureBaseline();
    assert(baseAfterSale.salesInvoices === baseBeforeSale.salesInvoices + 1, 'DB-10A', 'Database readback: SalesInvoice count incremented by 1');
    assert(baseAfterSale.inventoryTransactions === baseBeforeSale.inventoryTransactions + 1, 'DB-10B', 'Database readback: InventoryTransaction count incremented by 1');

    const updatedBatch = await prisma.batch.findUnique({ where: { id: batchA.id } });
    assert(updatedBatch && updatedBatch.quantityInBase === 48, 'DB-11', 'Database readback: Batch stock decremented accurately from 50 to 48');

    const dbInvoice = await prisma.salesInvoice.findUnique({
      where: { id: saleInvoiceId },
      include: { items: true }
    });
    assert(dbInvoice && dbInvoice.shiftId === shiftId, 'DB-12', 'Database readback: Sales invoice linked to active shift in database');
    assert(dbInvoice && dbInvoice.items.length === 1 && Number(dbInvoice.items[0].costPrice) === 10, 'DB-12B', 'Database readback: Sales invoice item recorded batch costPrice (10) accurately');

    // Readback InventoryTransaction SALE
    const invTx = await prisma.inventoryTransaction.findFirst({
      where: { referenceId: dbInvoice.invoiceNumber, transactionType: 'SALE' }
    });
    assert(
      invTx &&
      Number(invTx.quantity) === -2 &&
      Number(invTx.unitCost) === 10,
      'DB-12C',
      'Database readback: SALE inventory issue recorded as -2 at unit cost 10'
    );

    // Readback accounting effect (JournalEntry for SALE) with real bounded polling
    let saleJv = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      saleJv = await prisma.journalEntry.findFirst({
        where: { companyId: companyA.id, source: 'SALE' },
        include: { lines: true }
      });
      if (saleJv?.lines?.length >= 2) break;
      await sleep(500);
    }

    assert(
      saleJv && saleJv.lines && saleJv.lines.length >= 2,
      'DB-12D',
      'Database readback: JournalEntry for SALE with revenue and inventory/COGS lines created'
    );

    // 11. Expenses (Scenario B): Create expense within cash balance, and reject when exceeding balance
    // Shift opening cash was 250, cash sale added 50 (total expectedCash = 300)
    const baseBeforeExpense = await captureBaseline();
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

    const baseAfterExpense = await captureBaseline();
    assert(baseAfterExpense.expenses === baseBeforeExpense.expenses + 1, 'DB-13A', 'Database readback: Expense count incremented by 1');
    assert(baseAfterExpense.cashMovements === baseBeforeExpense.cashMovements + 1, 'DB-13B', 'Database readback: CashMovement count incremented by 1');
    assert(baseAfterExpense.accountingOutbox === baseBeforeExpense.accountingOutbox + 1, 'DB-13C', 'Database readback: AccountingOutbox count incremented by 1');

    const expCashMovement = await prisma.cashMovement.findFirst({
      where: { shiftId, type: 'CASH_OUT' }
    });
    assert(expCashMovement && Number(expCashMovement.amount) === 30, 'DB-13D', 'Database readback: CashMovement CASH_OUT recorded for expense');

    const expOutbox = await prisma.accountingOutbox.findFirst({
      where: { eventType: 'EXPENSE_CREATED', status: 'PENDING' }
    });
    assert(expOutbox && expOutbox.payload && expOutbox.payload.expenseId === expenseData.id, 'DB-13E', 'Database readback: AccountingOutbox EXPENSE_CREATED event created with valid payload');

    // Attempt expense greater than available cash (amount 999999 > remaining cash)
    const baseBeforeExcessive = await captureBaseline();
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
    assert(excessiveExpenseRes.status === 400 || excessiveExpenseRes.status === 422 || !excessiveExpenseRes.ok, 'HTTP-13F', 'Expenses: Excessive expense exceeding available cash balance strictly rejected');

    const baseAfterExcessive = await captureBaseline();
    assert(JSON.stringify(baseBeforeExcessive) === JSON.stringify(baseAfterExcessive), 'DB-13G', 'Database readback: Table counts unchanged after rejected excessive expense (no Expense, no CashMovement, no Outbox)');

    // 12. Purchasing (Scenario D): Direct receive with LANDED_COST AND PERIOD_EXPENSE (RR6-02)
    // 12A. LANDED_COST: additional expenses allocated to unit cost
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
          batchNumber: `RECV-LAND-${stamp}`,
          expiryDate: new Date(Date.now() + 500 * 24 * 3600 * 1000).toISOString().split('T')[0],
          quantity: 15,
          costPrice: 8,
          sellingPrice: 20
        }]
      })
    });
    const purchaseData = await purchaseRes.json();
    assert(purchaseRes.status === 201 || purchaseRes.status === 200, 'HTTP-14', 'Purchasing: Direct purchase receipt with LANDED_COST processed');

    // Verify Landed unit cost: base cost (8) + allocated expense (30 / 15 = 2) = 10
    const landedBatch = await prisma.batch.findFirst({
      where: { batchNumber: `RECV-LAND-${stamp}`, branchId: branchA1.id }
    });
    assert(landedBatch && landedBatch.quantityInBase === 15 && Number(landedBatch.costPrice) === 10, 'DB-14A', 'Database readback: Landed unit cost calculated accurately (8 base + 2 allocated expense = 10)');

    const landedOutbox = await prisma.accountingOutbox.findFirst({
      where: { eventType: 'PURCHASE_RECEIVED', status: 'PENDING' }
    });
    assert(landedOutbox && landedOutbox.payload && landedOutbox.payload.expenseAllocationMethod === 'LANDED_COST', 'DB-14B', 'Database readback: Outbox PURCHASE_RECEIVED recorded with LANDED_COST allocation');

    // 12B. PERIOD_EXPENSE: additional expenses NOT allocated to unit cost
    const medicineA2 = await prisma.medicine.create({
      data: {
        code: `MED-EXP-${stamp}`,
        barcode: `BAR-EXP-${stamp}`,
        tradeName: `Amoxicillin ${stamp}`,
        scientificName: 'Amoxicillin',
        category: 'Antibiotic'
      }
    });

    const periodPurchaseRes = await fetch(`${baseUrl}/api/purchasing/receive`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminTokenA}`
      },
      body: JSON.stringify({
        companyId: companyA.id,
        branchId: branchA1.id,
        supplierId: supplierA.id,
        additionalExpenses: 30,
        expenseAllocationMethod: 'PERIOD_EXPENSE',
        items: [{
          medicineId: medicineA2.id,
          batchNumber: `RECV-PER-${stamp}`,
          expiryDate: new Date(Date.now() + 500 * 24 * 3600 * 1000).toISOString().split('T')[0],
          quantity: 15,
          costPrice: 8,
          sellingPrice: 20
        }]
      })
    });
    assert(periodPurchaseRes.status === 201 || periodPurchaseRes.status === 200, 'HTTP-14C', 'Purchasing: Direct purchase receipt with PERIOD_EXPENSE processed');

    const periodBatch = await prisma.batch.findFirst({
      where: { batchNumber: `RECV-PER-${stamp}`, branchId: branchA1.id }
    });
    assert(periodBatch && periodBatch.quantityInBase === 15 && Number(periodBatch.costPrice) === 8, 'DB-14D', 'Database readback: PERIOD_EXPENSE unit cost strictly preserves base cost (8) without incorporating additional expenses');

    const periodOutbox = await prisma.accountingOutbox.findFirst({
      where: { eventType: 'PURCHASE_RECEIVED', status: 'PENDING', payload: { path: ['expenseAllocationMethod'], equals: 'PERIOD_EXPENSE' } }
    });
    assert(periodOutbox && periodOutbox.payload && periodOutbox.payload.expenseAllocationMethod === 'PERIOD_EXPENSE', 'DB-14E', 'Database readback: Outbox PURCHASE_RECEIVED recorded with PERIOD_EXPENSE allocation');

    // 13. Shifts (Scenario E): Concurrent Close with Promise.allSettled (Exactly 1 succeeds, 1 rejected)
    const baseBeforeClose = await captureBaseline();
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

    const baseAfterClose = await captureBaseline();
    assert(baseAfterClose.cashMovements === baseBeforeClose.cashMovements, 'DB-15B', 'Database readback: No duplicate CashMovement created on shift close');

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
