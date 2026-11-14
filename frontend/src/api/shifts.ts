import axios from 'axios';

export type ShiftStatus = 'OPEN' | 'CLOSED' | 'APPROVED';
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'MIXED' | 'CREDIT' | 'CARD' | 'TRANSFER';

export interface Shift {
  id: string;
  companyId: string;
  branchId: string;
  userId: string;
  shiftNumber: number;
  status: ShiftStatus;
  openedAt: string;
  closedAt?: string;
  approvedAt?: string;
  approvedBy?: string;
  openingBalance: number | string;
  expectedCash: number | string;
  actualCash?: number | string;
  cashDifference?: number | string;
  totalSalesCash: number | string;
  totalSalesBank: number | string;
  totalSalesCredit: number | string;
  totalSales: number | string;
  notes?: string;
  branch?: {
    id: string;
    name: string;
    code?: string;
  };
  user?: {
    id: string;
    name: string;
    username: string;
  };
  invoices?: SalesInvoice[];
  cashMovements?: CashMovement[];
  _count?: {
    invoices: number;
    sales: number;
    cashMovements: number;
  };
}

export interface CashMovement {
  id: string;
  shiftId: string;
  type: 'CASH_IN' | 'CASH_OUT';
  amount: number | string;
  reason: string;
  authorizedBy: string;
  createdAt: string;
}

export interface SalesInvoiceItem {
  id?: string;
  medicineId: string;
  batchId: string;
  quantity: number;
  unitPrice: number;
  costPrice?: number;
  subtotal?: number;
  medicine?: {
    id: string;
    tradeName: string;
    code?: string;
  };
  batch?: {
    id: string;
    batchNumber: string;
    expiryDate: string;
  };
}

export interface SalesInvoice {
  customerBalance?: { previousDebt: string; creditAmount: string; debtAfter: string } | null;
  id: string;
  companyId: string;
  branchId: string;
  shiftId: string;
  userId: string;
  customerId?: string;
  invoiceNumber: string;
  totalAmount: number | string;
  discountAmount: number | string;
  netAmount: number | string;
  paidAmount: number | string;
  remainingAmount: number | string;
  paymentMethod: PaymentMethod;
  bankReference?: string;
  notes?: string;
  createdAt: string;
  customer?: {
    id: string;
    name: string;
    phone?: string;
  };
  user?: {
    id: string;
    name: string;
  };
  branch?: {
    id: string;
    name: string;
  };
  shift?: {
    id: string;
    shiftNumber: number;
    status: ShiftStatus;
  };
  items?: SalesInvoiceItem[];
}

export const shiftsApi = {
  open: (data: { branchId: string; userId: string; openingBalance: number; companyId?: string }) =>
    axios.post('/api/shifts/open', data).then((res) => res.data),

  getActive: (branchId?: string, userId?: string) =>
    axios.get('/api/shifts/active', { params: { branchId: branchId || undefined, userId: userId || undefined } }).then((res) => res.data),

  close: (id: string, data: { actualCash: number; notes?: string }) =>
    axios.patch(`/api/shifts/${id}/close`, data).then((res) => res.data),

  approve: (id: string, data: { approvedBy: string; notes?: string }) =>
    axios.patch(`/api/shifts/${id}/approve`, data).then((res) => res.data),

  recordCashMovement: (data: {
    shiftId: string;
    type: 'CASH_IN' | 'CASH_OUT';
    amount: number;
    reason: string;
    authorizedBy: string;
  }) => axios.post('/api/shifts/cash-movement', data).then((res) => res.data),

  getAll: (params?: { branchId?: string; userId?: string; status?: ShiftStatus; page?: number; limit?: number }) =>
    axios.get('/api/shifts', { params }).then((res) => res.data),

  getOne: (id: string) => axios.get(`/api/shifts/${id}`).then((res) => res.data),
};

export const salesApi = {
  createInvoice: (data: {
    branchId: string;
    shiftId: string;
    userId: string;
    customerId?: string;
    items: Array<{ medicineId: string; batchId: string; quantity: number; unitPrice: number }>;
    discountAmount?: number;
    paidAmount?: number;
    paymentMethod: PaymentMethod;
    bankReference?: string;
    notes?: string;
    companyId?: string;
  }) => axios.post('/api/sales/invoices', data).then((res) => res.data),

  getInvoices: (params?: {
    branchId?: string;
    shiftId?: string;
    customerId?: string;
    paymentMethod?: PaymentMethod;
    search?: string;
    page?: number;
    limit?: number;
  }) => axios.get('/api/sales/invoices', { params }).then((res) => res.data),

  getInvoice: (id: string) => axios.get(`/api/sales/invoices/${id}`).then((res) => res.data),

  getMedicinesForPos: (branchId: string, search?: string) =>
    axios.get('/api/medicines/pos-search', { params: { branchId, q: search, search } }).then((res) => res.data),
};
