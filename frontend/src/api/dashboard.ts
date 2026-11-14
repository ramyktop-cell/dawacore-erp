import axios from 'axios';

export interface DashboardOverview {
  kpis: Array<{
    title: string;
    value: number;
    icon: string;
    color: string;
  }>;
  salesChart: {
    labels: string[];
    datasets: Array<{
      label: string;
      data: number[];
      backgroundColor: string;
      borderColor: string;
    }>;
    weeklyTrend: Array<{ date: string; day: string; sales: number }>;
  };
  expenseChart: {
    labels: string[];
    data: number[];
    colors: string[];
  };
  recentActivities: Array<{
    id: string;
    type: 'SALE' | 'EXPENSE';
    number: string;
    amount: number;
    date: string;
    status: string;
    customerName?: string;
    cashierName?: string;
    description?: string;
  }>;
  alerts: Array<{
    type: string;
    title: string;
    description: string;
    severity: string;
    link: string;
  }>;
  pendingApprovals: {
    count: number;
    items: Array<{
      id: string;
      expenseNumber: string;
      amount: number;
      expenseType: string;
      account?: { name: string; code?: string };
      branch?: { name: string };
      creator?: { name: string };
      createdAt: string;
    }>;
  };
  openShifts: number;

  // الحقول التوافقية
  summary: {
    salesToday: number;
    salesMonth: number;
    expensesToday: number;
    invoicesCount: number;
    totalCustomerDebt: number;
    totalSupplierDebt: number;
    expiringSoon: number;
    pendingExpensesCount: number;
    pendingExpensesAmount: number;
  };
  payments: Record<string, number>;
  weeklyTrend: Array<{ date: string; day: string; sales: number }>;
  lowStock: Array<{
    id: string;
    medicine: string;
    scientificName: string;
    quantity: number;
    expiryDate: string;
  }>;
  recentSales: Array<{
    id: string;
    invoiceNumber: string;
    cashier: string;
    branch: string;
    customer: string;
    grandTotal: number;
    createdAt: string;
    itemsCount: number;
  }>;
  mainAccounts: Array<{
    code: string;
    name: string;
    balance: number;
  }>;
  activeShift: {
    id: string;
    shiftNumber: number;
    cashier: string;
    branch: string;
    openedAt: string;
    expectedCash: number;
  } | null;
}

export interface ReorderRecommendation {
  medicineId: string;
  code: string;
  name: string;
  category: string;
  currentStock: number;
  dailyVelocity: number;
  daysRemaining: number;
  minStockLevel: number;
  suggestedOrderQty: number;
  urgency: 'CRITICAL' | 'HIGH';
  estimatedBudget: number;
  bestSupplier: {
    id: string;
    name: string;
    phone: string;
    lastPrice: number;
  } | null;
  decisionPrompt: string;
}

export interface ExpiryRiskRecommendation {
  batchId: string;
  batchNumber: string;
  medicineId: string;
  tradeName: string;
  quantity: number;
  expiryDate: string;
  daysToExpiry: number;
  projectedSalesUntilExpiry: number;
  unsoldRiskQty: number;
  potentialLoss: number;
  costPrice: number;
  salePrice: number;
  suggestedMarkdownPercent: number;
  suggestedSalePrice: number;
  urgency: 'CRITICAL' | 'WARNING';
  decisionPrompt: string;
}

export interface DeadStockRecommendation {
  medicineId: string;
  code: string;
  name: string;
  category: string;
  currentStock: number;
  avgCost: number;
  frozenCapital: number;
  daysWithoutSales: number;
  suggestedAction: string;
}

export interface DssRecommendationsResult {
  executiveSummary: {
    urgentReorders: number;
    totalPotentialLoss: number;
    totalFrozenCapital: number;
    criticalExpiryBatches: number;
    deadItemsCount: number;
  };
  reorderRecommendations: ReorderRecommendation[];
  expiryRiskRecommendations: ExpiryRiskRecommendation[];
  deadStockRecommendations: DeadStockRecommendation[];
}

export interface PosSecurityAlert {
  id: string;
  companyId?: string;
  branchId?: string | null;
  userId: string;
  cashierName: string;
  shiftId?: string | null;
  alertType: 'CONSOLE_OPENED' | 'SHORTCUT_BLOCKED' | 'STORAGE_TAMPERED' | string;
  reason: string;
  cartItemsCount: number;
  cartTotal: number;
  acknowledged: boolean;
  acknowledgedAt?: string | null;
  acknowledgedBy?: string | null;
  ipAddress?: string;
  createdAt: string;
}

export interface PosSecurityAlertsResponse {
  unreadCount: number;
  alerts: PosSecurityAlert[];
}

export const dashboardApi = {
  get: (params?: { companyId?: string; branchId?: string; date?: string }): Promise<DashboardOverview> =>
    axios.get('/api/dashboard', { params }).then((res) => res.data),

  getOverview: (params?: { companyId?: string; branchId?: string }): Promise<DashboardOverview> =>
    axios.get('/api/dashboard/overview', { params }).then((res) => res.data),

  getDssRecommendations: (params?: { companyId?: string; branchId?: string }): Promise<DssRecommendationsResult> =>
    axios.get('/api/dashboard/dss-recommendations', { params }).then((res) => res.data),

  getSecurityAlerts: (params?: { companyId?: string; branchId?: string; limit?: number }): Promise<PosSecurityAlertsResponse> =>
    axios.get('/api/dashboard/security-alerts', { params }).then((res) => res.data),

  recordSecurityAlert: (payload: {
    companyId?: string;
    branchId?: string;
    userId?: string;
    cashierName?: string;
    shiftId?: string;
    alertType?: string;
    reason?: string;
    cartItemsCount?: number;
    cartTotal?: number;
  }) => axios.post('/api/dashboard/security-alerts', payload).then((res) => res.data),

  acknowledgeSecurityAlert: (id: string, managerName?: string) =>
    axios.post(`/api/dashboard/security-alerts/${id}/acknowledge`, { managerName }).then((res) => res.data),

  acknowledgeAllSecurityAlerts: (companyId?: string, managerName?: string) =>
    axios.post('/api/dashboard/security-alerts/acknowledge-all', { companyId, managerName }).then((res) => res.data),
};