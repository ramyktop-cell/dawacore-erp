import axios from 'axios';

export interface Branch {
  id: string;
  companyId: string;
  name: string;
  code: string;
  phone?: string;
  address?: string;
  isMain: boolean;
  isActive: boolean;
  company?: { id: string; name: string };
  createdAt?: string;
}

export const branchesApi = {
  getAll: (params?: { companyId?: string; search?: string; page?: number; limit?: number }) =>
    axios.get('/api/branches', { params }).then((res) => res.data),
  getOne: (id: string) => axios.get(`/api/branches/${id}`).then((res) => res.data),
  create: (data: Partial<Branch>) => axios.post('/api/branches', data).then((res) => res.data),
  update: (id: string, data: Partial<Branch>) => axios.put(`/api/branches/${id}`, data).then((res) => res.data),
  delete: (id: string) => axios.delete(`/api/branches/${id}`).then((res) => res.data),
};
