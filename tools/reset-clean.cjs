const path = require('path');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

const candidateTables = [
  'SaleReturnItem',
  'SaleReturn',
  'SalePayment',
  'SaleItem',
  'Sale',
  'SaleInvoiceItem',
  'SalesInvoice',
  'HeldCart',
  'PurchaseReturnItem',
  'PurchaseReturn',
  'PurchaseItem',
  'PurchaseOrder',
  'SupplierPaymentAllocation',
  'SupplierPayment',
  'StockCountItem',
  'StockCount',
  'InventoryTransaction',
  'Batch',
  'MedicineUnit',
  'Medicine',
  'CashMovement',
  'Expense',
  'Receipt',
  'Shift',
  'CustomerTransaction',
  'Customer',
  'Supplier',
  'OpeningBalanceItem',
  'OpeningBalance',
  'JournalLine',
  'JournalEntry',
  'AccountingOutbox',
  'DocumentSequence',
  'AuditLog',
];

async function main() {
  console.log('========================================================');
  console.log('  DawaCore - Zeroing All Items, Stock & Transactions    ');
  console.log('========================================================');

  // Discover existing tables dynamically to prevent 42P01 errors
  const existingTablesRes = await prisma.$queryRawUnsafe(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public';
  `);
  const existingSet = new Set(existingTablesRes.map((r) => r.table_name));
  const tablesToTruncate = candidateTables.filter((t) => existingSet.has(t));

  if (tablesToTruncate.length === 0) {
    console.log('[WARN] No target tables found to truncate.');
    return;
  }

  const truncateSql = `TRUNCATE TABLE ${tablesToTruncate.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE;`;

  await prisma.$transaction([
    prisma.$executeRawUnsafe(truncateSql),
    prisma.$executeRawUnsafe(`UPDATE "Account" SET "balance" = 0;`),
    prisma.$executeRawUnsafe(`UPDATE "FiscalYear" SET "openingEntryId" = NULL, "closingEntryId" = NULL, "status" = 'OPEN';`),
  ]);

  console.log(`[OK] Successfully cleaned ${tablesToTruncate.length} tables:`);
  console.log('     - All medicines, batches, units and inventory transactions.');
  console.log('     - All sales, held carts, payments, and sales returns.');
  console.log('     - All purchases, purchase items, and purchase returns.');
  console.log('     - All shifts, cash movements, expenses, and receipts.');
  console.log('     - All customer/supplier transaction history.');
  console.log('     - All journal entries, lines, and opening balances.');
  console.log('[OK] All financial accounts balance reset to 0.00.');
  console.log('[OK] Fiscal years reset to OPEN.');
  console.log('[OK] Company, Branches, Users, and Chart of Accounts are preserved!');
}

main()
  .catch((err) => {
    console.error('[ERROR] Failed to reset data:', err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
