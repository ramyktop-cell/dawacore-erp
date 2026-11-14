import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, PrismaClient, AccountType, PaymentMethod, Role, UnitType } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { StockReservationService } from '../src/inventory/stock-reservation.service';
import { SalesService } from '../src/sales/sales.service';
import { ShiftsService } from '../src/shifts/shifts.service';
import { ExpensesService } from '../src/expenses/expenses.service';
import { PurchasingService } from '../src/purchasing/purchasing.service';
import { AccountingService } from '../src/accounting/accounting.service';
import { AccountingEventListener } from '../src/accounting/accounting.listener';
import { OutboxProcessorService } from '../src/accounting/outbox.processor.service';

const dbUrl = process.env.ACCEPTANCE_DATABASE_URL || process.env.DATABASE_URL;
if (!dbUrl || !dbUrl.includes('acceptance_test')) throw new Error('يجب تشغيل الاختبار على قاعدة acceptance_test فقط');
process.env.DATABASE_URL = dbUrl;

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const events = new EventEmitter2();
  const stock = new StockReservationService(prisma);
  const sales = new SalesService(prisma, stock, events);
  const shifts = new ShiftsService(prisma, events);
  const expenses = new ExpensesService(prisma, events);
  const purchasing = new PurchasingService(prisma, events);
  const accounting = new AccountingService(prisma);
  const accountingListener = new AccountingEventListener(accounting, prisma);
  const outbox = new OutboxProcessorService(prisma, accounting, accountingListener);

  const company = await prisma.company.create({ data: { name: `Acceptance ${Date.now()}`, currency: 'SDG' } });
  const branch = await prisma.branch.create({ data: { companyId: company.id, name: 'Acceptance Branch', code: `ACC-${Date.now()}` } });
  const user = await prisma.user.create({
    data: { username: `acceptance-${Date.now()}`, name: 'Acceptance Manager', passwordHash: 'acceptance-only', role: Role.COMPANY_ADMIN, companyId: company.id, branchId: branch.id },
  });
  const actor = { id: user.id, companyId: company.id, branchId: branch.id, role: Role.COMPANY_ADMIN, roles: [Role.COMPANY_ADMIN] } as any;

  await prisma.account.createMany({ data: [
    { companyId: company.id, branchId: branch.id, code: '1101', name: 'Acceptance Cash', type: AccountType.ASSET, level: 5, isLeaf: true },
    { companyId: company.id, branchId: branch.id, code: '1104', name: 'Acceptance Inventory', type: AccountType.ASSET, level: 5, isLeaf: true },
    { companyId: company.id, branchId: branch.id, code: '2101', name: 'Acceptance Supplier Payable', type: AccountType.LIABILITY, level: 5, isLeaf: true },
    { companyId: company.id, branchId: branch.id, code: '4101', name: 'Acceptance Sales', type: AccountType.REVENUE, level: 5, isLeaf: true },
    { companyId: company.id, branchId: branch.id, code: '5101', name: 'Acceptance COGS', type: AccountType.EXPENSE, level: 5, isLeaf: true },
    { companyId: company.id, branchId: branch.id, code: '5204', name: 'Acceptance Freight Expense', type: AccountType.EXPENSE, level: 5, isLeaf: true },
  ] });

  const shift = await shifts.openShift({ branchId: branch.id, userId: user.id, openingBalance: 1000 }, actor);
  if (shift.status !== 'OPEN') throw new Error('فتح الوردية فشل');

  const medicine = await prisma.medicine.create({ data: { code: `ACC-M-${Date.now()}`, barcode: `ACC-B-${Date.now()}`, scientificName: 'Acceptance Medicine', tradeName: 'Acceptance Medicine', category: 'Acceptance' } });
  await prisma.medicineUnit.create({ data: { medicineId: medicine.id, unitType: UnitType.UNIT, multiplier: 1, price: 100, isDefault: true } });
  const batch = await prisma.batch.create({ data: { medicineId: medicine.id, branchId: branch.id, batchNumber: `ACC-BATCH-${Date.now()}`, costPrice: 50, salePrice: 100, expiryDate: new Date(Date.now() + 86400000 * 365), quantityInBase: 20, quantity: 20 } });

  const sale = await sales.createSale({
    branchId: branch.id,
    cashierId: user.id,
    shiftId: shift.id,
    items: [{ medicineId: medicine.id, unitType: UnitType.UNIT, quantity: 2, unitPrice: 100 }],
    payments: [{ method: PaymentMethod.CASH, amount: 200 }],
    discountTotal: 0,
  } as any, actor);
  await outbox.processOutbox();
  const saleEntry = await prisma.journalEntry.findFirst({ where: { companyId: company.id, source: 'SALE', referenceId: sale.data.invoiceNumber }, include: { lines: { include: { account: true } } } });
  if (!saleEntry) throw new Error('لم يتم إنشاء قيد مبيعات محاسبي');
  const cogsLine = saleEntry.lines.find((line) => line.account.code === '5101');
  const inventoryLine = saleEntry.lines.find((line) => line.account.code === '1104');
  if (!cogsLine || Number(cogsLine.debit) !== 100 || !inventoryLine || Number(inventoryLine.credit) !== 100) throw new Error('قيد COGS أو المخزون غير صحيح');
  await outbox.processOutbox();
  if (await prisma.journalEntry.count({ where: { companyId: company.id, source: 'SALE', referenceId: sale.data.invoiceNumber } }) !== 1) throw new Error('قيد COGS تكرر عند إعادة معالجة Outbox');
  const afterSale = await prisma.shift.findUniqueOrThrow({ where: { id: shift.id } });
  if (Number(afterSale.expectedCash) !== 1200) throw new Error(`النقد المتوقع بعد البيع غير صحيح: ${afterSale.expectedCash}`);

  const account = await prisma.account.create({ data: { companyId: company.id, branchId: branch.id, code: `6-ACC-${Date.now()}`, name: 'Acceptance Expense', type: AccountType.EXPENSE, level: 5, isLeaf: true } });
  const expense = await expenses.createExpense({ companyId: company.id, branchId: branch.id, shiftId: shift.id, expenseType: 'Acceptance test expense', accountId: account.id, amount: 100, paidFrom: 'CASH', paymentMethod: 'CASH', description: 'Acceptance flow' } as any, actor);
  const afterExpense = await prisma.shift.findUniqueOrThrow({ where: { id: shift.id } });
  if (Number(afterExpense.expectedCash) !== 1100 || expense.status !== 'APPROVED') throw new Error('مسار المصروف لم يخصم النقد أو يعتمد السند');
  let insufficientRejected = false;
  try { await expenses.createExpense({ companyId: company.id, branchId: branch.id, shiftId: shift.id, expenseType: 'Too large', accountId: account.id, amount: 5000, paidFrom: 'CASH', paymentMethod: 'CASH' } as any, actor); } catch { insufficientRejected = true; }
  if (!insufficientRejected) throw new Error('المصروف الأكبر من الرصيد لم يُرفض');

  const supplier = await prisma.supplier.create({ data: { companyId: company.id, branchId: branch.id, name: 'Acceptance Supplier', phone: '0000000000' } });
  const purchase = await purchasing.create({ companyId: company.id, branchId: branch.id, supplierId: supplier.id, invoiceNumber: `ACC-INV-${Date.now()}`, paidAmount: 0, additionalExpenses: 50, expenseAllocationMethod: 'LANDED_COST', expenseNotes: 'Acceptance freight', items: [{ medicineId: medicine.id, batchNumber: `ACC-PURCHASE-${Date.now()}`, expiryDate: new Date(Date.now() + 86400000 * 365).toISOString(), quantity: 5, costPrice: 40, sellingPrice: 60 }] } as any, user.id, actor);
  const received = await purchasing.receiveOrder(purchase.id, user.id, actor);
  if (received.status !== 'RECEIVED' || !received.receivedAt) throw new Error('استلام أمر الشراء لم يكتمل');
  const purchaseBatch = await prisma.batch.findFirst({ where: { branchId: branch.id, medicineId: medicine.id, batchNumber: received.items[0].batchNumber } });
  if (!purchaseBatch || purchaseBatch.quantityInBase !== 5 || Number(purchaseBatch.costPrice) !== 50) throw new Error('التكلفة المنزلة أو كمية الشراء غير صحيحة');
  await accountingListener.handlePurchaseReceived({ purchaseOrderId: received.id, orderNumber: received.orderNumber, companyId: company.id, branchId: branch.id, supplierId: supplier.id, totalCost: Number(received.totalAmount), paidAmount: Number(received.paidAmount), remainingDebt: Number(received.totalAmount) - Number(received.paidAmount), additionalExpenses: 50, expenseAllocationMethod: 'LANDED_COST', expenseNotes: 'Acceptance freight', createdBy: user.id });
  const purchaseEntry = await prisma.journalEntry.findFirst({ where: { companyId: company.id, source: 'PURCHASE', referenceId: received.id }, include: { lines: { include: { account: true } } } });
  const purchaseInventoryDebit = purchaseEntry?.lines.filter((line) => line.account.code === '1104').reduce((sum, line) => sum + Number(line.debit), 0) || 0;
  if (!purchaseEntry || purchaseInventoryDebit !== 250) throw new Error('قيد التكلفة المنزلة للمشتريات غير صحيح');
  const purchase2 = await purchasing.create({ companyId: company.id, branchId: branch.id, supplierId: supplier.id, invoiceNumber: `ACC-INV-PERIOD-${Date.now()}`, paidAmount: 0, additionalExpenses: 50, expenseAllocationMethod: 'PERIOD_EXPENSE', expenseNotes: 'Acceptance period freight', items: [{ medicineId: medicine.id, batchNumber: `ACC-PERIOD-${Date.now()}`, expiryDate: new Date(Date.now() + 86400000 * 365).toISOString(), quantity: 5, costPrice: 40, sellingPrice: 60 }] } as any, user.id, actor);
  const received2 = await purchasing.receiveOrder(purchase2.id, user.id, actor);
  const purchaseBatch2 = await prisma.batch.findFirst({ where: { branchId: branch.id, medicineId: medicine.id, batchNumber: received2.items[0].batchNumber } });
  if (!purchaseBatch2 || Number(purchaseBatch2.costPrice) !== 40) throw new Error('التكلفة الدورية غيّرت تكلفة المخزون');
  await accountingListener.handlePurchaseReceived({ purchaseOrderId: received2.id, orderNumber: received2.orderNumber, companyId: company.id, branchId: branch.id, supplierId: supplier.id, totalCost: Number(received2.totalAmount), paidAmount: Number(received2.paidAmount), remainingDebt: Number(received2.totalAmount) - Number(received2.paidAmount), additionalExpenses: 50, expenseAllocationMethod: 'PERIOD_EXPENSE', expenseNotes: 'Acceptance period freight', createdBy: user.id });
  const purchaseEntry2 = await prisma.journalEntry.findFirst({ where: { companyId: company.id, source: 'PURCHASE', referenceId: received2.id }, include: { lines: { include: { account: true } } } });
  const purchaseInventoryDebit2 = purchaseEntry2?.lines.filter((line) => line.account.code === '1104').reduce((sum, line) => sum + Number(line.debit), 0) || 0;
  const periodExpenseDebit = purchaseEntry2?.lines.filter((line) => line.account.code === '5204').reduce((sum, line) => sum + Number(line.debit), 0) || 0;
  if (!purchaseEntry2 || purchaseInventoryDebit2 !== 200 || periodExpenseDebit !== 50) throw new Error('قيد المصروف الدوري للمشتريات غير صحيح');

  const closed = await shifts.closeShift(shift.id, { actualCash: 1100, notes: 'Acceptance close' }, actor);
  if (closed.status !== 'CLOSED' || Number(closed.cashDifference) !== 0) throw new Error('إغلاق الوردية أو حساب الفرق فشل');
  let doubleCloseRejected = false;
  try { await shifts.closeShift(shift.id, { actualCash: 1100 }, actor); } catch { doubleCloseRejected = true; }
  if (!doubleCloseRejected) throw new Error('الإغلاق المزدوج لم يُرفض');

  const finalBatch = await prisma.batch.findUniqueOrThrow({ where: { id: batch.id } });
  console.log(JSON.stringify({ ok: true, sale: sale.data.invoiceNumber, cogs: Number(cogsLine.debit), inventoryCredit: Number(inventoryLine.credit), expense: expense.expenseNumber, purchase: received.orderNumber, landedCostPerUnit: Number(purchaseBatch.costPrice), purchaseInventoryDebit, periodInventoryDebit: purchaseInventoryDebit2, periodExpenseDebit, soldRemaining: finalBatch.quantityInBase, receivedQuantity: purchaseBatch.quantityInBase, shiftStatus: closed.status, expectedCash: closed.expectedCash.toString() }));
  await prisma.$disconnect();
}

main().catch(async (error) => { console.error(`[FAIL] ${error.message}`); process.exitCode = 1; });
