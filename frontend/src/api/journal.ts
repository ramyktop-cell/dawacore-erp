import axios from 'axios';

export interface JournalAccount {
  id: string;
  code: string;
  name: string;
  type: string;
  isLeaf: boolean;
  balance?: number | string;
}

export interface JournalLineItem {
  id: string;
  accountId: string;
  debit: number | string;
  credit: number | string;
  notes?: string;
  description?: string;
  account: JournalAccount;
}

export interface JournalEntryItem {
  id: string;
  companyId: string;
  branchId?: string;
  entryNumber: string;
  date: string;
  description: string;
  referenceId?: string;
  source: string;
  createdBy?: string;
  createdAt: string;
  lines: JournalLineItem[];
  branch?: {
    id: string;
    name: string;
  };
}

export const journalApi = {
  getAll: (params?: { companyId?: string; source?: string; search?: string; page?: number; limit?: number }) =>
    axios.get('/api/accounting/entries', { params }).then((res) => res.data),

  getOne: (id: string): Promise<JournalEntryItem> =>
    axios.get(`/api/accounting/entries/${id}`).then((res) => res.data),

  getEntry: (id: string): Promise<JournalEntryItem> =>
    axios.get(`/api/accounting/entries/${id}`).then((res) => res.data),

  getAccounts: (companyId?: string) =>
    axios.get('/api/accounting/accounts', { params: { companyId } }).then((res) => res.data),

  createEntry: (data: {
    companyId: string;
    branchId?: string;
    description: string;
    source: string;
    referenceId?: string;
    createdBy?: string;
    lines: Array<{ accountCode: string; debit: number; credit: number; notes?: string }>;
  }) => axios.post('/api/accounting/entries', data).then((res) => res.data),
};
