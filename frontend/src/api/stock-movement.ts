import axios from 'axios';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type MovementClass = 'fast' | 'normal' | 'slow' | 'dead' | 'no-stock';

export interface StockMovementItem {
  medicineId: string;
  medicineCode: string;
  tradeName: string;
  scientificName: string;
  category: string;
  supplierName?: string;
  currentStock: number;
  batchesCount: number;
  nearestExpiryDate?: string;
  stockValue: number;
  totalSoldBaseQty: number;
  totalSalesValue: number;
  salesTransactionsCount: number;
  dailyConsumption: number;
  daysOfCover: number;
  turnoverRatio: number;
  lastSaleDate?: string;
  daysSinceLastSale: number;
  movementClass: MovementClass;
  movementLabel: string;
  movementColor: string;
  cogs: number;
  potentialWasteValue: number;
}

export interface MovementSummary {
  totalMedicines: number;
  fastMovingCount: number;
  normalMovingCount: number;
  slowMovingCount: number;
  deadStockCount: number;
  noStockCount: number;
  totalStockValue: number;
  totalCogs: number;
  potentialWasteValue: number;
  avgTurnoverRatio: number;
}

export interface TopMoverItem {
  medicineId: string;
  tradeName: string;
  totalSoldBaseQty: number;
  totalSalesValue: number;
  dailyConsumption: number;
}

export interface StockMovementResponse {
  meta: {
    title: string;
    companyName: string;
    branchName?: string;
    fromDate: string;
    toDate: string;
    periodDays: number;
    generatedAt: string;
    generatedBy: { id: string; name: string };
  };
  summary: MovementSummary;
  topMovers: TopMoverItem[];
  slowMovers: StockMovementItem[];
  items: StockMovementItem[];
}

export interface StockMovementFilterParams {
  branchId?: string;
  fromDate?: string;
  toDate?: string;
  movementClass?: 'all' | 'fast' | 'normal' | 'slow' | 'dead';
  fastThreshold?: number;
  normalThreshold?: number;
  slowThreshold?: number;
  category?: string;
  supplierId?: string;
  medicineId?: string;
  hideZeroStock?: string;
  sortBy?: string;
}

// ═══════════════════════════════════════════════════════════════
// Adapter: Classification Mapping
// ═══════════════════════════════════════════════════════════════

const CLASS_TO_FRONTEND: Record<string, { cls: MovementClass; color: string }> = {
  FAST_MOVING: { cls: 'fast', color: 'text-emerald-600' },
  NORMAL: { cls: 'normal', color: 'text-blue-600' },
  SLOW_MOVING: { cls: 'slow', color: 'text-yellow-600' },
  STAGNANT: { cls: 'dead', color: 'text-red-600' },
  NO_STOCK: { cls: 'no-stock', color: 'text-gray-400' },
};

// ═══════════════════════════════════════════════════════════════
// Adapter: ReportKit Response → Frontend Legacy Shape
// ═══════════════════════════════════════════════════════════════

const BASE = '/api/reports/stock-movement';

