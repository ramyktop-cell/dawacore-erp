import axios from 'axios';

export interface StockCardItem {
  id: string;
  createdAt: string;
  transactionType:
    | 'PURCHASE'
    | 'SALE'
    | 'SALE_RETURN'
    | 'PURCHASE_RETURN'
    | 'TRANSFER_IN'
    | 'TRANSFER_OUT'
    | 'INVENTORY_ADJUSTMENT'
    | 'DAMAGE'
    | 'DAMAGED_RETURN'
    | string;
  referenceId: string;
  notes?: string;
  batchNumber: string;
  incoming: number;
  outgoing: number;
  balance: number;
  partyName: string;
}

export interface StockCardResponse {
  branch: { id: string; name: string; code: string };
  medicine: { id: string; code: string; tradeName: string; isWeighed: boolean };
  unit: string;
  from: string;
  to: string;
  opening: number;
  incoming: number;
  outgoing: number;
  closing: number;
  total: number;
  page: number;
  pageSize: number;
  openingReconstructed: boolean;
  items: StockCardItem[];
}

export interface BranchStockItemLookup {
  id: string;
  code: string;
  tradeName: string;
}

export const itemCardApi = {
  getLedger: (params: {
    branchId: string;
    medicineId: string;
    from: string;
    to: string;
    page?: number;
  }): Promise<StockCardResponse> =>
    axios.get('/api/reports/branch-stock/ledger', { params }).then((res) => res.data),

  searchItems: (branchId: string, search = ''): Promise<BranchStockItemLookup[]> =>
    axios
      .get('/api/reports/branch-stock/items', { params: { branchId, search } })
      .then((res) => res.data),
};
