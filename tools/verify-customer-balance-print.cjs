'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const root = path.resolve(__dirname, '..');
const { Prisma } = require(path.join(root, 'node_modules/@prisma/client'));
const { SalesInvoicesService } = require(path.join(root, 'dist/sales/sales-invoices.service'));
const { CustomersService } = require(path.join(root, 'dist/customers/customers.service'));
const actor = { id: 'user', role: 'COMPANY_ADMIN', companyId: 'company', branchId: 'branch' };
const D = value => new Prisma.Decimal(value);
const movement = { id: 'movement', amount: D(60000), balanceAfter: D(260000) };
const invoice = { id: 'invoice', invoiceNumber: 'INV-TEST', customerId: 'customer', remainingAmount: D(60000) };
const test = async () => {
  const { SalesService } = require(path.join(root, 'dist/sales/sales.service'));
  const posTx = {
    branch: { findFirst: async () => ({ id: 'branch', companyId: 'company' }) },
    shift: { findFirst: async () => ({ id: 'shift', status: 'OPEN', companyId: 'company', branchId: 'branch', userId: 'user' }), update: async () => ({}) },
    customer: { findFirst: async () => ({ id: 'customer' }), findUnique: async () => ({ currentDebt: D(200000), creditLimit: D(999999) }), update: async () => ({}) },
    customerTransaction: { create: async () => ({}) },
    documentSequence: { upsert: async () => ({ lastValue: 1 }) },
    medicineUnit: { findMany: async () => [{ medicineId: 'medicine', unitType: 'UNIT', multiplier: 1, medicine: { isWeighed: false } }] },
    sale: { create: async args => ({ ...args.data, id: 'sale', items: args.data.items.createMany.data, createdAt: new Date() }) },
  };
  const pos = new SalesService({ $transaction: async cb => cb(posTx) }, { executeReservationWithLock: async () => ({ allocations: [{ batchId: 'batch', deductedBaseQty: 1, unitCost: '1' }] }) }, { emit() {} });
  const posResult = await pos.createSale({ branchId: 'branch', customerId: 'customer', items: [{ medicineId: 'medicine', unitType: 'UNIT', quantity: 1, unitPrice: '100000' }], payments: [{ method: 'CREDIT', amount: '100000' }] }, actor);
  assert.deepStrictEqual(posResult.data.customerBalance, { previousDebt: '200000.00', creditAmount: '100000.00', debtAfter: '300000.00' });
  let linked;
  const tx = {
    $queryRaw: async () => [],
    branch: { findFirst: async () => ({ id: 'branch', companyId: 'company' }) },
    shift: { findFirst: async () => ({ id: 'shift', userId: 'user', companyId: 'company', branchId: 'branch', status: 'OPEN' }), update: async () => ({}) },
    customer: { findFirst: async () => ({ id: 'customer', currentDebt: D(200000), creditLimit: D(999999) }), update: async () => ({}) },
    batch: { findFirst: async () => ({ id: 'batch', quantityInBase: 2, salePrice: D(100000), costPrice: D(1), expiryDate: new Date('2099-01-01') }), updateMany: async () => ({ count: 1 }) },
    medicine: { findUnique: async () => ({ isWeighed: false }) },
    inventoryTransaction: { create: async () => ({ id: 'inventory' }), updateMany: async () => ({ count: 1 }) },
    customerTransaction: { create: async () => movement, update: async args => { linked = args; } },
    salesInvoice: { count: async () => 0, create: async args => ({ ...args.data, id: 'invoice', items: [] }) },
  };
  const service = new SalesInvoicesService({ $transaction: async cb => cb(tx) }, { emit() {} });
  const created = await service.createInvoice({ companyId: 'company', branchId: 'branch', shiftId: 'shift', customerId: 'customer', paidAmount: 40000, paymentMethod: 'CASH', items: [{ medicineId: 'medicine', batchId: 'batch', quantity: 1, unitPrice: 100000 }] }, actor);
  assert.deepStrictEqual(created.customerBalance, { previousDebt: '200000.00', creditAmount: '60000.00', debtAfter: '260000.00' });
  assert.strictEqual(linked.data.referenceId, created.invoiceNumber);
  const originalCustomer = tx.customer.findFirst;
  tx.customer.findFirst = async () => null;
  await assert.rejects(() => service.createInvoice({ companyId: 'company', branchId: 'branch', shiftId: 'shift', customerId: 'foreign', items: [{ medicineId: 'medicine', batchId: 'batch', quantity: 1, unitPrice: 100000 }] }, actor));
  tx.customer.findFirst = originalCustomer;
  const readService = new SalesInvoicesService({ salesInvoice: { findFirst: async () => ({ ...invoice, customer: { currentDebt: 9999999 } }) }, customerTransaction: { findMany: async () => [movement] } }, {});
  assert.deepStrictEqual((await readService.findOne('invoice', actor)).customerBalance, created.customerBalance);
  readService.prisma.customerTransaction.findMany = async () => [];
  assert.strictEqual((await readService.findOne('invoice', actor)).customerBalance, null);
  const posReader = new SalesInvoicesService({ salesInvoice: { findFirst: async () => null }, sale: { findFirst: async query => { assert.strictEqual(query.where.AND[0].branch.companyId, 'company'); return { id: 'pos', invoiceNumber: 'INV-POS', branchId: 'branch', customerId: 'customer', branch: { companyId: 'company' }, subTotal: D(100000), grandTotal: D(100000), paidAmount: D(0), payments: [{ method: 'CREDIT', amount: D(100000) }], items: [] }; } }, customerTransaction: { findMany: async () => [{ amount: D(100000), balanceAfter: D(300000) }] } }, {});
  assert.strictEqual((await posReader.findOne('pos', actor)).customerBalance.previousDebt, '200000.00');
  for (const amount of [100000, -100000]) {
    const receipts = new CustomersService({ customerTransaction: { findFirst: async () => ({ id: 'receipt', amount: D(amount), balanceAfter: D(200000), customer: { id: 'customer', companyId: 'company', branchId: 'branch' } }) } }, {});
    const voucher = await receipts.getReceiptVoucher('REC-TEST', actor);
    assert.strictEqual(voucher.previousDebt, '300000.00');
    assert.strictEqual(voucher.amount, '100000.00');
  }
  const ts = require(path.join(root, 'node_modules/typescript'));
  const printerFile = path.join(root, 'frontend/src/services/printer.service.ts');
  const compiled = ts.transpileModule(fs.readFileSync(printerFile, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = new Module(printerFile, module); mod.filename = printerFile; mod.paths = module.paths; mod._compile(compiled, printerFile);
  const printer = mod.exports.ThermalPrinterService;
  const artifacts = path.join(root, 'workflow-history/20261102-customer-balance-print/evidence'); fs.mkdirSync(artifacts, { recursive: true });
  const payload = { branchName: 'فرع اختبار', invoiceNumber: 'INV-TEST', customerName: '<script>alert(1)</script>', grandTotal: 100000, paidAmount: 0, changeAmount: 0, remainingDebt: 100000, showCustomerBalance: true, customerBalance: { previousDebt: '200000.00', creditAmount: '100000.00', debtAfter: '300000.00' }, items: [] };
  for (const width of ['58mm', '80mm']) {
    const html = printer.buildReceiptHtml({ ...payload, paperWidth: width });
    assert(html.includes('300,000.00')); assert(html.includes('متبقي هذه الفاتورة')); assert(!html.includes('<script>alert(1)</script>'));
    fs.writeFileSync(path.join(artifacts, `invoice-${width}.html`), html);
  }
  assert(!printer.buildReceiptHtml({ ...payload, showCustomerBalance: false }).includes('رصيد العميل وقت الفاتورة'));
  assert(printer.buildReceiptHtml({ ...payload, customerBalance: null }).includes('الرصيد وقت المستند غير متاح'));
  const receiptHtml = printer.buildCustomerPaymentHtml({ customerName: '<img src=x>', receiptNumber: 'REC-TEST', previousDebt: 300000, amount: 300000, remainingDebt: 0 });
  assert(receiptHtml.includes('0.00')); assert(!receiptHtml.includes('<img src=x>')); fs.writeFileSync(path.join(artifacts, 'payment.html'), receiptHtml);
  let raw;
  global.window = { qz: { websocket: { isActive: () => true }, configs: { create: () => ({}) }, print: async (config, data) => { raw = data.join(''); } } };
  await printer.printInvoice(payload); assert(raw.includes('Balance after sale: 300000.00'));
  const { PdfExportService } = require(path.join(root, 'dist/modules/accounting/reports/services/pdf-export.service'));
  const pdf = new PdfExportService();
  const definition = pdf.buildReceiptVoucherDocDefinition({ customerName: 'عميل اختبار', previousDebt: 300000, remainingDebt: 0, amount: 300000, receiptNumber: 'REC-TEST' });
  assert(JSON.stringify(definition).includes('300,000')); assert(JSON.stringify(definition).includes('0.00') || JSON.stringify(definition).includes('0'));
  if (process.env.PRINT_VISUAL_CHECK === '1') {
    const puppeteer = require(path.join(root, 'node_modules/puppeteer'));
    const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
    try {
      const page = await browser.newPage();
      for (const [name, width] of [['invoice-58mm', 220], ['invoice-80mm', 303], ['payment', 303]]) {
        await page.setViewport({ width, height: 900 });
        await page.bringToFront();
        await page.goto(require('url').pathToFileURL(path.join(artifacts, name + '.html')).href, { waitUntil: 'load' });
        await page.evaluate(() => document.fonts.ready);
        assert(await page.evaluate(() => document.body.innerText.length > 20));
        await new Promise(resolve => setTimeout(resolve, 200));
        await page.screenshot({ path: path.join(artifacts, name + '.png'), fullPage: true });
      }
      await page.close();
    } finally { await browser.close(); }
  }
  console.log('PASS: partial credit, document linkage, historical reprint, POS lookup scope, receipt signs, zero, HTML escaping, both paper sizes, QZ and PDF fields');
};
test().catch(error => { console.error(error); process.exitCode = 1; });