function adaptStockMovement(apiRes: any): StockMovementResponse {
  const summary = apiRes.summary || {};
  const meta = apiRes.meta || {};
  const rawItems: any[] = apiRes.items || [];

  // حساب periodDays من التواريخ
  const fromDate = new Date(meta.fromDate || Date.now());
  const toDate = new Date(meta.toDate || Date.now());
  const periodDays = Math.max(
    1,
    Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)),
  );

  // تحويل classificationBreakdown إلى عدادات
  const breakdown: any[] = summary.classificationBreakdown || [];
  const findCount = (key: string) =>
    Number(breakdown.find((b) => b.classification === key)?.itemsCount ?? 0);

  // تحويل كل item
  const items: StockMovementItem[] = rawItems.map((it: any) => {
    const cls = CLASS_TO_FRONTEND[it.classification] || {
      cls: 'normal' as MovementClass,
      color: 'text-gray-600',
    };

    const netSold = Number(it.netSold ?? 0);
    const dailyConsumption = periodDays > 0 ? netSold / periodDays : 0;
    const coverageDays = Number(it.coverageDays ?? 0);
    const daysOfCover = coverageDays >= 9999 ? 0 : coverageDays;

    return {
      medicineId: it.medicineId,
      medicineCode: it.code || '',
      tradeName: it.tradeName || '',
      scientificName: it.scientificName || '',
      category: it.category || '',
      supplierName: it.supplierName,
      currentStock: Number(it.currentStock ?? 0),
      batchesCount: Number(it.batchesCount ?? 0),
      nearestExpiryDate: it.nearestExpiry || undefined,
      stockValue: Number(it.stockValue ?? 0),
      totalSoldBaseQty: netSold,
      totalSalesValue: Number(it.salesRevenue ?? 0),
      salesTransactionsCount: 0,
      dailyConsumption: Number(dailyConsumption.toFixed(2)),
      daysOfCover,
      turnoverRatio: Number(it.turnoverRatio ?? 0),
      lastSaleDate: it.lastSaleAt || undefined,
      daysSinceLastSale: Number(it.daysSinceLastSale ?? 0),
      movementClass: cls.cls,
      movementLabel: it.classificationLabel || '',
      movementColor: cls.color,
      cogs: 0,
      potentialWasteValue:
        it.classification === 'STAGNANT' ? Number(it.stockValue ?? 0) : 0,
    };
  });

  // ملخص
  const adaptedSummary: MovementSummary = {
    totalMedicines: Number(summary.totalItems ?? items.length),
    fastMovingCount: findCount('FAST_MOVING'),
    normalMovingCount: findCount('NORMAL'),
    slowMovingCount: findCount('SLOW_MOVING'),
    deadStockCount: findCount('STAGNANT'),
    noStockCount: findCount('NO_STOCK'),
    totalStockValue: Number(summary.totalStockValue ?? 0),
    totalCogs: 0,
    potentialWasteValue: Number(summary.totalStockValueStagnant ?? 0),
    avgTurnoverRatio: Number(summary.avgTurnoverRatio ?? 0),
  };

  // Top movers (top 10 by netSold)
  const topMovers: TopMoverItem[] = [...items]
    .sort((a, b) => b.totalSoldBaseQty - a.totalSoldBaseQty)
    .slice(0, 10)
    .map((it) => ({
      medicineId: it.medicineId,
      tradeName: it.tradeName,
      totalSoldBaseQty: it.totalSoldBaseQty,
      totalSalesValue: it.totalSalesValue,
      dailyConsumption: it.dailyConsumption,
    }));

  // Slow movers (STAGNANT فقط)
  const slowMovers = items.filter((it) => it.movementClass === 'dead');

  return {
    meta: {
      title: meta.title || 'حركة الأصناف والرواكد',
      companyName: meta.companyName || '',
      branchName: meta.branchName,
      fromDate: meta.fromDate || '',
      toDate: meta.toDate || '',
      periodDays,
      generatedAt: meta.generatedAt || new Date().toISOString(),
      generatedBy: meta.generatedBy || { id: '', name: '' },
    },
    summary: adaptedSummary,
    topMovers,
    slowMovers,
    items,
  };
}

// ═══════════════════════════════════════════════════════════════
// API
// ═══════════════════════════════════════════════════════════════

export const stockMovementApi = {
  getReport: async (params?: StockMovementFilterParams): Promise<StockMovementResponse> => {
    const res = await axios.get(BASE, { params });
    return adaptStockMovement(res.data);
  },

  exportExcelUrl: (params?: StockMovementFilterParams): string => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== '') {
          searchParams.append(key, String(val));
        }
      });
    }
    const token = typeof window !== 'undefined' ? localStorage.getItem('dawacore_token') : null;
    if (token) {
      searchParams.append('token', token);
    }
    return `${BASE}/export/excel?${searchParams.toString()}`;
  },

  exportPdfUrl: (params?: StockMovementFilterParams): string => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== '') {
          searchParams.append(key, String(val));
        }
      });
    }
    const token = typeof window !== 'undefined' ? localStorage.getItem('dawacore_token') : null;
    if (token) {
      searchParams.append('token', token);
    }
    return `${BASE}/export/pdf?${searchParams.toString()}`;
  },
};
