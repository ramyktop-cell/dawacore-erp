import axios from 'axios';

export interface Customer {
  id: string;
  companyId: string;
  branchId: string;
  name: string;
  phone: string;
  nationalId?: string;
  creditLimit: number;
  currentDebt: number;
  address?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  branch?: { id: string; name: string; code: string };
  company?: { id: string; name: string };
}

export interface CustomerTransaction {
  id: string;
  customerId: string;
  type: string;
  amount: number;
  balanceAfter: number;
  referenceId?: string;
  description?: string;
  createdBy?: string;
  createdAt: string;
}

export const customersApi = {
  getAll: (params?: {
    companyId?: string;
    branchId?: string;
    search?: string;
    hasDebt?: boolean;
    page?: number;
    limit?: number;
  }) => axios.get('/api/customers', { params }).then((res) => res.data),

  getOne: (id: string) => axios.get(`/api/customers/${id}`).then((res) => res.data),

  getLedger: (id: string, from?: string, to?: string) =>
    axios.get(`/api/customers/${id}/ledger`, { params: { from, to } }).then((res) => res.data),

  validateCredit: (id: string, amount: number) =>
    axios.post(`/api/customers/${id}/validate-credit`, { amount }).then((res) => res.data),

  create: (data: any) => axios.post('/api/customers', data).then((res) => res.data),

  update: (id: string, data: any) => axios.put(`/api/customers/${id}`, data).then((res) => res.data),

  delete: (id: string) => axios.delete(`/api/customers/${id}`).then((res) => res.data),

  recordPayment: (
    customerId: string,
    data: {
      amount: number;
      paymentMethod?: 'CASH' | 'CARD' | 'TRANSFER' | 'CHECK';
      branchId?: string;
      shiftId?: string;
      referenceNo?: string;
      notes?: string;
      userId?: string;
    },
  ) => axios.post(`/api/customers/${customerId}/payments`, data).then((res) => res.data),

  getReceiptPdfUrl: (receiptNumber: string) => `/api/customers/receipts/${receiptNumber}/pdf`,
};
