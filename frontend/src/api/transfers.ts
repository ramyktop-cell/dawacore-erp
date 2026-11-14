import axios from 'axios';

export interface TransferItemPayload {
  batchId: string;
  quantity: number;
}

export interface CreateTransferPayload {
  fromBranchId: string;
  toBranchId: string;
  notes?: string;
  items: TransferItemPayload[];
}

export interface TransferTransaction {
  id: string;
  referenceId: string;
  branchId: string;
  branchName: string;
  batchNumber: string;
  medicineName: string;
  barcode?: string;
  quantity: number;
  notes?: string;
  createdAt: string;
}

export interface TransferDetails {
  referenceId: string;
  fromBranch: string;
  toBranch: string;
  date: string;
  items: Array<{
    batchNumber: string;
    medicineName: string;
    barcode?: string;
    quantity: number;
    expiryDate: string;
    unitCost: number;
  }>;
}

export const transfersApi = {
  createTransfer: (payload: CreateTransferPayload) =>
    axios.post('/api/transfers', payload).then((res) => res.data),

  getAll: (params?: { branchId?: string; search?: string; page?: number; limit?: number }): Promise<{
    items: TransferTransaction[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> => axios.get('/api/transfers', { params }).then((res) => res.data),

  getDetails: (referenceId: string): Promise<TransferDetails> =>
    axios.get(`/api/transfers/${encodeURIComponent(referenceId)}`).then((res) => res.data),
};
