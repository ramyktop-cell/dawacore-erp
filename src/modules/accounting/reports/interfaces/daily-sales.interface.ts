export interface DailySalesSummary {
  totalInvoicesCount: number;
  completedInvoicesCount: number;
  returnedInvoicesCount: number;
  grossSales: number;
  totalDiscounts: number;
  netSales: number;
  totalReturns: number;
  totalCollected: number;
}

export interface PaymentBreakdown {
  method: string;
  amount: number;
  percentage: number;
}

export interface CashierSalesSummary {
  cashierId: string;
  cashierName: string;
  invoicesCount: number;
  totalSales: number;
  returns: number;
  netTotal: number;
}

export interface DailySalesInvoice {
  saleId: string;
  invoiceNumber: string;
  createdAt: string;
  cashierName: string;
  customerName: string;
  paymentMethod: string;
  subTotal: number;
  discountTotal: number;
  grandTotal: number;
  paidAmount: number;
  status: string;
  itemsCount: number;
}

export interface HourlySales {
  hour: number;
  hourLabel: string;
  invoicesCount: number;
  totalSales: number;
}

export interface TopProductItem {
  medicineId: string;
  tradeName: string;
  totalQuantity: number;
  totalSales: number;
}

export interface DailySalesResponse {
  meta: {
    title: string;
    companyName: string;
    branchName?: string;
    fromDate: string;
    toDate: string;
    generatedAt: Date;
    generatedBy: { id: string; name: string };
  };
  summary: DailySalesSummary;
  paymentBreakdown: PaymentBreakdown[];
  cashierBreakdown: CashierSalesSummary[];
  hourlyBreakdown: HourlySales[];
  topProducts: TopProductItem[];
  invoices: DailySalesInvoice[];
}
