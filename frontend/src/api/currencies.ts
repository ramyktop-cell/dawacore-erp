import axios from 'axios';

export interface GlobalCurrency {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  symbol: string;
  decimalPlaces: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyCurrency {
  id: string;
  currencyId: string;
  code: string;
  nameAr: string;
  nameEn: string;
  symbol: string;
  decimalPlaces: number;
  isBase: boolean;
  exchangeRate: number;
  effectiveFrom: string;
  updatedAt: string;
}

export interface ExchangeRateHistoryItem {
  id: string;
  companyId: string;
  currencyId: string;
  oldRate: number;
  newRate: number;
  changedBy: string;
  reason?: string | null;
  createdAt: string;
  currency?: {
    code: string;
    nameAr: string;
    symbol: string;
  };
}

export interface AddCompanyCurrencyDto {
  currencyId: string;
  exchangeRate: number;
  isBase?: boolean;
  reason?: string;
}

export interface UpdateExchangeRateDto {
  newRate: number;
  reason?: string;
}

export interface CreateCurrencyDto {
  code: string;
  nameEn: string;
  nameAr: string;
  symbol: string;
  decimalPlaces?: number;
}

export interface ConvertCurrencyResult {
  from: string;
  to: string;
  amount: number;
  result: number;
}

const BASE = '/api/settings/currencies';

export const currenciesApi = {
  listGlobal: (): Promise<GlobalCurrency[]> =>
    axios.get(`${BASE}/global`).then((r) => r.data),

  createGlobal: (dto: CreateCurrencyDto): Promise<GlobalCurrency> =>
    axios.post(`${BASE}/global`, dto).then((r) => r.data),

  listCompanyCurrencies: (): Promise<CompanyCurrency[]> =>
    axios.get(BASE).then((r) => r.data),

  getBaseCurrency: (): Promise<CompanyCurrency> =>
    axios.get(`${BASE}/base`).then((r) => r.data),

  addCompanyCurrency: (dto: AddCompanyCurrencyDto): Promise<CompanyCurrency> =>
    axios.post(BASE, dto).then((r) => r.data),

  updateExchangeRate: (id: string, dto: UpdateExchangeRateDto): Promise<CompanyCurrency> =>
    axios.put(`${BASE}/${id}/rate`, dto).then((r) => r.data),

  setBaseCurrency: (id: string): Promise<CompanyCurrency> =>
    axios.put(`${BASE}/${id}/set-base`).then((r) => r.data),

  removeCompanyCurrency: (id: string): Promise<{ success: boolean }> =>
    axios.delete(`${BASE}/${id}`).then((r) => r.data),

  getHistory: (id?: string): Promise<ExchangeRateHistoryItem[]> =>
    axios.get(`${BASE}/history`, { params: { currencyId: id } }).then((r) => r.data),

  convert: (from: string, to: string, amount: number): Promise<ConvertCurrencyResult> =>
    axios
      .get(`${BASE}/convert`, { params: { from, to, amount } })
      .then((r) => r.data),
};
