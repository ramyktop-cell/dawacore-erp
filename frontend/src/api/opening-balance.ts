import axios from 'axios';

export interface OpeningBalanceItem {
  id: string;
  accountId: string;
  debit: number;
  credit: number;
  description?: string;
  referenceType?: string;
  referenceId?: string;
  account?: {
    id: string;
    code: string;
    name: string;
    type: string;
    isLeaf: boolean;
  };
}

export interface OpeningBalanceDocument {
  id: string;
  companyId: string;
  branchId: string;
  documentNumber: string;
  effectiveDate: string;
  status: 'DRAFT' | 'POSTED' | 'CANCELLED';
  totalDebit: number;
  totalCredit: number;
  difference: number;
  journalEntryId?: string;
  postedAt?: string;
  cancelReason?: string;
  notes?: string;
  branch?: { id: string; name: string };
  createdBy?: { id: string; name: string };
  postedBy?: { id: string; name: string };
  items?: OpeningBalanceItem[];
  journalEntry?: any;
  _count?: { items: number };
}

export interface SuggestedBalances {
  inventory: number;
  customers: number;
  suppliers: number;
  cash: number;
  bank: number;
  suggestedCapital: number;
}

export const openingBalanceApi = {
  getAll: (params?: { companyId?: string; branchId?: string }) =>
    axios.get('/api/opening-balance', { params }).then((res) => res.data),

  getOne: (id: string) =>
    axios.get(`/api/opening-balance/${id}`).then((res) => res.data),

  create: (data: {
    companyId: string;
    branchId: string;
    effectiveDate: string;
    notes?: string;
    items: {
      accountId: string;
      debit: number;
      credit: number;
      description?: string;
      referenceType?: string;
      referenceId?: string;
    }[];
  }) => axios.post('/api/opening-balance', data).then((res) => res.data),

  post: (id: string) =>
    axios.post(`/api/opening-balance/${id}/post`).then((res) => res.data),

  cancel: (id: string, reason: string) =>
    axios.post(`/api/opening-balance/${id}/cancel`, { reason }).then((res) => res.data),

  suggest: (companyId: string, branchId: string) =>
    axios
      .get(`/api/opening-balance/suggest/${companyId}/${branchId}`)
      .then((res) => res.data),
};
