import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardFiltersDto } from './dto/dashboard-filters.dto';
import { Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../auth/security.policy';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * الدالة الرئيسية المتوافقة مع الاستعلام الشامل ولوحة المدير التنفيذية
   */
  async getDashboardData(filters: DashboardFiltersDto, actor?: AuthenticatedUser) {
    const targetDate = filters.date ? new Date(filters.date) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const companyId = actor?.companyId || filters.companyId;
    if (!companyId) throw new BadRequestException('معرف الشركة مطلوب');
    const branchId = actor?.branchId || filters.branchId;
    const invoiceWhere: Prisma.SalesInvoiceWhereInput = {
      companyId,
      ...(branchId ? { branchId } : {}),
    };

    // 1. مؤشرات المبيعات اليومية
    const salesToday = await this.prisma.salesInvoice.aggregate({
      where: {
        ...invoiceWhere,
        createdAt: { gte: startOfDay, lte: endOfDay },
      },
      _sum: { netAmount: true, paidAmount: true, remainingAmount: true },
      _count: true,
    });

    // 2. مؤشرات المبيعات الشهرية
    const startOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
    const endOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59, 999);
    const salesMonth = await this.prisma.salesInvoice.aggregate({
      where: {
        ...invoiceWhere,
        createdAt: { gte: startOfMonth, lte: endOfMonth },
      },
      _sum: { netAmount: true },
      _count: true,
    });

    // 3. مصروفات اليوم المعتمدة
    const expensesToday = await this.prisma.expense.aggregate({
      where: {
        companyId,
        ...(branchId ? { branchId } : {}),
        status: 'APPROVED',
        date: { gte: startOfDay, lte: endOfDay },
      },
      _sum: { amount: true },
    });

    // 4. عدد فواتير اليوم
    const invoicesCount = salesToday._count || 0;

    // 5. توزيع المبيعات حسب طريقة السداد لليوم
    const invoicesToday = await this.prisma.salesInvoice.findMany({
      where: {
        ...invoiceWhere,
        createdAt: { gte: startOfDay, lte: endOfDay },
      },
      select: {
        paymentMethod: true,
        paidAmount: true,
        remainingAmount: true,
        netAmount: true,
      },
    });

    const paymentMap: Record<string, number> = {
      CASH: 0,
      BANK_TRANSFER: 0,
      CARD: 0,
      CREDIT: 0,
    };

    for (const inv of invoicesToday) {
      if (inv.paymentMethod === 'CASH') {
        paymentMap.CASH += Number(inv.paidAmount || 0);
      } else if (inv.paymentMethod === 'BANK_TRANSFER' || inv.paymentMethod === 'CARD' || (inv.paymentMethod as any) === 'TRANSFER') {
        paymentMap.BANK_TRANSFER += Number(inv.paidAmount || 0);
      } else if (inv.paymentMethod === 'CREDIT') {
        paymentMap.CREDIT += Number(inv.remainingAmount || inv.netAmount || 0);
      } else if (inv.paymentMethod === 'MIXED') {
        paymentMap.CASH += Number(inv.paidAmount || 0);
        paymentMap.CREDIT += Number(inv.remainingAmount || 0);
      }
    }

    // 6. تنبيهات المخزون (كميات منخفضة أقل من أو تساوي 10 وحدات)
    const lowStockBatches = await this.prisma.batch.findMany({
      where: {
        branchId: branchId || undefined,
        quantity: { lte: 10 },
        expiryDate: { gt: new Date() },
      },
      include: {
        medicine: { select: { tradeName: true, scientificName: true } },
      },
      take: 8,
      orderBy: { quantity: 'asc' },
    });

    // 7. الأدوية قريبة الانتهاء (خلال 90 يوماً)
    const ninetyDaysFromNow = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const expiringSoon = await this.prisma.batch.count({
      where: {
        branchId: branchId || undefined,
        expiryDate: { lte: ninetyDaysFromNow, gt: new Date() },
        quantity: { gt: 0 },
      },
    });

    // 8. آخر 5 فواتير مبيعات
    const recentSales = await this.prisma.salesInvoice.findMany({
      where: invoiceWhere,
      include: {
        user: { select: { name: true } },
        branch: { select: { name: true } },
        customer: { select: { name: true } },
        items: {
          include: { medicine: { select: { tradeName: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    // 9. أرصدة الحسابات الرئيسية في دليل الحسابات
    const mainAccounts = await this.prisma.account.findMany({
      where: {
        companyId,
        code: { in: ['1101', '1102', '1104', '1105', '2101', '4101', '5101', '1-1-01', '1-1-02', '1-1-03', '1-1-04', '2-1-01'] },
      },
      select: { code: true, name: true, balance: true, level: true, isLeaf: true },
      orderBy: { code: 'asc' },
    });

    // 10. إجمالي مديونيات العملاء والموردين
    const totalCustomerDebt = await this.prisma.customer.aggregate({
      where: {
        companyId,
        branchId: branchId || undefined,
        isActive: true,
      },
      _sum: { currentDebt: true },
    });

    const totalSupplierDebt = await this.prisma.supplier.aggregate({
      where: {
        companyId,
        branchId: branchId || undefined,
        isActive: true,
      },
      _sum: { currentDebt: true },
    });

    // 11. الوردية النشطة حالياً
    const activeShift = await this.prisma.shift.findFirst({
      where: {
        branchId: branchId || undefined,
        status: 'OPEN',
      },
      include: {
        user: { select: { name: true } },
        branch: { select: { name: true } },
      },
      orderBy: { openedAt: 'desc' },
    });

    const openShifts = await this.prisma.shift.count({
      where: {
        companyId,
        ...(branchId ? { branchId } : {}),
        status: 'OPEN',
      },
    });

    // 12. سندات الصرف المعلقة التي تنتظر اعتماد الإدارة
    const [pendingExpenses, pendingExpensesCount, pendingExpensesSum] = await Promise.all([
      this.prisma.expense.findMany({
        where: {
          companyId,
          ...(branchId ? { branchId } : {}),
          status: 'PENDING',
        },
        include: {
          account: { select: { name: true, code: true } },
          branch: { select: { name: true } },
          creator: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.prisma.expense.count({
        where: {
          companyId,
          ...(branchId ? { branchId } : {}),
          status: 'PENDING',
        },
      }),
      this.prisma.expense.aggregate({
        where: {
          companyId,
          ...(branchId ? { branchId } : {}),
          status: 'PENDING',
        },
        _sum: { amount: true },
      }),
    ]);

    // 13. حركة المبيعات لآخر 7 أيام (Trend Chart)
    const salesChart = await this.getSalesChartData(companyId, branchId, targetDate);

    // 14. توزيع المصروفات حسب النوع
    const expenseChart = await this.getExpenseChartData(companyId, branchId);

    // 15. آخر النشاطات المتكاملة (فواتير ومصروفات)
    const recentActivities = await this.getRecentActivities(companyId, branchId);

    // 16. التنبيهات الذكية
    const alerts = await this.getAlerts(companyId, branchId);

    // مصفوفة مؤشرات الأداء KPIs
    const kpis = [
      {
        title: 'مبيعات اليوم',
        value: Number(salesToday._sum.netAmount || 0),
        icon: 'ShoppingBag',
        color: 'violet',
      },
      {
        title: 'مبيعات الشهر',
        value: Number(salesMonth._sum.netAmount || 0),
        icon: 'TrendingUp',
        color: 'emerald',
      },
      {
        title: 'المستحقات على العملاء',
        value: Number(totalCustomerDebt._sum.currentDebt || 0),
        icon: 'Users',
        color: 'amber',
      },
      {
        title: 'مصروفات اليوم',
        value: Number(expensesToday._sum.amount || 0),
        icon: 'Wallet',
        color: 'rose',
      },
      {
        title: 'ورديات نشطة',
        value: openShifts,
        icon: 'Clock',
        color: 'blue',
      },
    ];

    return {
      // 1. هيكل الـ Overview الجديد المتقدم
      kpis,
      salesChart,
      expenseChart,
      recentActivities,
      alerts,
      pendingApprovals: {
        count: pendingExpensesCount,
        items: pendingExpenses,
      },
      openShifts,

      // 2. التوافق العكسي مع بطاقات ومخططات الصفحة الحالية
      summary: {
        salesToday: Number(salesToday._sum.netAmount || 0),
        salesMonth: Number(salesMonth._sum.netAmount || 0),
        expensesToday: Number(expensesToday._sum.amount || 0),
        invoicesCount,
        totalCustomerDebt: Number(totalCustomerDebt._sum.currentDebt || 0),
        totalSupplierDebt: Number(totalSupplierDebt._sum.currentDebt || 0),
        expiringSoon,
        pendingExpensesCount,
        pendingExpensesAmount: Number(pendingExpensesSum._sum.amount || 0),
      },
      payments: paymentMap,
      weeklyTrend: salesChart.weeklyTrend,
      lowStock: lowStockBatches.map((b) => ({
        id: b.id,
        medicine: b.medicine.tradeName,
        scientificName: b.medicine.scientificName || '',
        quantity: b.quantity,
        expiryDate: b.expiryDate,
      })),
      recentSales: recentSales.map((s) => ({
        id: s.id,
        invoiceNumber: s.invoiceNumber,
        cashier: s.user?.name || 'كاشير الفرع',
        branch: s.branch?.name || 'الفرع الرئيسي',
        customer: s.customer?.name || 'عميل نقدي مباشر',
        grandTotal: Number(s.netAmount),
        createdAt: s.createdAt,
        itemsCount: s.items.length,
      })),
      mainAccounts: mainAccounts.map((a) => ({
        code: a.code,
        name: a.name,
        balance: Number(a.balance),
      })),
      activeShift: activeShift
        ? {
            id: activeShift.id,
            shiftNumber: activeShift.shiftNumber,
            cashier: activeShift.user?.name || 'غير معروف',
            branch: activeShift.branch?.name || '',
            openedAt: activeShift.openedAt,
            expectedCash: Number(activeShift.expectedCash || 0),
          }
        : null,
    };
  }

  /**
   * واجهة مخصصة لطلب الـ Overview مباشرة
   */
  async getOverview(companyId: string, branchId?: string, actor?: AuthenticatedUser) {
    return this.getDashboardData({ companyId, branchId }, actor);
  }

  private async getSalesChartData(companyId: string, branchId?: string, baseDate: Date = new Date()) {
    const labels: string[] = [];
    const data: number[] = [];
    const weeklyTrend: Array<{ date: string; day: string; sales: number }> = [];

    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(baseDate);
      dayStart.setDate(dayStart.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);

      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);

      const dayName = dayStart.toLocaleDateString('ar-EG', { weekday: 'short' });
      const dateStr = dayStart.toISOString().split('T')[0];
      labels.push(dayName);

      const result = await this.prisma.salesInvoice.aggregate({
        where: {
          companyId,
          ...(branchId ? { branchId } : {}),
          createdAt: { gte: dayStart, lte: dayEnd },
        },
        _sum: { netAmount: true },
      });

      const daySales = Number(result._sum.netAmount || 0);
      data.push(daySales);
      weeklyTrend.push({
        date: dateStr,
        day: dayName,
        sales: daySales,
      });
    }

    return {
      labels,
      datasets: [
        {
          label: 'المبيعات اليومية',
          data,
          backgroundColor: 'rgba(139, 92, 246, 0.2)',
          borderColor: '#8B5CF6',
        },
      ],
      weeklyTrend,
    };
  }

  private async getExpenseChartData(companyId: string, branchId?: string) {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();
    const startOfMonth = new Date(currentYear, currentMonth, 1);

    const result = await this.prisma.expense.groupBy({
      by: ['expenseType'],
      where: {
        companyId,
        ...(branchId ? { branchId } : {}),
        status: 'APPROVED',
        date: { gte: startOfMonth },
      },
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
    });

    const colors = ['#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#EC4899'];

    return {
      labels: result.map((item) => item.expenseType),
      data: result.map((item) => Number(item._sum.amount || 0)),
      colors: colors.slice(0, result.length),
    };
  }

  private async getRecentActivities(companyId: string, branchId?: string) {
    const whereCondition = { companyId, ...(branchId ? { branchId } : {}) };

    const [recentSales, recentExpenses] = await Promise.all([
      this.prisma.salesInvoice.findMany({
        where: whereCondition,
        include: {
          customer: { select: { name: true } },
          user: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.prisma.expense.findMany({
        where: { ...whereCondition, status: 'APPROVED' },
        include: {
          account: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    const activities = [
      ...recentSales.map((s) => ({
        id: s.id,
        type: 'SALE' as const,
        number: s.invoiceNumber,
        amount: Number(s.netAmount),
        date: s.createdAt,
        status: 'مكتمل',
        customerName: s.customer?.name || 'نقدي',
        cashierName: s.user?.name,
      })),
      ...recentExpenses.map((e) => ({
        id: e.id,
        type: 'EXPENSE' as const,
        number: e.expenseNumber,
        amount: Number(e.amount),
        date: e.createdAt,
        status: e.status,
        description: e.description,
      })),
    ];

    return activities
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10);
  }

  private async getAlerts(companyId: string, branchId?: string) {
    const alerts: any[] = [];

    // 1. أدوية تقترب صلاحيتها (أقل من 30 يوماً)
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const nearExpiryCount = await this.prisma.batch.count({
      where: {
        ...(branchId ? { branchId } : {}),
        quantity: { gt: 0 },
        expiryDate: { lte: thirtyDaysFromNow, gt: new Date() },
      },
    });

    if (nearExpiryCount > 0) {
      alerts.push({
        type: 'NEAR_EXPIRY',
        title: 'تنبيه: أدوية قاربت على الانتهاء',
        description: `${nearExpiryCount} تشغيلة تنتهي صلاحيتها خلال أقل من 30 يوماً`,
        severity: 'medium',
        link: '/batches?nearExpiry=true',
      });
    }

    // 2. طلبات صرف معلقة
    const pendingExpensesCount = await this.prisma.expense.count({
      where: {
        companyId,
        ...(branchId ? { branchId } : {}),
        status: 'PENDING',
      },
    });

    if (pendingExpensesCount > 0) {
      alerts.push({
        type: 'PENDING_APPROVAL',
        title: 'طلبات صرف بانتظار الاعتماد',
        description: `يوجد ${pendingExpensesCount} سند صرف ينتظر اعتمادك`,
        severity: 'medium',
        link: '/expenses?status=PENDING',
      });
    }

    // 3. عملاء تجاوزوا سقف الائتمان (currentDebt > creditLimit)
    const rawCustomers = await this.prisma.customer.findMany({
      where: {
        companyId,
        isActive: true,
        creditLimit: { gt: 0 },
      },
      select: {
        id: true,
        currentDebt: true,
        creditLimit: true,
      },
    });

    const overLimitCount = rawCustomers.filter(
      (c) => Number(c.currentDebt) > Number(c.creditLimit),
    ).length;

    if (overLimitCount > 0) {
      alerts.push({
        type: 'CREDIT_LIMIT',
        title: 'تجاوز السقف الائتماني',
        description: `${overLimitCount} عميل تجاوزوا السقف الائتماني المحدد`,
        severity: 'high',
        link: '/customers?hasDebt=true',
      });
    }

    return alerts;
  }

  /**
   * محرك التوصيات الذكية لدعم اتخاذ القرار (DSS - Decision Support System)
   * يحلل حركة المبيعات الفعلية، الأرصدة، فترات الصلاحية، والمشتريات لتقديم قرارات فورية
   */
  async getDssRecommendations(companyId: string, branchId?: string, actor?: AuthenticatedUser) {
    companyId = actor?.companyId || companyId;
    if (!companyId) throw new BadRequestException('معرف الشركة مطلوب');
    branchId = actor?.branchId || branchId;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const ninetyDaysFuture = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    // 1. جلب كافة الأصناف مع تشغيلاتها ووحداتها وأحدث بنود مشترياتها
    const medicines = await this.prisma.medicine.findMany({
      include: {
        batches: {
          where: {
            ...(branchId ? { branchId } : {}),
            quantity: { gt: 0 },
          },
          orderBy: { expiryDate: 'asc' },
        },
        purchaseItems: {
          take: 3,
          orderBy: { purchaseOrder: { createdAt: 'desc' } },
          include: {
            purchaseOrder: {
              include: {
                supplier: { select: { id: true, name: true, phone: true } },
              },
            },
          },
        },
      },
    });

    // 2. تجميع كميات المبيعات لكل صنف خلال آخر 30 يوماً وآخر 60 يوماً
    const recentSales30 = await this.prisma.saleInvoiceItem.groupBy({
      by: ['medicineId'],
      where: {
        invoice: {
          companyId,
          ...(branchId ? { branchId } : {}),
          createdAt: { gte: thirtyDaysAgo },
        },
      },
      _sum: { quantity: true },
    });

    const recentSales60 = await this.prisma.saleInvoiceItem.groupBy({
      by: ['medicineId'],
      where: {
        invoice: {
          companyId,
          ...(branchId ? { branchId } : {}),
          createdAt: { gte: sixtyDaysAgo },
        },
      },
      _sum: { quantity: true },
    });

    const sales30Map = new Map<string, number>();
    for (const s of recentSales30) {
      sales30Map.set(s.medicineId, Number(s._sum.quantity || 0));
    }

    const sales60Map = new Map<string, number>();
    for (const s of recentSales60) {
      sales60Map.set(s.medicineId, Number(s._sum.quantity || 0));
    }

    // المصفوفات التي سنجمع فيها مخرجات التحليل
    const reorderRecommendations: any[] = [];
    const expiryRiskRecommendations: any[] = [];
    const deadStockRecommendations: any[] = [];

    let totalPotentialLoss = 0;
    let totalFrozenCapital = 0;
    let urgentReorderCount = 0;

    for (const med of medicines) {
      const currentStock = med.batches.reduce((sum, b) => sum + b.quantity, 0);
      const sold30 = sales30Map.get(med.id) || 0;
      const sold60 = sales60Map.get(med.id) || 0;

      // معدل الاستهلاك اليومي بناءً على آخر 30 يوماً
      const dailyVelocity = sold30 > 0 ? sold30 / 30 : 0;

      // متوسط سعر التكلفة من التشغيلات الحالية أو آخر عملية شراء
      const avgCost =
        med.batches.length > 0
          ? med.batches.reduce((sum, b) => sum + Number(b.costPrice), 0) / med.batches.length
          : med.purchaseItems[0]
          ? Number(med.purchaseItems[0].costPrice)
          : 0;

      // أفضل مورد تم التعامل معه سابقاً
      const bestSupplier = med.purchaseItems[0]?.purchaseOrder?.supplier
        ? {
            id: med.purchaseItems[0].purchaseOrder.supplier.id,
            name: med.purchaseItems[0].purchaseOrder.supplier.name,
            phone: med.purchaseItems[0].purchaseOrder.supplier.phone,
            lastPrice: Number(med.purchaseItems[0].costPrice),
          }
        : null;

      // ========================================================
      // أ) محرك الشراء الذكي وإعادة الطلب (Reorder Engine)
      // ========================================================
      const daysRemaining = dailyVelocity > 0 ? Math.round(currentStock / dailyVelocity) : (currentStock > 0 ? 999 : 0);

      // قرار الشراء: إذا كان الرصيد يغطي أقل من 7 أيام أو أقل من حد الأمان
      const isLowStock = currentStock <= med.minStockLevel;
      const isStockoutRisk = dailyVelocity > 0 && daysRemaining <= 7;

      if (isStockoutRisk || (isLowStock && dailyVelocity > 0) || (currentStock === 0 && sold60 > 0)) {
        urgentReorderCount++;
        // كمية التغطية المستهدفة لمدة 30 يوماً قادمة
        const targetDays = 30;
        const targetStock = Math.ceil(dailyVelocity * targetDays);
        const suggestedOrderQty = Math.max(targetStock - currentStock, med.minStockLevel || 10);

        reorderRecommendations.push({
          medicineId: med.id,
          code: med.code,
          name: med.tradeName,
          category: med.category,
          currentStock,
          dailyVelocity: Number(dailyVelocity.toFixed(2)),
          daysRemaining: daysRemaining > 999 ? 999 : daysRemaining,
          minStockLevel: med.minStockLevel,
          suggestedOrderQty,
          urgency: daysRemaining <= 3 || currentStock === 0 ? 'CRITICAL' : 'HIGH',
          estimatedBudget: Number((suggestedOrderQty * avgCost).toFixed(2)),
          bestSupplier,
          decisionPrompt:
            currentStock === 0
              ? `نفد المخزون تماماً وكان يحقق مبيعات ${sold30} في الشهر! يجب إصدار أمر توريد فوري.`
              : `المخزون الحالي يكفي لمدة ${daysRemaining} يوم فقط بمعدل بيع ${dailyVelocity.toFixed(1)} يومياً. يوصى بطلب ${suggestedOrderQty} وحدة لتغطية 30 يوماً.`,
        });
      }

      // ========================================================
      // ب) مستشار الصلاحية وتجنب الخسائر (Expiry Risk Advisor)
      // ========================================================
      for (const batch of med.batches) {
        const expiryDate = new Date(batch.expiryDate);
        if (expiryDate <= ninetyDaysFuture && expiryDate > now) {
          const daysToExpiry = Math.max(1, Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
          // التقدير الرياضي للمبيعات حتى انتهاء الصلاحية
          const projectedSalesUntilExpiry = Math.floor(dailyVelocity * daysToExpiry);
          const unsoldRiskQty = Math.max(0, batch.quantity - projectedSalesUntilExpiry);

          if (unsoldRiskQty > 0 || daysToExpiry <= 30) {
            const potentialLoss = Number((unsoldRiskQty * Number(batch.costPrice)).toFixed(2));
            totalPotentialLoss += potentialLoss;

            // تحديد نسبة الخصم المقترحة بناء على الأيام المتبقية
            let suggestedMarkdown = 15;
            if (daysToExpiry <= 30) suggestedMarkdown = 40;
            else if (daysToExpiry <= 60) suggestedMarkdown = 25;

            const originalPrice = Number(batch.salePrice);
            const discountedPrice = Number((originalPrice * (1 - suggestedMarkdown / 100)).toFixed(2));

            expiryRiskRecommendations.push({
              batchId: batch.id,
              batchNumber: batch.batchNumber,
              medicineId: med.id,
              tradeName: med.tradeName,
              quantity: batch.quantity,
              expiryDate: batch.expiryDate,
              daysToExpiry,
              projectedSalesUntilExpiry,
              unsoldRiskQty,
              potentialLoss,
              costPrice: Number(batch.costPrice),
              salePrice: originalPrice,
              suggestedMarkdownPercent: suggestedMarkdown,
              suggestedSalePrice: discountedPrice,
              urgency: daysToExpiry <= 30 ? 'CRITICAL' : 'WARNING',
              decisionPrompt:
                daysToExpiry <= 30
                  ? `باقي ${daysToExpiry} يوماً فقط! الكمية المهددة بالتلف ${unsoldRiskQty} وحدة بخسارة متوقعة ${potentialLoss} ج.م. القرار: تفعيل خصم تصفية فوري بنسبة ${suggestedMarkdown}%.`
                  : `معدل التصريف بطيء لن يستوعب كامل الدفعة. القرار: خفض السعر إلى ${discountedPrice} ج.م أو الاتفاق مع المورد على الاسترجاع.`,
            });
          }
        }
      }

      // ========================================================
      // ج) محلل رأس المال المجمد في البضاعة الراكدة (Dead Capital)
      // ========================================================
      if (currentStock > 0 && sold60 === 0) {
        const frozenValue = Number((currentStock * avgCost).toFixed(2));
        totalFrozenCapital += frozenValue;

        deadStockRecommendations.push({
          medicineId: med.id,
          code: med.code,
          name: med.tradeName,
          category: med.category,
          currentStock,
          avgCost: Number(avgCost.toFixed(2)),
          frozenCapital: frozenValue,
          daysWithoutSales: 60,
          suggestedAction:
            frozenValue > 500
              ? 'إنشاء حزمة عروض ترويجية (Bundle) مع أصناف سريعة الحركة، أو تحويل المخزون لفرع ذي كثافة أعلى.'
              : 'تخفيض هامش الربح للبيع بسعر التكلفة لاستعادة السيولة النقدية فوراً وتجنب حبس رأس المال.',
        });
      }
    }

    // ترتيب التوصيات حسب الأهمية القصوى
    reorderRecommendations.sort((a, b) => (a.daysRemaining - b.daysRemaining));
    expiryRiskRecommendations.sort((a, b) => b.potentialLoss - a.potentialLoss);
    deadStockRecommendations.sort((a, b) => b.frozenCapital - a.frozenCapital);

    return {
      executiveSummary: {
        urgentReorders: urgentReorderCount,
        totalPotentialLoss: Number(totalPotentialLoss.toFixed(2)),
        totalFrozenCapital: Number(totalFrozenCapital.toFixed(2)),
        criticalExpiryBatches: expiryRiskRecommendations.filter((e) => e.urgency === 'CRITICAL').length,
        deadItemsCount: deadStockRecommendations.length,
      },
      reorderRecommendations: reorderRecommendations.slice(0, 15),
      expiryRiskRecommendations: expiryRiskRecommendations.slice(0, 15),
      deadStockRecommendations: deadStockRecommendations.slice(0, 15),
    };
  }

  /**
   * 🚨 تسجيل تنبيه أمني فوري عند فتح الكونسول (DevTools) أو محاولة التلاعب ببيانات الكاشير
   */
  async recordSecurityAlert(payload: {
    companyId?: string;
    branchId?: string;
    userId?: string;
    cashierName?: string;
    shiftId?: string;
    alertType?: string;
    reason?: string;
    cartItemsCount?: number;
    cartTotal?: number;
    ipAddress?: string;
    userAgent?: string;
  }) {
    let resolvedCompanyId = payload.companyId;
    if (resolvedCompanyId) {
      const exists = await this.prisma.company.findUnique({
        where: { id: resolvedCompanyId },
        select: { id: true },
      });
      if (!exists) resolvedCompanyId = undefined;
    }

    if (!resolvedCompanyId) {
      const firstCompany = await this.prisma.company.findFirst({
        select: { id: true },
      });
      if (!firstCompany) {
        return { recorded: false, reason: 'NO_COMPANY_FOUND' };
      }
      resolvedCompanyId = firstCompany.id;
    }

    const log = await this.prisma.auditLog.create({
      data: {
        companyId: resolvedCompanyId,
        branchId: payload.branchId || null,
        userId: payload.userId || 'pos-cashier',
        action: 'POS_SECURITY_ALERT',
        entityType: 'POS_TERMINAL',
        entityId: payload.shiftId || payload.branchId || 'POS-1',
        ipAddress: payload.ipAddress || '127.0.0.1',
        userAgent: payload.userAgent || 'Browser',
        changes: {
          alertType: payload.alertType || 'CONSOLE_OPENED',
          reason: payload.reason || 'تم رصد فتح نافذة المطورين (Console / DevTools) في شاشة نقاط البيع',
          cashierName: payload.cashierName || payload.userId || 'كاشير نقطة البيع',
          shiftId: payload.shiftId || null,
          cartItemsCount: Number(payload.cartItemsCount || 0),
          cartTotal: Number(payload.cartTotal || 0),
          acknowledged: false,
          acknowledgedAt: null,
          acknowledgedBy: null,
        },
      },
    });

    return {
      recorded: true,
      alert: this.mapAuditLogToSecurityAlert(log),
    };
  }

  /**
   * 🔔 جلب قائمة التنبيهات الأمنية الخاصة بنقاط البيع للمدير
   */
  async getSecurityAlerts(companyId?: string, branchId?: string, limit = 30) {
    const where: Prisma.AuditLogWhereInput = {
      action: 'POS_SECURITY_ALERT',
      ...(branchId ? { branchId } : {}),
    };

    if (companyId) {
      const exists = await this.prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true },
      });
      if (exists) {
        where.companyId = companyId;
      }
    }

    const logs = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const alerts = logs.map((l) => this.mapAuditLogToSecurityAlert(l));
    const unreadCount = alerts.filter((a) => !a.acknowledged).length;

    return {
      unreadCount,
      alerts,
    };
  }

  /**
   * ✅ تأكيد مراجعة تنبيه أمني واحد من قبل المدير
   */
  async acknowledgeSecurityAlert(id: string, managerName?: string) {
    const existing = await this.prisma.auditLog.findUnique({ where: { id } });
    if (!existing) return { success: false };

    const currentChanges =
      existing.changes && typeof existing.changes === 'object'
        ? (existing.changes as Record<string, any>)
        : {};

    const updated = await this.prisma.auditLog.update({
      where: { id },
      data: {
        changes: {
          ...currentChanges,
          acknowledged: true,
          acknowledgedAt: new Date().toISOString(),
          acknowledgedBy: managerName || 'المدير',
        },
      },
    });

    return {
      success: true,
      alert: this.mapAuditLogToSecurityAlert(updated),
    };
  }

  /**
   * ✅ تأكيد مراجعة جميع التنبيهات الأمنية غير المقروءة
   */
  async acknowledgeAllSecurityAlerts(companyId?: string, managerName?: string) {
    const logs = await this.prisma.auditLog.findMany({
      where: {
        action: 'POS_SECURITY_ALERT',
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const nowIso = new Date().toISOString();
    let updatedCount = 0;

    for (const log of logs) {
      const changes =
        log.changes && typeof log.changes === 'object'
          ? (log.changes as Record<string, any>)
          : {};
      if (!changes.acknowledged) {
        await this.prisma.auditLog.update({
          where: { id: log.id },
          data: {
            changes: {
              ...changes,
              acknowledged: true,
              acknowledgedAt: nowIso,
              acknowledgedBy: managerName || 'المدير',
            },
          },
        });
        updatedCount++;
      }
    }

    return { success: true, updatedCount };
  }

  private mapAuditLogToSecurityAlert(log: any) {
    const changes =
      log.changes && typeof log.changes === 'object'
        ? (log.changes as Record<string, any>)
        : {};
    return {
      id: log.id,
      companyId: log.companyId,
      branchId: log.branchId,
      userId: log.userId,
      cashierName: changes.cashierName || log.userId || 'كاشير نقطة البيع',
      shiftId: changes.shiftId || log.entityId,
      alertType: changes.alertType || 'CONSOLE_OPENED',
      reason:
        changes.reason ||
        'تم رصد فتح نافذة المطورين (Console / DevTools) في شاشة نقاط البيع',
      cartItemsCount: Number(changes.cartItemsCount || 0),
      cartTotal: Number(changes.cartTotal || 0),
      acknowledged: Boolean(changes.acknowledged),
      acknowledgedAt: changes.acknowledgedAt || null,
      acknowledgedBy: changes.acknowledgedBy || null,
      ipAddress: log.ipAddress,
      createdAt: log.createdAt,
    };
  }

  /**
   * 🕵️‍♂️ تسجيل حركة تصفح شاشة أو تسجيل دخول/خروج للمستخدم مع نوع الجهاز و IP
   */
  async trackUserActivity(payload: {
    companyId?: string;
    branchId?: string;
    userId?: string;
    userName?: string;
    userRole?: string;
    action?: string;
    actionLabel?: string;
    entityType?: string;
    entityId?: string;
    screenName?: string;
    path?: string;
    summary?: string;
    details?: any;
    ipAddress?: string;
    userAgent?: string;
  }) {
    let resolvedCompanyId = payload.companyId;
    if (resolvedCompanyId) {
      const exists = await this.prisma.company.findUnique({
        where: { id: resolvedCompanyId },
        select: { id: true },
      });
      if (!exists) resolvedCompanyId = undefined;
    }
    if (!resolvedCompanyId) {
      const firstCompany = await this.prisma.company.findFirst({ select: { id: true } });
      if (!firstCompany) return { recorded: false };
      resolvedCompanyId = firstCompany.id;
    }

    const cleanIp = String(payload.ipAddress || '127.0.0.1').split(',')[0].trim();
    const formattedIp =
      cleanIp === '::1' || cleanIp === '127.0.0.1' || cleanIp === '::ffff:127.0.0.1'
        ? '127.0.0.1 (الجهاز الرئيسي)'
        : cleanIp.replace('::ffff:', '');

    const ua = String(payload.userAgent || 'Browser');
    let os = 'Windows';
    if (ua.includes('Windows NT 10.0')) os = 'Windows 10/11';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
    else if (ua.includes('Mac OS')) os = 'macOS';
    else if (ua.includes('Linux')) os = 'Linux';

    let browser = 'Chrome';
    if (ua.includes('Edg/')) browser = 'Edge';
    else if (ua.includes('Firefox/')) browser = 'Firefox';
    else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Safari';

    const deviceSummary = `${os} — ${browser}`;

    await this.prisma.auditLog.create({
      data: {
        companyId: resolvedCompanyId,
        branchId: payload.branchId || null,
        userId: payload.userId || 'user',
        action: payload.action || 'SCREEN_VIEW',
        entityType: payload.entityType || payload.screenName || 'تصفح الشاشات',
        entityId: payload.entityId || payload.path || '-',
        ipAddress: formattedIp,
        userAgent: ua,
        changes: {
          userName: payload.userName || payload.userId || 'مستخدم النظام',
          userRole: payload.userRole || 'USER',
          actionLabel: payload.actionLabel || 'دخول شاشة',
          screenName: payload.screenName || payload.entityType || '',
          path: payload.path || '',
          summary:
            payload.summary ||
            `دخل المستخدم إلى شاشة «${payload.screenName || payload.path || 'النظام'}»`,
          deviceSummary,
          inputData: payload.details || null,
        },
      },
    });

    return { recorded: true };
  }

  /**
   * 🕵️‍♂️ جلب سجل الرقابة الشامل ومتابعة حركات المستخدمين والأجهزة وعناوين IP
   */
  async getAuditLogs(filters: {
    companyId?: string;
    userId?: string;
    action?: string;
    entityType?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
  }) {
    const where: Prisma.AuditLogWhereInput = {};

    if (filters.userId && filters.userId !== 'ALL') {
      where.userId = filters.userId;
    }
    if (filters.action && filters.action !== 'ALL') {
      where.action = filters.action;
    }
    if (filters.entityType && filters.entityType !== 'ALL') {
      where.entityType = filters.entityType;
    }

    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) {
        const from = new Date(filters.dateFrom);
        from.setHours(0, 0, 0, 0);
        where.createdAt.gte = from;
      }
      if (filters.dateTo) {
        const to = new Date(filters.dateTo);
        to.setHours(23, 59, 59, 999);
        where.createdAt.lte = to;
      }
    }

    const take = Math.min(Math.max(Number(filters.limit || 120), 10), 500);

    const [logs, users] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
      }),
      this.prisma.user.findMany({
        select: { id: true, name: true, username: true, role: true },
      }),
    ]);

    const userMap = new Map<string, { name: string; username: string; role: string }>();
    for (const u of users) {
      userMap.set(u.id, u);
      userMap.set(u.username, u);
    }

    const mapped = logs.map((log) => {
      const ch =
        log.changes && typeof log.changes === 'object'
          ? (log.changes as Record<string, any>)
          : {};
      const matchedUser = userMap.get(log.userId);
      const userName =
        ch.userName ||
        ch.cashierName ||
        matchedUser?.name ||
        matchedUser?.username ||
        log.userId ||
        'مستخدم النظام';
      const userRole = ch.userRole || matchedUser?.role || 'USER';

      let actionLabel = ch.actionLabel || log.action;
      if (log.action === 'POS_SECURITY_ALERT') actionLabel = '🚨 تنبيه أمني / فتح الكونسول';
      else if (log.action === 'SCREEN_VIEW') actionLabel = '🖥️ دخول وتصفح شاشة';
      else if (log.action === 'USER_LOGIN') actionLabel = '🔑 تسجيل دخول';
      else if (log.action === 'USER_LOGOUT') actionLabel = '🚪 تسجيل خروج';
      else if (log.action === 'POS_SALE' || log.action === 'SALE_CREATED')
        actionLabel = '🛒 إصدار فاتورة مبيعات';
      else if (log.action === 'CREATE_RECORD') actionLabel = '➕ إدخال / إضافة جديدة';
      else if (log.action === 'UPDATE_RECORD') actionLabel = '✏️ تعديل بيانات';
      else if (log.action === 'DELETE_RECORD') actionLabel = '🗑️ حذف سجل';

      const summary =
        ch.summary ||
        ch.reason ||
        `${actionLabel} في (${log.entityType}) — المعرف: ${log.entityId}`;

      const ua = String(log.userAgent || '');
      let deviceSummary = ch.deviceSummary || '';
      if (!deviceSummary) {
        if (ua.includes('Windows')) deviceSummary = 'Windows — متصفح سطح مكتب';
        else if (ua.includes('Android')) deviceSummary = 'Android — هاتف/تابلت';
        else deviceSummary = ua ? ua.slice(0, 45) : 'الجهاز المحلي';
      }

      return {
        id: log.id,
        userId: log.userId,
        userName,
        userRole,
        branchId: log.branchId,
        action: log.action,
        actionLabel,
        entityType: log.entityType,
        entityId: log.entityId,
        summary,
        path: ch.path || '',
        method: ch.method || '',
        ipAddress: log.ipAddress || '127.0.0.1 (الجهاز الرئيسي)',
        userAgent: log.userAgent || '',
        deviceSummary,
        inputData: ch.inputData || ch,
        resultSummary: ch.resultSummary || null,
        createdAt: log.createdAt,
      };
    });

    const searchQ = (filters.search || '').trim().toLowerCase();
    const filtered = searchQ
      ? mapped.filter(
          (item) =>
            item.userName.toLowerCase().includes(searchQ) ||
            item.userId.toLowerCase().includes(searchQ) ||
            item.summary.toLowerCase().includes(searchQ) ||
            item.entityType.toLowerCase().includes(searchQ) ||
            item.ipAddress.toLowerCase().includes(searchQ) ||
            item.actionLabel.toLowerCase().includes(searchQ),
        )
      : mapped;

    const uniqueUsers = new Set(filtered.map((i) => i.userName)).size;
    const uniqueIps = new Set(filtered.map((i) => i.ipAddress)).size;
    const securityAlertsCount = filtered.filter((i) => i.action === 'POS_SECURITY_ALERT').length;
    const mutationsCount = filtered.filter((i) =>
      ['CREATE_RECORD', 'UPDATE_RECORD', 'DELETE_RECORD', 'POS_SALE', 'SALE_CREATED'].includes(
        i.action,
      ),
    ).length;
    const screenViewsCount = filtered.filter((i) => i.action === 'SCREEN_VIEW').length;

    return {
      kpis: {
        totalLogs: filtered.length,
        uniqueUsers,
        uniqueIps,
        securityAlertsCount,
        mutationsCount,
        screenViewsCount,
      },
      usersList: users,
      items: filtered,
    };
  }
}
