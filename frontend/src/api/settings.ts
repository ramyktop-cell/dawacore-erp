import axios from 'axios';

export interface CompanySettingItem {
  id?: string;
  companyId?: string;
  key: string;
  value: string;
  dataType?: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'JSON' | 'UUID';
  category?: 'ACCOUNTING' | 'SALES' | 'REPORTS' | 'SYSTEM' | 'INTEGRATION';
  description?: string;
  isEditable?: boolean;
}

export type SettingsByCategory = Record<string, CompanySettingItem[]>;

const BASE = '/api/settings';

export const settingsApi = {
  getAll: (): Promise<CompanySettingItem[]> =>
    axios.get(BASE).then((r) => r.data),

  getByCategory: (): Promise<SettingsByCategory> =>
    axios.get(`${BASE}/by-category`).then((r) => r.data),

  getByKey: (key: string): Promise<string> =>
    axios.get(`${BASE}/${key}`).then((r) => r.data),

  updateBatch: (settings: CompanySettingItem[] | Record<string, string>): Promise<CompanySettingItem[]> =>
    axios.put(BASE, { settings }).then((r) => r.data),

  updateSingle: (key: string, value: string): Promise<CompanySettingItem> =>
    axios.put(`${BASE}/${key}`, { value }).then((r) => r.data),

  resetDefaults: (): Promise<{ success: boolean; message: string; seededCount: number }> =>
    axios.post(`${BASE}/reset-defaults`).then((r) => r.data),

  seedDefaults: (): Promise<{ created: number }> =>
    axios.post(`${BASE}/seed-defaults`).then((r) => r.data),
};
