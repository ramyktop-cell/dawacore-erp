import { ReportMeta } from 'src/shared/report-kit';

/**
 * تصنيفات الصنف حسب سرعة الحركة.
 *  - FAST_MOVING  : بيع خلال 30 يوماً
 *  - NORMAL       : بيع خلال 31-60 يوماً
 *  - SLOW_MOVING  : بيع خلال 61-90 يوماً
 *  - STAGNANT     : أكثر من 90 يوماً دون بيع، ولديه رصيد
 *  - NO_STOCK     : رصيد = 0
 */
export type StockClassification =
  | 'FAST_MOVING'
  | 'NORMAL'
  | 'SLOW_MOVING'
  | 'STAGNANT'
  | 'NO_STOCK';

/**
 * ترجمات وألوان التصنيف للعرض وواجهات المستخدم
 */
export const STOCK_CLASSIFICATION_LABELS: Record<StockClassification, string> = {
  FAST_MOVING: 'سريع الحركة',
  NORMAL: 'طبيعي',
  SLOW_MOVING: 'بطيء الحركة',
  STAGNANT: 'راكد',
  NO_STOCK: 'نافد',
};

/**
 * StockMovementItem
 * ─────────────────
 * صف واحد لكل صنف دواء.
 */
export interface StockMovementItem {
  // ─── هوية الصنف
  medicineId: string;
  code: string;
  tradeName: string;
  scientificName: string;
  barcode: string;
  category: string;

  // ─── الحالة الحالية
  /** الرصيد الحالي (مجموع quantityInBase لكل الدفعات النشطة) */
  currentStock: number;

  /** عدد الدفعات التي فيها رصيد > 0 */
  batchesCount: number;

  /** حد المخزون الأدنى (من Medicine.minStockLevel) */
  minStockLevel: number;

  /** هل الرصيد الحالي أقل من الحد الأدنى؟ */
  isBelowMinStock: boolean;

  /** متوسط تكلفة الوحدة المرجّح = stockValue / currentStock */
  avgCost: number;

  /** قيمة المخزون = مجموع (quantityInBase × costPrice) */
  stockValue: number;

  /** تاريخ أقرب دفعة منتهية الصلاحية (ISO) */
  nearestExpiry?: string | null;

  // ─── الحركة خلال الفترة
  /** إجمالي الكميات الداخلة (PURCHASE + TRANSFER_IN + INVENTORY_ADJUSTMENT موجب + SALE_RETURN + PURCHASE_RETURN موجب) */
  totalIn: number;

  /** إجمالي الكميات الخارجة (قيمة مطلقة) */
  totalOut: number;

  /** صافي الحركة = totalIn - totalOut */
  netMovement: number;

  // ─── المبيعات خلال الفترة
  /** إجمالي الكمية المباعة (بالوحدة الأساسية) */
  quantitySold: number;

  /** إجمالي الكمية المرتجعة */
  quantityReturned: number;

  /** الصافي المباع = quantitySold - quantityReturned */
  netSold: number;

  /** إجمالي إيرادات البيع (قبل المرتجعات) */
  salesRevenue: number;

  // ─── مؤشرات مشتقة
  /** معدل الدوران = netSold / currentStock (أعلى = أسرع حركة) */
  turnoverRatio: number;

  /** أيام التغطية = currentStock / (netSold / periodDays) */
  coverageDays: number;

  /** عدد الأيام منذ آخر بيع (null = لم يُبع قط) */
  daysSinceLastSale: number | null;

  /** تاريخ آخر بيع (ISO) */
  lastSaleAt: string | null;

  /** تاريخ آخر حركة مخزون (ISO) */
  lastMovementAt: string | null;

  // ─── التصنيف
  classification: StockClassification;

  /** الاسم المعروض بالعربية للتصنيف */
  classificationLabel: string;
}

/**
 * StockClassificationBreakdown
 * ────────────────────────────
 * تفصيل تصنيف واحد.
 */
export interface StockClassificationBreakdown {
  classification: StockClassification;
  label: string;
  itemsCount: number;
  stockValue: number;
  percentage: number; // من إجمالي stockValue
}

/**
 * StockMovementSummary
 * ────────────────────
 * الملخص التنفيذي.
 */
export interface StockMovementSummary {
  // ─── الإحصاءات العامة
  totalItems: number;
  itemsWithStock: number;
  itemsBelowMinStock: number;

  // ─── قيمة المخزون
  totalStockValue: number;
  totalQuantityOnHand: number;
  totalStockValueStagnant: number;
  stagnantValuePercentage: number;

  // ─── المبيعات خلال الفترة
  totalQuantitySold: number;
  totalSalesRevenue: number;

  // ─── المؤشرات
  avgTurnoverRatio: number;
  avgCoverageDays: number;

  // ─── تفصيل التصنيفات
  classificationBreakdown: StockClassificationBreakdown[];
}

/**
 * StockMovementResponse
 * ─────────────────────
 * الشكل الكامل لاستجابة التقرير.
 */
export interface StockMovementResponse {
  meta: ReportMeta;
  summary: StockMovementSummary;
  items: StockMovementItem[];
}
