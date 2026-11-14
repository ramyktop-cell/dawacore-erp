import axios from 'axios';

export interface StockCountItem {
  id: string;
  batchId: string;
  systemQty: number;
  actualQty: number | null;
  variance: number;
  unitCost: number;
  totalCostVariance: number;
  notes?: string;
  countedAt?: string;
  batch?: {
    batchNumber: string;
    expiryDate: string;
    medicine?: { id: string; tradeName: string; barcode: string };
  };
}

export interface StockCount {
  id: string;
  countNumber: string;
  status: 'DRAFT' | 'IN_PROGRESS' | 'RECONCILED' | 'APPROVED' | 'CANCELLED';
  countType: 'FULL' | 'PARTIAL';
  startedAt: string;
  countedAt?: string;
  reconciledAt?: string;
  approvedAt?: string;
  completedAt?: string;
  cancelReason?: string;
  totalShortage: number;
  totalSurplus: number;
  netVarianceValue: number;
  notes?: string;
  branch?: { id: string; name: string };
  createdBy?: { id: string; name: string };
  countedBy?: { id: string; name: string };
  reconciledBy?: { id: string; name: string };
  approvedBy?: { id: string; name: string };
  items?: StockCountItem[];
  _count?: { items: number };
}

export interface QuickAddItemInput {
  barcode?: string;
  medicineId?: string;
  tradeName?: string;
  category?: string;
  batchNumber?: string;
  expiryDate: string;
  costPrice: number;
  salePrice: number;
  actualQty: number;
  unitType?: 'UNIT' | 'STRIP' | 'BOX';
  notes?: string;
}

export const stockCountApi = {
  getAll: (params?: any) =>
    axios.get('/api/stock-count', { params }).then((res) => res.data),

  getOne: (id: string) =>
    axios.get(`/api/stock-count/${id}`).then((res) => res.data),

  start: (data: {
    branchId: string;
    countType: 'FULL' | 'PARTIAL';
    batchIds?: string[];
    categoryFilter?: string;
    notes?: string;
  }) => axios.post('/api/stock-count/start', data).then((res) => res.data),

  recordItems: (
    id: string,
    data: { items: { batchId: string; actualQty: number; notes?: string }[] },
  ) => axios.put(`/api/stock-count/${id}/record`, data).then((res) => res.data),

  reconcile: (id: string) =>
    axios.put(`/api/stock-count/${id}/reconcile`).then((res) => res.data),

  approve: (id: string) =>
    axios.post(`/api/stock-count/${id}/approve`).then((res) => res.data),

  cancel: (id: string, reason: string) =>
    axios.post(`/api/stock-count/${id}/cancel`, { reason }).then((res) => res.data),

  addQuickItem: (id: string, data: QuickAddItemInput) =>
    axios.post(`/api/stock-count/${id}/quick-item`, data).then((res) => res.data),
};
