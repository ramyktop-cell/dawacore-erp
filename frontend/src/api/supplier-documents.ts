import { apiFetch } from './http';

export interface SupplierStatementParams {
  from?: string;
  to?: string;
  branchId?: string;
}

export interface CreditorsReportParams extends SupplierStatementParams {
  search?: string;
  type?: 'summary' | 'detailed';
}

export interface SupplierStatementSummary {
  beginningBalance: number | null;
  isBeginningBalanceProven: boolean;
  totalCredit: number;
  totalDebit: number;
  netMovement: number;
  endingBalance: number | null;
  isEndingBalanceProven: boolean;
  recordedCurrentDebt: number;
  canCompareWithCurrent: boolean;
  variance: number | null;
  varianceSuppressedReason?: string | null;
}

export interface SupplierStatementItem {
  date: string;
  operationType: string;
  operationNumber: string;
  documentNumber: string;
  description: string;
  debit: number;
  credit: number;
  balance: number | null;
  itemsDetails?: Array<{ tradeName: string; quantity: number; unitType: string }>;
  isSubRow?: boolean;
  supplierPaymentId?: string;
}

export interface OutstandingSupplierInvoice {
  id: string;
  orderNumber: string;
  invoiceNumber?: string | null;
  receivedAt?: string | null;
  totalAmount: number;
  paidAtPurchase: number;
  paidLater: number;
  returnedAmount: number;
  remaining: number;
  eligible: boolean;
  blockedReason?: string | null;
}

export interface SupplierPaymentResponse {
  id: string;
  paymentNumber: string;
  paymentDate: string;
  amount: number;
  method: 'CASH' | 'BANK_TRANSFER';
  referenceNo?: string | null;
  journalEntryNumber: string;
  supplier: { id: string; name: string; companyName?: string | null; currentDebt: number };
  branch: { id: string; name: string; code: string };
  company: { id: string; name: string; currency: string };
  allocations: Array<{
    purchaseOrderId: string;
    orderNumber: string;
    invoiceNumber?: string | null;
    amount: number;
  }>;
}

export interface SupplierStatementResponse {
  supplier: {
    id: string;
    name: string;
    companyName?: string;
    phone: string;
    taxNumber?: string;
    address?: string;
    branchName?: string;
  };
  company: {
    id: string;
    name: string;
    currency: string;
    timezone: string;
  };
  branch: {
    id?: string;
    name?: string;
    code?: string;
  };
  period: {
    from: string | null;
    to: string | null;
  };
  summary: SupplierStatementSummary;
  reviewOrders?: Array<{ orderNumber: string; totalAmount: number; issue: string }>;
  items: SupplierStatementItem[];
}

export interface CreditorsReportItem {
  id: string;
  name: string;
  companyName?: string;
  phone: string;
  taxNumber?: string;
  branchName?: string;
  openingBalance: number | null;
  isOpeningBalanceProven: boolean;
  totalCredit: number;
  totalDebit: number;
  periodNetMovement: number;
  closingBalance: number | null;
  isClosingBalanceProven: boolean;
  recordedCurrentDebt: number;
  canCompareWithCurrent: boolean;
  variance: number | null;
  varianceSuppressedReason?: string | null;
  items?: SupplierStatementItem[];
}

export interface CreditorsReportResponse {
  company: { name: string; currency: string; timezone?: string };
  branch: { name: string };
  period: { from: string | null; to: string | null };
  summary: {
    totalCredit: number;
    totalDebit: number;
    totalPeriodNetMovement: number;
    totalClosingBalance: number | null;
    totalRecordedDebt: number;
    canCompareTotal: boolean;
    totalVariance: number | null;
    incompleteCount: number;
    unprovenCount: number;
  };
  suppliers: CreditorsReportItem[];
}

async function triggerPdfDownload(response: Response, defaultFilename: string) {
  if (!response.ok) {
    if (response.status === 404) throw new Error('المستند غير موجود أو لا تملك صلاحية الوصول إليه');
    if (response.status === 403) throw new Error('ليس لديك صلاحية لتصدير هذا المستند');
    if (response.status === 400) {
      const errJson = await response.json().catch(() => null);
      throw new Error(errJson?.message || 'تعذر إصدار المستند؛ تحقق من اكتمال الإجراء');
    }
    throw new Error(`فشل تنزيل ملف PDF (رمز الخطأ: ${response.status})`);
  }
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/pdf')) {
    throw new Error('الملف المستلم ليس بتنسيق PDF صالح');
  }

  const disposition = response.headers.get('content-disposition') || '';
  let resolvedFilename = defaultFilename;

  // دعم اسم الملف العربي الآمن وفق RFC 5987
  const starMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (starMatch && starMatch[1]) {
    try {
      resolvedFilename = decodeURIComponent(starMatch[1].trim());
    } catch {
      resolvedFilename = defaultFilename;
    }
  } else {
    const plainMatch = disposition.match(/filename="?([^";]+)"?/i);
    if (plainMatch && plainMatch[1]) {
      resolvedFilename = plainMatch[1].trim();
    }
  }

  const blob = await response.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = resolvedFilename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => window.URL.revokeObjectURL(objectUrl), 60000);
}

