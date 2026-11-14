import axios from 'axios';

export type UserRole = 'SUPER_ADMIN' | 'COMPANY_ADMIN' | 'BRANCH_MANAGER' | 'CASHIER' | 'ACCOUNTANT' | 'INVENTORY';

export interface UserItem {
  id: string;
  name: string;
  username: string;
  email?: string;
  phone?: string;
  role: UserRole;
  isActive: boolean;
  companyId: string;
  branchId?: string;
  company?: { id: string; name: string };
  branch?: { id: string; name: string; code: string };
  createdAt: string;
}

export const usersApi = {
  getAll: (params?: { companyId?: string; branchId?: string; search?: string; role?: string; page?: number; limit?: number }) =>
    axios.get('/api/users', { params }).then((res) => res.data),
  getOne: (id: string) => axios.get(`/api/users/${id}`).then((res) => res.data),
  create: (data: any) => axios.post('/api/users', data).then((res) => res.data),
  update: (id: string, data: any) => axios.put(`/api/users/${id}`, data).then((res) => res.data),
  delete: (id: string) => axios.delete(`/api/users/${id}`).then((res) => res.data),
};
