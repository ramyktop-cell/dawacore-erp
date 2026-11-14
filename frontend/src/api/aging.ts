import axios from 'axios';

// ═══════════════════════════════════════════════════════════════
// Types (بدون تغيير)
// ═══════════════════════════════════════════════════════════════

export interface AgingBucket {
  label: string;
  minDays: number;
  maxDays: number | null;
  amount: number;
  percentage: number;
  color: string;
}

export interface AgingInvoice {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  amount: number;
  paidAmount: number;
  remainingAmount: number;
  daysOverdue: number;
  bucket: string;
}

export interface AgingPartner {
  partnerId: string;
  partnerCode: string;
  partnerName: string;
  phone?: string;
  creditLimit?: number;
  currentBalance: number;
  buckets: {
    current: number;
    days31_60: number;
    days61_90: number;
    over90: number;
  };
  oldestInvoiceDate?: string;
  oldestInvoiceDays: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  invoices: AgingInvoice[];
}

export interface AgingResponse {
  meta: {
    title: string;
    type: 'customers' | 'suppliers';
    companyName: string;
    branchName?: string;
    asOfDate: string;
    generatedAt: string;
    generatedBy: { id: string; name: string };
    bucketsConfig: { bucket1: number; bucket2: number; bucket3: number };
  };
  summary: {
    totalPartners: number;
    partnersWithBalance: number;
    totalBalance: number;
    buckets: AgingBucket[];
  };
  partners: AgingPartner[];
}

// ═══════════════════════════════════════════════════════════════
// Adapter: Backend ReportKit Shape → Frontend Legacy Shape
// ═══════════════════════════════════════════════════════════════

const BASE = '/api/reports';

const RISK_COLOR: Record<string, string> = {
  LOW: 'text-emerald-600',
  MEDIUM: 'text-yellow-600',
  HIGH: 'text-orange-600',
  CRITICAL: 'text-red-600',
};

const CLASSIFICATION_TO_FRONTEND: Record<string, string> = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
};

function adaptAgingResponse(
  apiRes: any,
  type: 'customers' | 'suppliers',
): AgingResponse {
  const summary = apiRes.summary || {};
  const rawPartners = apiRes.partners || apiRes.rows || apiRes.customers || apiRes.suppliers || [];
  const thresholds = apiRes.thresholds || { bucket1: 30, bucket2: 60, bucket3: 90 };

  // Summary buckets → AgingBucket[]
  const buckets: AgingBucket[] = (summary.buckets || []).map((b: any) => ({
    label: b.label || '',
    minDays: Number(b.fromDays ?? 0),
    maxDays: b.toDays ?? null,
    amount: Number(b.amount ?? 0),
    percentage: Number(b.percentage ?? 0),
    color: RISK_COLOR[b.riskLevel] || 'text-gray-600',
  }));

  // Partners mapping
  const partners: AgingPartner[] = rawPartners.map((p: any) => ({
    partnerId: p.partnerId || p.partyId || p.customerId || p.supplierId || '',
    partnerCode: p.partnerCode || (p.partyId || '').slice(-8).toUpperCase(),
    partnerName: p.partnerName || p.partyName || '',
    phone: p.phone || undefined,
    creditLimit: p.creditLimit ? Number(p.creditLimit) : undefined,
    currentBalance: Number(p.currentBalance ?? p.totalOutstanding ?? 0),
    buckets: {
      current: Number(p.buckets?.current ?? 0),
      days31_60: Number(p.buckets?.days31_60 ?? 0),
      days61_90: Number(p.buckets?.days61_90 ?? 0),
      over90: Number(p.buckets?.over90 ?? 0),
    },
    oldestInvoiceDate: p.oldestInvoiceDate || p.oldestDocumentDate,
    oldestInvoiceDays: Number(p.oldestInvoiceDays ?? p.oldestDocumentDays ?? 0),
    riskLevel: (CLASSIFICATION_TO_FRONTEND[p.riskLevel] || 'low') as AgingPartner['riskLevel'],
    invoices: (p.invoices || p.documents || []).map((d: any) => ({
      invoiceId: d.invoiceId || d.id || '',
      invoiceNumber: d.invoiceNumber || d.documentNumber || '',
      invoiceDate: d.invoiceDate || d.documentDate || '',
      amount: Number(d.amount ?? 0),
      paidAmount: Number(d.paidAmount ?? 0),
      remainingAmount: Number(d.remainingAmount ?? 0),
      daysOverdue: Number(d.daysOverdue ?? d.ageInDays ?? 0),
      bucket: d.bucket || '',
    })),
  }));

  return {
    meta: {
      title: apiRes.meta?.title || (type === 'customers' ? 'أعمار ديون العملاء' : 'أعمار ديون الموردين'),
      type,
      companyName: apiRes.meta?.companyName || '',
      branchName: apiRes.meta?.branchName,
      asOfDate: apiRes.meta?.asOfDate || apiRes.meta?.toDate || '',
      generatedAt: apiRes.meta?.generatedAt || new Date().toISOString(),
      generatedBy: apiRes.meta?.generatedBy || { id: '', name: '' },
      bucketsConfig: {
        bucket1: Number(thresholds.bucket1 ?? 30),
        bucket2: Number(thresholds.bucket2 ?? 60),
        bucket3: Number(thresholds.bucket3 ?? 90),
      },
    },
    summary: {
      totalPartners: Number(summary.totalPartners ?? rawPartners.length),
      partnersWithBalance: Number(summary.partnersWithBalance ?? rawPartners.length),
      totalBalance: Number(summary.totalBalance ?? 0),
      buckets,
    },
    partners,
  };
}

// ═══════════════════════════════════════════════════════════════
// API
// ═══════════════════════════════════════════════════════════════

export const agingApi = {
  getCustomers: async (params?: any): Promise<AgingResponse> => {
    const res = await axios.get(`${BASE}/customer-aging`, { params });
    return adaptAgingResponse(res.data, 'customers');
  },

  getSuppliers: async (params?: any): Promise<AgingResponse> => {
    const res = await axios.get(`${BASE}/supplier-aging`, { params });
    return adaptAgingResponse(res.data, 'suppliers');
  },
};
