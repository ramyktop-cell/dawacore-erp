import axios from 'axios';

export interface AccountNode {
  id: string;
  companyId: string;
  branchId?: string;
  code: string;
  name: string;
  type: string;
  level: number;
  parentId?: string;
  isLeaf: boolean;
  isActive: boolean;
  balance: number;
  totalBalance?: number; // محسوب في الخادم
  parent?: { id: string; code: string; name: string; level: number };
  children: AccountNode[];
}

export interface CreateAccountInput {
  companyId: string;
  branchId?: string;
  code: string;
  name: string;
  type: string;
  level: number;
  parentId?: string;
  isLeaf?: boolean;
  isActive?: boolean;
}

export interface UpdateAccountInput {
  name?: string;
  type?: string;
  parentId?: string;
  isLeaf?: boolean;
  isActive?: boolean;
}

export const accountsApi = {
  getTree: (companyId: string, branchId?: string): Promise<AccountNode[]> =>
    axios.get('/api/accounts/tree', { params: { companyId, branchId } }).then((res) => res.data),

  getAll: (params: { companyId: string; isLeaf?: boolean; type?: string; level?: number }): Promise<AccountNode[]> =>
    axios.get('/api/accounts', { params }).then((res) => res.data),

  getOne: (id: string): Promise<AccountNode> =>
    axios.get(`/api/accounts/${id}`).then((res) => res.data),

  create: (data: CreateAccountInput): Promise<AccountNode> =>
    axios.post('/api/accounts', data).then((res) => res.data),

  update: (id: string, data: UpdateAccountInput): Promise<AccountNode> =>
    axios.put(`/api/accounts/${id}`, data).then((res) => res.data),

  delete: (id: string): Promise<any> =>
    axios.delete(`/api/accounts/${id}`).then((res) => res.data),
};
