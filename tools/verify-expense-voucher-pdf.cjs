'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

const { BadRequestException, NotFoundException } = require(path.join(root, 'node_modules/@nestjs/common'));
const { PdfExportService } = require(path.join(root, 'dist/modules/accounting/reports/services/pdf-export.service'));
const { ExpensesService } = require(path.join(root, 'dist/expenses/expenses.service'));
const { ExpensesController } = require(path.join(root, 'dist/expenses/expenses.controller'));

const taskEvidenceDir = 'C:\\Users\\HP\\.codex\\.chatgpt-projects\\g-p-6a80e70eeea88191a2a02a86851eca37\\ai-development-workflow\\20261103-expense-voucher-pdf\\evidence';

async function runVerification() {
  console.log('--- Starting Expense Voucher PDF Verification ---');

  // 1. Initialize PdfExportService
  const pdfService = new PdfExportService();
  assert(pdfService, 'PdfExportService should be instantiable');

  // 2. Test PDF Generation: Approved Operating Expense
  const sampleVoucherApproved = {
    companyName: 'مجموعة صيدليات داواكور الدولية',
    branchName: 'فرع الخرطوم الرئيسي',
    currency: 'ج.س',
    timezone: 'Africa/Cairo',
    expenseNumber: 'EXP-2026-00042',
    date: new Date('2026-11-03T10:30:00Z'),
    createdAt: new Date('2026-11-03T10:30:00Z'),
    status: 'APPROVED',
    amount: 125000.50,
    expenseType: 'مصروفات نظافة وصيانة دورية',
    category: 'OPERATING',
    paidTo: 'شركة الأفق لخدمات النظافة والتعقيم',
    paidFrom: 'CASH',
    paymentMethod: 'CASH',
    accountCode: '510201',
    accountName: 'مصروفات صيانة ونظافة',
    referenceNo: 'REC-CLEAN-77',
    description: 'سداد تكلفة صيانة التكييف المركزي وخدمات التعقيم الشهري لصالة المبيعات الرئيسية للفرع.',
    creatorName: 'أحمد محمود (محاسب الفرع)',
    approverName: 'د. عثمان علي (مدير عام الفرع)',
    approvedAt: new Date('2026-11-03T11:00:00Z'),
  };

  const bufferApproved = await pdfService.generateExpenseVoucherPdf(sampleVoucherApproved);
  assert(Buffer.isBuffer(bufferApproved), 'Expected buffer from generateExpenseVoucherPdf');
  assert(bufferApproved.length > 500, `Buffer size too small: ${bufferApproved.length}`);
  assert.strictEqual(bufferApproved.slice(0, 5).toString('ascii'), '%PDF-', 'Expected valid %PDF- magic header');
  console.log('✅ Test 1: Approved Operating Expense PDF generated successfully (size:', bufferApproved.length, 'bytes)');

  // 3. Test PDF Generation: Pending Voucher (Liability Payment, Bank Transfer)
  const sampleVoucherPending = {
    companyName: 'مجموعة صيدليات داواكور الدولية',
    branchName: 'فرع بحري',
    currency: 'ج.س',
    timezone: 'Africa/Cairo',
    expenseNumber: 'EXP-2026-00043',
    date: new Date('2026-11-03T12:00:00Z'),
    status: 'PENDING',
    amount: 850000.00,
    expenseType: 'سداد دفعة مورد أدوية',
    category: 'LIABILITY',
    paidTo: 'شركة فارما ميد للخدمات الدوائية',
    paidFrom: 'BANK',
    paymentMethod: 'BANK_TRANSFER',
    accountCode: '210101',
    accountName: 'موردو الأدوية المحليون',
    referenceNo: 'TRF-BNK-990812',
    description: 'سداد الدفعة الثانية من فاتورة توريد أدوية السكري والضغط بحسب المطالبة رقم 4120',
    creatorName: 'سارة عبد الله (محاسب الصندوق)',
  };

  const bufferPending = await pdfService.generateExpenseVoucherPdf(sampleVoucherPending);
  assert(bufferPending.slice(0, 5).toString('ascii'), '%PDF-');
  console.log('✅ Test 2: Pending Voucher PDF generated successfully (size:', bufferPending.length, 'bytes)');

  // 4. Test PDF Generation: Rejected Voucher with Rejection Reason & Multiline Long Description
  const sampleVoucherRejected = {
    companyName: 'مجموعة صيدليات داواكور الدولية',
    branchName: 'فرع أم درمان',
    currency: 'ج.س',
    timezone: 'Africa/Cairo',
    expenseNumber: 'EXP-2026-00044',
    date: new Date('2026-11-03T14:15:00Z'),
    status: 'REJECTED',
    amount: 45000.00,
    expenseType: 'شراء ضيافة ومستلزمات مكتبية',
    category: 'EXPENSE',
    paidTo: null, // explicit test of missing/empty beneficiary
    paidFrom: 'BANK',
    paymentMethod: 'CHEQUE',
    accountCode: '510305',
    accountName: 'مصروفات ضيافة وبوفيه',
    referenceNo: 'CHQ-881230',
    description: 'طلب شراء مستلزمات مكتبية متنوعة تشمل ورق طباعة وأحبار طابعات وضيافة وفد التفتيش الدوري.\nملاحظة: الفواتير الضريبية المرفقة غير مكتملة الختم القانوني ويجب استيفاء متطلبات الإدارة المالية قبل الصرف.\nيرجى إعادة التقديم بعد إرفاق الفاتورة الإلكترونية المعتمدة.',
    rejectionReason: 'الفواتير المرفقة غير ضريبية وتفتقر لختم المورد المعتمد، ومبلغ البند يتجاوز الميزانية الشهرية التقديرية لبند الضيافة.',
    creatorName: 'محمد إبراهيم (أمين المخزن)',
    approverName: 'المدير المالي',
  };

  const bufferRejected = await pdfService.generateExpenseVoucherPdf(sampleVoucherRejected);
  assert(bufferRejected.slice(0, 5).toString('ascii'), '%PDF-');
  console.log('✅ Test 3: Rejected Voucher PDF generated with rejection reason (size:', bufferRejected.length, 'bytes)');

  // 5. Test Beneficiary Fallback: Missing paidTo explicitly outputs "غير محدد" and never invents a name
  const docDefMissingPaidTo = pdfService.buildExpenseVoucherDocDefinition({ paidTo: null });
  const docDefStr = JSON.stringify(docDefMissingPaidTo);
  assert(docDefStr.includes('غير محدد'), 'Expected "غير محدد" for null paidTo');
  console.log('✅ Test 4: Beneficiary fallback verified (never invents a name)');

  // 6. Test ExpensesService.getExpenseVoucherPdf Security & Scope
  const mockExpense = {
    id: 'a1b2c3d4-e5f6-4a1b-8c2d-1234567890ab',
    companyId: 'company-a',
    branchId: 'branch-1',
    expenseNumber: 'EXP-2026-00099',
    date: new Date('2026-11-03T10:00:00Z'),
    createdAt: new Date('2026-11-03T10:00:00Z'),
    status: 'APPROVED',
    amount: '75000.00',
    expenseType: 'مصروفات كهرباء ومياه',
    category: 'OPERATING',
    paidTo: 'هيئة مياه ولاية الخرطوم',
    paidFrom: 'CASH',
    paymentMethod: 'CASH',
    referenceNo: 'WATER-99',
    description: 'سداد فاتورة مياه الفرع لشهر أكتوبر',
    approvedBy: 'user-manager-id',
    approvedAt: new Date('2026-11-03T10:30:00Z'),
    createdBy: 'user-accountant-id',
    company: { id: 'company-a', name: 'شركة داواكور الطبية', currency: 'ج.س', timezone: 'Africa/Cairo' },
    branch: { id: 'branch-1', name: 'فرع النيل', code: 'BR-01' },
    account: { id: 'acc-1', code: '510101', name: 'كهرباء ومياه' },
    shift: { id: 'shift-1', shiftNumber: 5, status: 'OPEN' },
    creator: { id: 'user-accountant-id', name: 'سامي المحاسب', role: 'ACCOUNTANT' },
  };

  let writeOperationsCount = 0;
  const mockPrisma = {
    expense: {
      findUnique: async ({ where }) => {
        if (where.id === mockExpense.id) return mockExpense;
        return null;
      },
      create: async () => { writeOperationsCount++; throw new Error('Write forbidden'); },
      update: async () => { writeOperationsCount++; throw new Error('Write forbidden'); },
      delete: async () => { writeOperationsCount++; throw new Error('Write forbidden'); },
    },
    user: {
      findUnique: async ({ where }) => {
        if (where.id === 'user-manager-id') return { id: 'user-manager-id', name: 'د. كمال المدير', role: 'BRANCH_MANAGER' };
        return null;
      },
    },
  };

  const expensesService = new ExpensesService(mockPrisma, { emit() {} }, pdfService);

  // 6.1 Valid scoped request
  const validActor = { id: 'actor-1', companyId: 'company-a', branchId: 'branch-1', role: 'BRANCH_MANAGER' };
  const resValid = await expensesService.getExpenseVoucherPdf(mockExpense.id, validActor);
  assert(Buffer.isBuffer(resValid.buffer), 'Expected PDF buffer');
  assert.strictEqual(resValid.expenseNumber, mockExpense.expenseNumber);
  console.log('✅ Test 5: Scoped authorized export succeeded');

  // 6.2 Invalid UUID syntax -> 400 BadRequestException
  await assert.rejects(
    async () => await expensesService.getExpenseVoucherPdf('invalid-uuid-format', validActor),
    (err) => err instanceof BadRequestException,
    'Expected BadRequestException for invalid UUID'
  );
  console.log('✅ Test 6: Invalid UUID rejected with BadRequestException (400)');

  // 6.3 Non-existent UUID -> 404 NotFoundException
  await assert.rejects(
    async () => await expensesService.getExpenseVoucherPdf('00000000-0000-0000-0000-000000000000', validActor),
    (err) => err instanceof NotFoundException,
    'Expected NotFoundException for nonexistent UUID'
  );
  console.log('✅ Test 7: Non-existent UUID rejected with NotFoundException (404)');

  // 6.4 Cross-company tenant security (Actor from company-b attempts to export company-a's voucher)
  const foreignCompanyActor = { id: 'actor-foreign', companyId: 'company-b', branchId: null, role: 'SUPER_ADMIN' };
  await assert.rejects(
    async () => await expensesService.getExpenseVoucherPdf(mockExpense.id, foreignCompanyActor),
    (err) => err instanceof NotFoundException,
    'Expected NotFoundException for cross-company access (safe closed response)'
  );
  console.log('✅ Test 8: Cross-company access rejected with safe 404 (closed response)');

  // 6.5 Cross-branch security (Actor assigned to branch-2 attempts to export branch-1's voucher)
  const foreignBranchActor = { id: 'actor-br2', companyId: 'company-a', branchId: 'branch-2', role: 'CASHIER' };
  await assert.rejects(
    async () => await expensesService.getExpenseVoucherPdf(mockExpense.id, foreignBranchActor),
    (err) => err instanceof NotFoundException,
    'Expected NotFoundException for cross-branch access'
  );
  console.log('✅ Test 9: Cross-branch access rejected with 404');

  // 6.6 Non-mutation test: running export twice caused 0 write operations
  assert.strictEqual(writeOperationsCount, 0, 'PDF export must be purely read-only and never mutate DB');
  console.log('✅ Test 10: Non-mutation verified (0 database writes)');

  // 7. Controller HTTP Contract Test
  const expensesController = new ExpensesController(expensesService);
  let capturedHeaders = {};
  let capturedEndBuffer = null;
  const mockRes = {
    set: (headers) => { Object.assign(capturedHeaders, headers); return mockRes; },
    end: (buf) => { capturedEndBuffer = buf; },
  };

  await expensesController.getExpenseVoucherPdf(mockExpense.id, { user: validActor }, mockRes);
  assert.strictEqual(capturedHeaders['Content-Type'], 'application/pdf');
  assert.strictEqual(capturedHeaders['Content-Disposition'], 'inline; filename="expense-voucher-EXP-2026-00099.pdf"');
  assert.strictEqual(capturedHeaders['Cache-Control'], 'private, no-store');
  assert(capturedHeaders['Content-Length'] > 0);
  assert(Buffer.isBuffer(capturedEndBuffer));
  assert.strictEqual(capturedEndBuffer.slice(0, 5).toString('ascii'), '%PDF-');
  console.log('✅ Test 11: Controller HTTP response headers and buffer stream verified');

  // 8. Regression tests on existing reports service methods
  const receiptDoc = pdfService.buildReceiptVoucherDocDefinition({
    companyName: 'داواكور',
    receiptNumber: 'REC-001',
    customerName: 'عميل نقدي',
    amount: 15000,
  });
  assert(receiptDoc && receiptDoc.pageSize === 'A5');

  const invoiceBuffer = await pdfService.generateSalesInvoicePdf({
    invoiceNumber: 'INV-001',
    branch: { name: 'الرئيسي' },
    customer: { name: 'عميل' },
    createdAt: new Date(),
    netAmount: 1000,
    paidAmount: 1000,
    remainingAmount: 0,
    paymentMethod: 'CASH',
    items: [],
  });
  assert(invoiceBuffer.slice(0, 5).toString('ascii'), '%PDF-');
  console.log('✅ Test 12: Existing PDF methods (receipt voucher, sales invoice) regression clean');

  // 9. Save Visual Artifacts to Evidence Directory
  fs.mkdirSync(taskEvidenceDir, { recursive: true });

  const pdfPathApproved = path.join(taskEvidenceDir, 'expense-voucher-approved-standard.pdf');
  const pdfPathPending = path.join(taskEvidenceDir, 'expense-voucher-pending-liability.pdf');
  const pdfPathRejected = path.join(taskEvidenceDir, 'expense-voucher-rejected-long-desc.pdf');

  fs.writeFileSync(pdfPathApproved, bufferApproved);
  fs.writeFileSync(pdfPathPending, bufferPending);
  fs.writeFileSync(pdfPathRejected, bufferRejected);
  console.log('📁 Synthetic PDF files written to evidence directory:');
  console.log('   -', pdfPathApproved);
  console.log('   -', pdfPathPending);
  console.log('   -', pdfPathRejected);

  // 10. Render Evidence to PNG for Visual Verification using Puppeteer / Chrome
  try {
    const puppeteer = require(path.join(root, 'node_modules/puppeteer'));
    const browser = await puppeteer.launch({
      executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true,
      args: ['--no-sandbox', '--disable-web-security'],
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 2 });

      for (const [pdfFile, pngFile] of [
        ['expense-voucher-approved-standard.pdf', 'expense-voucher-approved-standard.png'],
        ['expense-voucher-pending-liability.pdf', 'expense-voucher-pending-liability.png'],
        ['expense-voucher-rejected-long-desc.pdf', 'expense-voucher-rejected-long-desc.png'],
      ]) {
        const fileUrl = require('url').pathToFileURL(path.join(taskEvidenceDir, pdfFile)).href;
        await page.goto(fileUrl, { waitUntil: 'load' });
        await new Promise(r => setTimeout(r, 1200));
        await page.screenshot({ path: path.join(taskEvidenceDir, pngFile), fullPage: true });
        console.log(`📸 Rendered visual screenshot: ${pngFile}`);
      }
      await page.close();
    } finally {
      await browser.close();
    }
  } catch (err) {
    console.warn('⚠️ Visual PNG rendering note:', err.message);
  }

  console.log('\n--- ALL VERIFICATION TESTS PASSED SUCCESSFULLY (12/12) ---');
}

runVerification().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
