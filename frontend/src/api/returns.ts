import axios from 'axios';

export interface ReturnItemPayload {
  saleItemId: string;
  returnQuantity: number;
  condition: 'RESTOCKABLE' | 'DAMAGED';
  isDamaged?: boolean;
}

export interface CreateReturnPayload {
  saleId: string;
  branchId?: string;
  shiftId?: string;
  cashierId?: string;
  reason?: string;
  refundMethod: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'CREDIT';
  items: ReturnItemPayload[];
}

export interface SaleForReturnItem {
  id: string;
  saleId: string;
  batchId: string;
  unitType?: string;
  multiplier?: number;
  quantity: number | string;
  returnedQty: number | string;
  unitPrice: number | string;
  totalPrice: number | string;
  batch?: {
    id: string;
    batchNumber: string;
    expiryDate: string;
    medicine?: {
      tradeName: string;
      barcode?: string;
      code?: string;
    };
  };
}

export interface SaleForReturn {
  id: string;
  invoiceNumber: string;
  branchId: string;
  cashierId?: string;
  shiftId?: string;
  subTotal: number | string;
  discountTotal: number | string;
  taxTotal: number | string;
  grandTotal: number | string;
  paidAmount: number | string;
  changeAmount: number | string;
  paymentMethod: string;
  status: string;
  createdAt: string;
  items: SaleForReturnItem[];
  customer?: {
    name?: string;
    phone?: string;
  } | null;
}

export interface SaleReturnSummary {
  id: string;
  returnNumber: string;
  originalSaleId: string;
  branchId: string;
  cashierId?: string;
  reason?: string;
  totalRefund: number | string;
  refundMethod: string;
  createdAt: string;
  originalSale?: {
    invoiceNumber: string;
    grandTotal: number | string;
  };
  items?: Array<{
    id: string;
    quantity: number;
    refundAmount: number | string;
    condition: 'RESTOCKABLE' | 'DAMAGED';
    isDamaged: boolean;
    batch?: {
      batchNumber: string;
      medicine?: {
        tradeName: string;
        barcode?: string;
      };
    };
  }>;
}

export const returnsApi = {
  findSaleForReturn: (invoiceNumber: string): Promise<SaleForReturn> =>
    axios.get(`/api/returns/sale/${encodeURIComponent(invoiceNumber.trim())}`).then((res) => res.data),

  createReturn: (payload: CreateReturnPayload) =>
    axios.post('/api/returns/create', payload).then((res) => res.data),

  getAll: (params?: { branchId?: string; from?: string; to?: string; page?: number; limit?: number }): Promise<{
    items: SaleReturnSummary[];
    total: number;
    page: number;
    limit: number;
  }> => axios.get('/api/returns', { params }).then((res) => res.data),

  getById: (id: string): Promise<SaleReturnSummary> =>
    axios.get(`/api/returns/${id}`).then((res) => res.data),
};
