import axios from 'axios';

export interface Company {
  id: string;
  name: string;
  taxNumber?: string;
  phone?: string;
  email?: string;
  address?: string;
  logoUrl?: string;
  isActive: boolean;
  _count?: { branches: number };
}

export const companiesApi = {
  getAll: (params?: { search?: string; page?: number; limit?: number }) =>
    axios.get('/api/companies', { params }).then((res) => res.data),
  getOne: (id: string) => axios.get(`/api/companies/${id}`).then((res) => res.data),
  create: (data: Partial<Company>) => axios.post('/api/companies', data).then((res) => res.data),
  update: (id: string, data: Partial<Company>) => axios.put(`/api/companies/${id}`, data).then((res) => res.data),
  delete: (id: string) => axios.delete(`/api/companies/${id}`).then((res) => res.data),
};
