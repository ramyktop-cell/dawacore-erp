import axios from 'axios';

export interface BatchMedicine {
  isWeighed?: boolean;
  id: string;
  tradeName: string;
  scientificName: string;
  code: string;
  barcode: string;
  category: string;
  units?: Array<{
    unitType: string;
    multiplier: number;
    price: number;
  }>;
}

export interface Batch {
  id: string;
  batchNumber: string;
  branchId: string;
  branchName?: string;
  medicineId: string;
  medicine?: BatchMedicine;
  costPrice: number;
  salePrice: number;
  expiryDate: string;
  quantityInBase: number;
  isFrozen: boolean;
  isExpired: boolean;
  isExpiringSoon: boolean;
  daysRemaining: number;
  createdAt: string;
}

export interface CreateBatchInput {
  batchNumber: string;
  medicineId: string;
  branchId: string;
  costPrice: number;
  salePrice: number;
  expiryDate: string;
  quantityInBase: number;
  isFrozen?: boolean;
}

export interface UpdateBatchInput {
  batchNumber?: string;
  costPrice?: number;
  salePrice?: number;
  expiryDate?: string;
  quantityInBase?: number;
  isFrozen?: boolean;
}

export interface BatchesResponse {
  items: Batch[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  stats: {
    totalBatches: number;
    expiredCount: number;
    expiringSoonCount: number;
    frozenCount: number;
    totalUnitsInStock: number;
  };
}

export const batchesApi = {
  getAll: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    branchId?: string;
    medicineId?: string;
    expiryFilter?: 'ALL' | 'EXPIRED' | 'EXPIRING_SOON' | 'VALID';
  }): Promise<BatchesResponse> =>
    axios.get('/api/batches', { params }).then((res) => res.data),

  getById: (id: string): Promise<Batch> =>
    axios.get(`/api/batches/${id}`).then((res) => res.data),

  create: (data: CreateBatchInput): Promise<Batch> =>
    axios.post('/api/batches', data).then((res) => res.data),

  update: (id: string, data: UpdateBatchInput): Promise<Batch> =>
    axios.put(`/api/batches/${id}`, data).then((res) => res.data),

  toggleFreeze: (id: string): Promise<{ success: boolean; isFrozen: boolean; message: string }> =>
    axios.patch(`/api/batches/${id}/freeze`).then((res) => res.data),

  delete: (id: string): Promise<{ success: boolean; message: string }> =>
    axios.delete(`/api/batches/${id}`).then((res) => res.data),
};
