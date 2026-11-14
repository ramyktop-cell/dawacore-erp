import axios from 'axios';

export type PurchaseStatus = 'PENDING' | 'RECEIVED' | 'CANCELLED';

export interface Supplier {
  id: string;
  companyId: string;
  branchId: string;
  name: string;
  companyName?: string;
  phone: string;
  taxNumber?: string;
  currentDebt: number | string;
  initialDebt?: number | string;
  address?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  branch?: {
    id: string;
    name: string;
    code?: string;
  };
  _count?: {
    purchases: number;
    purchaseReturns: number;
  };
}

export interface PurchaseOrderItem {
  id?: string;
  purchaseOrderId?: string;
  medicineId: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  costPrice: number;
  sellingPrice?: number;
  subtotal?: number;
  medicine?: {
    id: string;
    tradeName: string;
    scientificName?: string;
    code?: string;
  };
  batch?: {
    id: string;
    batchNumber: string;
    expiryDate: string;
  };
}

export interface PurchaseOrder {
  id: string;
  companyId: string;
  branchId: string;
  supplierId: string;
  orderNumber: string;
  invoiceNumber?: string;
  status: PurchaseStatus;
  totalAmount: number | string;
  paidAmount: number | string;
  createdBy: string;
  receivedBy?: string;
  receivedAt?: string;
  notes?: string;
  createdAt: string;
  supplier?: {
    id: string;
    name: string;
    companyName?: string;
    phone?: string;
  };
  branch?: {
    id: string;
    name: string;
    code?: string;
  };
  items?: PurchaseOrderItem[];
  additionalExpenses?: number | string;
  expenseAllocationMethod?: 'LANDED_COST' | 'PERIOD_EXPENSE';
  expenseNotes?: string;
  _count?: {
    items: number;
  };
  paymentAllocations?: Array<{ amount: number | string }>;
  purchaseReturns?: Array<{ totalRefund: number | string }>;
}

export const suppliersApi = {
  getAll: (params?: { companyId?: string; branchId?: string; search?: string; page?: number; limit?: number }) =>
    axios.get('/api/suppliers', { params }).then((res) => res.data),

  getOne: (id: string) => axios.get(`/api/suppliers/${id}`).then((res) => res.data),

  create: (data: Partial<Supplier>) => axios.post('/api/suppliers', data).then((res) => res.data),

  update: (id: string, data: Partial<Supplier>) => axios.put(`/api/suppliers/${id}`, data).then((res) => res.data),

  delete: (id: string) => axios.delete(`/api/suppliers/${id}`).then((res) => res.data),
};

export const purchasingApi = {
  createOrder: (data: {
    companyId?: string;
    branchId: string;
    supplierId: string;
    orderNumber?: string;
    invoiceNumber?: string;
    paidAmount?: number;
    additionalExpenses?: number;
    expenseAllocationMethod?: 'LANDED_COST' | 'PERIOD_EXPENSE';
    expenseNotes?: string;
    notes?: string;
    items: Array<{
      medicineId: string;
      batchNumber: string;
      expiryDate: string;
      quantity: number;
      costPrice: number;
      sellingPrice?: number;
    }>;
  }) => axios.post('/api/purchasing/orders', data).then((res) => res.data),

  directReceive: (data: {
    companyId?: string;
    branchId: string;
    supplierId: string;
    orderNumber?: string;
    invoiceNumber?: string;
    paidAmount?: number;
    additionalExpenses?: number;
    expenseAllocationMethod?: 'LANDED_COST' | 'PERIOD_EXPENSE';
    expenseNotes?: string;
    notes?: string;
    items: Array<{
      medicineId: string;
      batchNumber: string;
      expiryDate: string;
      quantity: number;
      costPrice: number;
      sellingPrice?: number;
    }>;
  }) => axios.post('/api/purchasing/receive', data).then((res) => res.data),

  receiveOrder: (id: string) => axios.post(`/api/purchasing/orders/${id}/receive`).then((res) => res.data),

  cancelOrder: (id: string) => axios.patch(`/api/purchasing/orders/${id}/cancel`).then((res) => res.data),

  getOrders: (params?: {
    branchId?: string;
    supplierId?: string;
    status?: PurchaseStatus;
    search?: string;
    page?: number;
    limit?: number;
  }) => axios.get('/api/purchasing/orders', { params }).then((res) => res.data),

  getOrder: (id: string) => axios.get(`/api/purchasing/orders/${id}`).then((res) => res.data),
};
