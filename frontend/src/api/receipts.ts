import axios from 'axios';

export interface Receipt {
  id: string;
  companyId: string;
  branchId: string;
  shiftId?: string;
  receiptNumber: string;
  date: string;
  receiptType: string;
  receivedFrom?: string;
  accountId: string;
  amount: number;
  receivedTo: 'CASH' | 'BANK';
  paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE';
  referenceNo?: string;
  description?: string;
  attachment?: string;
  status: 'APPROVED' | 'CANCELLED';
  createdBy: string;
  createdAt: string;
  account?: { id: string; code: string; name: string };
  branch?: { id: string; name: string; code?: string };
  shift?: { id: string; shiftNumber: number; status: string };
  creator?: { id: string; name: string; username?: string; role: string };
}

export interface CreateReceiptInput {
  companyId: string;
  branchId: string;
  shiftId?: string;
  receiptType: string;
  receivedFrom?: string;
  accountId: string;
  amount: number;
  receivedTo: 'CASH' | 'BANK';
  paymentMethod?: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE';
  referenceNo?: string;
  description?: string;
  attachment?: string;
}

export interface ReceiptStats {
  totalAmount: number;
  cashAmount: number;
  bankAmount: number;
  count: number;
  byType?: Record<string, number>;
}

export const receiptsApi = {
  getAll: (params?: {
    companyId?: string;
    branchId?: string;
    shiftId?: string;
    receivedTo?: 'CASH' | 'BANK';
    status?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<Receipt[]> =>
    axios.get('/api/receipts', { params }).then((res) => res.data),

  getStats: (params?: { companyId?: string; branchId?: string }): Promise<ReceiptStats> =>
    axios.get('/api/receipts/stats', { params }).then((res) => res.data),

  create: (data: CreateReceiptInput): Promise<Receipt> =>
    axios.post('/api/receipts', data).then((res) => res.data),

  cancel: (id: string): Promise<Receipt> =>
    axios.put(`/api/receipts/${id}/cancel`).then((res) => res.data),
};