export const supplierDocumentsApi = {
  getOutstandingInvoices: async (supplierId: string, branchId: string) => {
    const params = new URLSearchParams({ branchId });
    const res = await apiFetch(`/api/suppliers/${supplierId}/outstanding-invoices?${params}`);
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.message || 'فشل جلب فواتير المورد المستحقة');
    }
    return res.json() as Promise<{
      supplier: { id: string; name: string; companyName?: string; currentDebt: number; branchId: string };
      invoices: OutstandingSupplierInvoice[];
    }>;
  },

  createPayment: async (
    supplierId: string,
    payload: {
      branchId: string;
      method: 'CASH' | 'BANK_TRANSFER';
      amount: number;
      idempotencyKey: string;
      referenceNo?: string;
      notes?: string;
      allocations: Array<{ purchaseOrderId: string; amount: number }>;
    },
  ): Promise<SupplierPaymentResponse> => {
    const res = await apiFetch(`/api/suppliers/${supplierId}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      const message = Array.isArray(err?.message) ? err.message.join('، ') : err?.message;
      throw new Error(message || 'فشل تسجيل سداد المورد');
    }
    return res.json();
  },

  downloadPaymentPdf: async (paymentId: string, paymentNumber = 'payment') => {
    const res = await apiFetch(`/api/suppliers/payments/${paymentId}/pdf`);
    await triggerPdfDownload(res, `supplier-payment-${paymentNumber}.pdf`);
  },

  getStatement: async (supplierId: string, params?: SupplierStatementParams): Promise<SupplierStatementResponse> => {
    const searchParams = new URLSearchParams();
    if (params?.from) searchParams.set('from', params.from);
    if (params?.to) searchParams.set('to', params.to);
    if (params?.branchId) searchParams.set('branchId', params.branchId);

    const queryStr = searchParams.toString();
    const url = `/api/suppliers/${supplierId}/statement${queryStr ? `?${queryStr}` : ''}`;
    const res = await apiFetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.message || 'فشل جلب كشف حساب المورد');
    }
    return res.json();
  },

  downloadStatementPdf: async (supplierId: string, params?: SupplierStatementParams, supplierName = 'supplier') => {
    const searchParams = new URLSearchParams();
    if (params?.from) searchParams.set('from', params.from);
    if (params?.to) searchParams.set('to', params.to);
    if (params?.branchId) searchParams.set('branchId', params.branchId);

    const queryStr = searchParams.toString();
    const url = `/api/suppliers/${supplierId}/statement/pdf${queryStr ? `?${queryStr}` : ''}`;
    const res = await apiFetch(url);
    await triggerPdfDownload(res, `statement-${supplierName}.pdf`);
  },

  getCreditorsReport: async (params?: CreditorsReportParams): Promise<CreditorsReportResponse> => {
    const searchParams = new URLSearchParams();
    if (params?.from) searchParams.set('from', params.from);
    if (params?.to) searchParams.set('to', params.to);
    if (params?.branchId) searchParams.set('branchId', params.branchId);
    if (params?.search) searchParams.set('search', params.search);
    if (params?.type) searchParams.set('type', params.type);

    const queryStr = searchParams.toString();
    const url = `/api/suppliers/creditors${queryStr ? `?${queryStr}` : ''}`;
    const res = await apiFetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.message || 'فشل جلب تقرير الدائنين');
    }
    return res.json();
  },

  downloadCreditorsReportPdf: async (params?: CreditorsReportParams) => {
    const searchParams = new URLSearchParams();
    if (params?.from) searchParams.set('from', params.from);
    if (params?.to) searchParams.set('to', params.to);
    if (params?.branchId) searchParams.set('branchId', params.branchId);
    if (params?.search) searchParams.set('search', params.search);
    if (params?.type) searchParams.set('type', params.type);

    const queryStr = searchParams.toString();
    const url = `/api/suppliers/creditors/pdf${queryStr ? `?${queryStr}` : ''}`;
    const res = await apiFetch(url);
    const suffix = params?.type === 'detailed' ? 'detailed' : 'summary';
    await triggerPdfDownload(res, `creditors-report-${suffix}.pdf`);
  },

  downloadPurchaseInvoicePdf: async (orderId: string, orderNumber = 'order') => {
    const res = await apiFetch(`/api/purchasing/orders/${orderId}/invoice-pdf`);
    await triggerPdfDownload(res, `purchase-invoice-${orderNumber}.pdf`);
  },

  downloadReceivingNotePdf: async (orderId: string, orderNumber = 'order') => {
    const res = await apiFetch(`/api/purchasing/orders/${orderId}/receiving-note-pdf`);
    await triggerPdfDownload(res, `receiving-note-${orderNumber}.pdf`);
  },
};
