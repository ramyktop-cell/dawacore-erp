/**
 * Journal Links Utility
 * ─────────────────────
 * يُحوّل (source, referenceId) إلى رابط قابل للنقر.
 *
 * الاستراتيجية: استخدام Query Parameter لفتح modal موجود.
 */

export interface SourceLink {
  href: string;
  label: string;
  icon: string;
  /** الصلاحية المطلوبة لعرض الرابط */
  permission?: string;
}

/**
 * خريطة المصادر → مُنشئ الرابط
 */
const SOURCE_LINK_BUILDERS: Record<
  string,
  (referenceId: string) => SourceLink
> = {
  SALE: (id) => ({
    href: `/sales/invoices?openInvoice=${encodeURIComponent(id)}`,
    label: 'عرض الفاتورة',
    icon: '🧾',
    permission: 'sales.view',
  }),

  SALE_RETURN: (id) => ({
    href: `/returns?saleId=${encodeURIComponent(id)}`,
    label: 'عرض المرتجع',
    icon: '↩️',
    permission: 'returns.view',
  }),

  PURCHASE: (id) => ({
    href: `/purchasing/orders?openOrder=${encodeURIComponent(id)}`,
    label: 'عرض أمر الشراء',
    icon: '📦',
    permission: 'purchasing.view',
  }),

  EXPENSE: (id) => ({
    href: `/expenses?openExpense=${encodeURIComponent(id)}`,
    label: 'عرض سند الصرف',
    icon: '💸',
    permission: 'expenses.view',
  }),

  SHIFT_DIFFERENCE: (id) => ({
    href: `/shifts?openShift=${encodeURIComponent(id)}`,
    label: 'عرض الوردية',
    icon: '💰',
    permission: 'shifts.view',
  }),

  STOCK_COUNT: (id) => ({
    href: `/stock-count?openCount=${encodeURIComponent(id)}`,
    label: 'عرض الجرد',
    icon: '📋',
    permission: 'inventory.view',
  }),

  RECEIPT_VOUCHER: (id) => ({
    href: `/customers/receipts/${encodeURIComponent(id)}`,
    label: 'عرض سند القبض',
    icon: '🧾',
    permission: 'customers.view',
  }),
};

/**
 * يُرجع رابط المصدر إن وُجد، أو null.
 */
export function getSourceLink(
  source: string,
  referenceId: string | null | undefined,
): SourceLink | null {
  if (!referenceId) return null;

  const builder = SOURCE_LINK_BUILDERS[source];
  if (!builder) return null;

  return builder(referenceId);
}
