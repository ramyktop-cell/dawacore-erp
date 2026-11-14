import axios from 'axios';
import { apiFetch } from './http';

export interface Expense {
  id: string;
  companyId: string;
  branchId: string;
  shiftId?: string;
  expenseNumber: string;
  date: string;
  expenseType: string;
  category?: 'EXPENSE' | 'LIABILITY' | 'OTHER';
  paidTo?: string;
  accountId: string;
  amount: number;
  paidFrom: 'CASH' | 'BANK';
  paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE';
  referenceNo?: string;
  description?: string;
  attachment?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  approvedBy?: string;
  approvedAt?: string;
  rejectionReason?: string;
  createdBy: string;
  createdAt: string;
  account?: { id: string; code: string; name: string };
  branch?: { id: string; name: string; code: string };
  shift?: { id: string; shiftNumber: number; status: string };
  creator?: { id: string; name: string; username: string; role: string };
}

export interface CreateExpenseInput {
  companyId: string;
  branchId: string;
  shiftId?: string;
  expenseType: string;
  category?: 'EXPENSE' | 'LIABILITY' | 'OTHER';
  paidTo?: string;
  accountId: string;
  amount: number;
  paidFrom: 'CASH' | 'BANK';
  paymentMethod?: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE';
  referenceNo?: string;
  description?: string;
  attachment?: string;
}

export interface ExpenseStats {
  approvedTotalAmount: number;
  approvedCashAmount?: number;
  approvedBankAmount?: number;
  approvedCount: number;
  pendingCount: number;
  pendingAmount: number;
  rejectedCount: number;
}

export const expensesApi = {
  getAll: (params?: {
    companyId?: string;
    branchId?: string;
    shiftId?: string;
    paidFrom?: 'CASH' | 'BANK';
    category?: string;
    status?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<Expense[]> =>
    axios.get('/api/expenses', { params }).then((res) => res.data),

  getStats: (params?: { companyId?: string; branchId?: string }): Promise<ExpenseStats> =>
    axios.get('/api/expenses/stats', { params }).then((res) => res.data),

  create: (data: CreateExpenseInput): Promise<Expense> =>
    axios.post('/api/expenses', data).then((res) => res.data),

  approve: (id: string): Promise<Expense> =>
    axios.put(`/api/expenses/${id}/approve`).then((res) => res.data),

  reject: (id: string, reason: string): Promise<Expense> =>
    axios.put(`/api/expenses/${id}/reject`, { reason }).then((res) => res.data),

  getExpensePdfBlob: async (id: string): Promise<Blob> => {
    const response = await apiFetch(`/api/expenses/${id}/pdf`);
    if (!response.ok) {
      if (response.status === 404) throw new Error('سند الصرف غير موجود أو لا تملك صلاحية الوصول إليه');
      if (response.status === 403) throw new Error('ليس لديك صلاحية لعرض هذا السند');
      throw new Error(`فشل تحميل ملف سند الصرف PDF (رمز الخطأ: ${response.status})`);
    }
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/pdf')) {
      throw new Error('الملف المستلم ليس بتنسيق PDF صالح');
    }
    return response.blob();
  },

  downloadExpenseVoucherPdf: async (id: string, voucherNumber?: string): Promise<void> => {
    const response = await apiFetch(`/api/expenses/${id}/pdf`);
    if (!response.ok) {
      if (response.status === 404) throw new Error('سند الصرف غير موجود أو لا تملك صلاحية الوصول إليه');
      if (response.status === 403) throw new Error('ليس لديك صلاحية لتصدير هذا السند');
      throw new Error(`فشل تنزيل ملف سند الصرف PDF (رمز الخطأ: ${response.status})`);
    }
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/pdf')) {
      throw new Error('الملف المستلم ليس بتنسيق PDF صالح');
    }
    const blob = await response.blob();
    const objectUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    const cleanNumber = (voucherNumber || id).replace(/[^a-zA-Z0-9_-]/g, '_');
    link.href = objectUrl;
    link.download = `expense-voucher-${cleanNumber}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => window.URL.revokeObjectURL(objectUrl), 60000);
  },
};