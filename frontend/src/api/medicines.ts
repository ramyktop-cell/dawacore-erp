import axios from 'axios';

export type UnitType = 'UNIT' | 'STRIP' | 'BOX';

export interface MedicineUnit {
  id?: string;
  unitType: UnitType;
  label?: string;
  multiplier: number;
  price: number;
  minSalePrice?: number;
  barcode?: string | null;
  isDefault?: boolean;
}

export interface Medicine {
  isWeighed?: boolean;
  scalePlu?: string | null;
  id: string;
  code: string;
  barcode: string;
  tradeName: string;
  scientificName: string;
  category: string;
  minStockLevel: number;
  totalStockInBase: number;
  branchStockInBase?: number;
  isLowStock: boolean;
  units: MedicineUnit[];
  defaultUnit?: {
    unitType: UnitType;
    label?: string;
    multiplier: number;
    price: number;
    minSalePrice?: number;
  } | null;
  batches?: Array<{
    id: string;
    batchNumber: string;
    branchId: string;
    expiryDate: string;
    costPrice: number;
    salePrice: number;
    quantityInBase: number;
    isFrozen: boolean;
  }>;
  createdAt: string;
}

export interface CreateMedicineInput {
  isWeighed?: boolean;
  scalePlu?: string;
  tradeName: string;
  scientificName: string;
  barcode: string;
  code?: string;
  category: string;
  minStockLevel?: number;
  units: Array<{
    unitType: UnitType;
    label?: string;
    multiplier: number;
    price: number;
    minSalePrice?: number;
    barcode?: string;
    isDefault?: boolean;
  }>;
}

export interface UpdateMedicineInput {
  isWeighed?: boolean;
  scalePlu?: string;
  tradeName?: string;
  scientificName?: string;
  barcode?: string;
  code?: string;
  category?: string;
  minStockLevel?: number;
  units?: Array<{
    unitType: UnitType;
    label?: string;
    multiplier: number;
    price: number;
    minSalePrice?: number;
    barcode?: string;
    isDefault?: boolean;
  }>;
}

export interface MedicinesResponse {
  items: Medicine[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface BulkImportItemInput {
  tradeName: string;
  scientificName?: string;
  code?: string;
  barcode?: string;
  category?: string;
  salePrice?: number;
  costPrice?: number;
  quantityOnHand?: number;
  minStockLevel?: number;
  expiryDate?: string;
  batchNumber?: string;
}

export interface BulkImportResult {
  success: boolean;
  totalProcessed: number;
  createdCount: number;
  updatedCount: number;
  batchesCreatedCount: number;
  errorsCount: number;
  errors: Array<{ row: number; tradeName: string; reason: string }>;
}

export const medicinesApi = {
  getAll: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    category?: string;
    branchId?: string;
  }): Promise<MedicinesResponse> =>
    axios.get('/api/medicines', { params }).then((res) => res.data),

  getCategories: (): Promise<string[]> =>
    axios.get('/api/medicines/categories').then((res) => res.data),

  getById: (id: string): Promise<Medicine> =>
    axios.get(`/api/medicines/${id}`).then((res) => res.data),

  search: (q: string, branchId?: string): Promise<Medicine[]> =>
    axios.get('/api/medicines/search', { params: { q, branchId } }).then((res) => res.data),

  create: (data: CreateMedicineInput): Promise<Medicine> =>
    axios.post('/api/medicines', data).then((res) => res.data),

  bulkImport: (payload: {
    branchId?: string;
    items: BulkImportItemInput[];
  }): Promise<BulkImportResult> =>
    axios.post('/api/medicines/bulk-import', payload).then((res) => res.data),

  update: (id: string, data: UpdateMedicineInput): Promise<Medicine> =>
    axios.put(`/api/medicines/${id}`, data).then((res) => res.data),

  delete: (id: string): Promise<{ success: boolean; message: string }> =>
    axios.delete(`/api/medicines/${id}`).then((res) => res.data),
};
