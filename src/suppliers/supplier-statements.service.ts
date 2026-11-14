import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/security.policy';
import { SupplierStatementQueryDto, CreditorsReportQueryDto } from './dto/supplier-statement-query.dto';
import { SupplierDocumentsPdfService } from '../shared/supplier-documents/supplier-documents-pdf.service';
import { DateTzUtil } from '../shared/report-kit/utils/date-tz.util';
import { Prisma } from '@prisma/client';

@Injectable()
export class SupplierStatementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: SupplierDocumentsPdfService,
  ) {}

  private validateUuid(id: string, fieldName = 'المعرف') {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!id || !uuidRegex.test(id)) {
      throw new BadRequestException(`${fieldName} غير صالح`);
    }
  }

  /**
   * استخراج كشف حساب المورد التراكمي والتفصيلي مع الفلاتر ونطاق الأمان
   */
  async getSupplierStatement(supplierId: string, query: SupplierStatementQueryDto, actor: AuthenticatedUser) {
    if (!actor || !actor.companyId) {
      throw new BadRequestException('نطاق الشركة مطلوب للوصول إلى كشف الحساب');
    }

    this.validateUuid(supplierId, 'معرف المورد');

    if (query.from && query.to && query.from > query.to) {
      throw new BadRequestException('تاريخ بداية الفترة لا يمكن أن يكون بعد تاريخ النهاية');
    }

    // تطبيق نطاق الشركة والفرع مباشرة في الاستعلام قبل تحميل البيانات
    const supplierWhere: Prisma.SupplierWhereInput = {
      id: supplierId,
      companyId: actor.companyId,
    };
    if (actor.branchId) {
      supplierWhere.branchId = actor.branchId;
    }

    const supplier = await this.prisma.supplier.findFirst({
      where: supplierWhere,
      include: {
        company: { select: { id: true, name: true, currency: true, timezone: true } },
        branch: { select: { id: true, name: true, code: true } },
      },
    });

    if (!supplier) {
      throw new NotFoundException('المورد غير موجود أو لا تملك صلاحية الوصول إليه');
    }

    const effectiveBranchId = actor.branchId || query.branchId || undefined;
    if (query.branchId && query.branchId !== actor.branchId && actor.branchId) {
      throw new NotFoundException('الفرع المحدد خارج نطاق صلاحيات المستخدم');
    }

    let branchObj = supplier.branch;
    if (effectiveBranchId && effectiveBranchId !== supplier.branchId) {
      const b = await this.prisma.branch.findFirst({
        where: { id: effectiveBranchId, companyId: actor.companyId },
        select: { id: true, name: true, code: true },
      });
      if (!b) throw new NotFoundException('الفرع المحدد غير موجود أو لا يتبع الشركة');
      branchObj = b as any;
    }

    // تثبيت وقت مرجعي واحد للتقرير لمنع تسرب حركات مؤرخة لاحقاً
    const reportReferenceTime = new Date();
    const tz = supplier.company.timezone || 'Africa/Cairo';

    // تجهيز تواريخ التصفية وفق توقيت الشركة
    let fromDate: Date | undefined;
    let toDate: Date | undefined;
    const hasExplicitTo = Boolean(query.to);

    if (query.from) {
      fromDate = DateTzUtil.dayStart(query.from, tz);
    }
    if (query.to) {
      toDate = DateTzUtil.dayEnd(query.to, tz);
    } else {
      // في عرض «حتى الآن» دون to صريح، الحد الأقصى هو الوقت المرجعي الحالي
      toDate = reportReferenceTime;
    }

    // 1. تحديد حسابات الذمم الدائنة المعتمدة للمورد (BranchAccountMapping أو حساب 2101 للشركة)
    const apAccountIds = new Set<string>();
    if (supplier.branchId) {
      try {
        const mapping = await this.prisma.branchAccountMapping.findUnique({
          where: { branchId: supplier.branchId },
          select: { apAccountId: true },
        });
        if (mapping?.apAccountId) {
          apAccountIds.add(mapping.apAccountId);
        }
      } catch {
        // Continue fallback
      }
    }
    try {
      const standardAp = await this.prisma.account.findFirst({
        where: {
          companyId: actor.companyId,
          OR: [
            { code: '2101' },
            { code: '2-1-01' },
            { code: { startsWith: '2101' } },
          ],
        },
        select: { id: true },
      });
      if (standardAp) {
        apAccountIds.add(standardAp.id);
      }
    } catch {
      // Continue
    }

    // 2. فحص الرصيد الافتتاحي الموثق من OpeningBalanceItem (POSTED فقط وله journalEntryId)
    let documentedOpening: {
      credit: Prisma.Decimal;
      debit: Prisma.Decimal;
      effectiveDate: Date;
      documentNumber: string;
      description?: string | null;
      journalEntryId?: string | null;
    } | null = null;

    let hasConflictingOpenings = false;
    try {
      const openingBalanceWhere: Prisma.OpeningBalanceWhereInput = {
        companyId: actor.companyId,
        status: 'POSTED',
        journalEntryId: { not: null },
      };
      if (effectiveBranchId) {
        openingBalanceWhere.branchId = effectiveBranchId;
      }

      const openingItems = await this.prisma.openingBalanceItem.findMany({
        where: {
          referenceType: 'SUPPLIER',
          referenceId: supplier.id,
          openingBalance: openingBalanceWhere,
        },
        include: {
          openingBalance: {
            select: {
              id: true,
              documentNumber: true,
              effectiveDate: true,
              journalEntryId: true,
              status: true,
            },
          },
        },
      });

      if (openingItems.length === 1) {
        const ob = openingItems[0];
        documentedOpening = {
          credit: new Prisma.Decimal(ob.credit || 0),
          debit: new Prisma.Decimal(ob.debit || 0),
          effectiveDate: new Date(ob.openingBalance.effectiveDate),
          documentNumber: ob.openingBalance.documentNumber || 'غير مسجل',
          description: ob.description || 'رصيد افتتاحي معتمد',
          journalEntryId: ob.openingBalance.journalEntryId,
        };
      } else if (openingItems.length > 1) {
        hasConflictingOpenings = true;
      }
    } catch {
      // OpeningBalanceItem not available or table missing
    }

    // 3. جلب فواتير المشتريات المستلمة المثبتة فقط (RECEIVED)
    const purchaseWhere: Prisma.PurchaseOrderWhereInput = {
      companyId: actor.companyId,
      supplierId: supplier.id,
      status: 'RECEIVED',
    };
    if (effectiveBranchId) {
      purchaseWhere.branchId = effectiveBranchId;
    }

    const purchases = await this.prisma.purchaseOrder.findMany({
      where: purchaseWhere,
      include: {
        items: {
          include: {
            medicine: { select: { tradeName: true } },
          },
        },
      },
      orderBy: [
        { receivedAt: 'asc' },
        { orderNumber: 'asc' },
      ],
    });

    // 4. جلب قيود اليومية المحاسبية المنسوبة لذمة المورد فقط
    const jlWhere: Prisma.JournalLineWhereInput = {
      supplierId: supplier.id,
      journalEntry: {
        companyId: actor.companyId,
        ...(effectiveBranchId ? { branchId: effectiveBranchId } : {}),
      },
    };
    if (apAccountIds.size > 0) {
      jlWhere.accountId = { in: Array.from(apAccountIds) };
    }

    const journalLines = await this.prisma.journalLine.findMany({
      where: jlWhere,
      include: {
        account: { select: { id: true, code: true, name: true, type: true } },
        journalEntry: true,
      },
      orderBy: [
        { journalEntry: { date: 'asc' } },
        { journalEntry: { entryNumber: 'asc' } },
      ],
    });

    type MovementRaw = {
      id: string;
      timestamp: number;
      dateStr: string;
      operationType: string;
      operationNumber: string;
      documentNumber: string;
      description: string;
      debit: Prisma.Decimal;
      credit: Prisma.Decimal;
      sortWeight: number; // 1: رصيد افتتاحي, 2: فاتورة مشتريات (دائن), 3: دفعة عند الشراء (مدين), 4: سداد/قيد
      itemsDetails?: any[];
      isSubRow?: boolean;
      supplierPaymentId?: string;
    };

    const allMovements: MovementRaw[] = [];
    let hasUndatedReceipts = false;
    const reviewOrders: Array<{ orderNumber: string; totalAmount: number; issue: string }> = [];

    // إدراج الرصيد الافتتاحي الموثق إن وقع تاريخه قبل أو داخل النطاق
    if (documentedOpening) {
      const opTimeMs = documentedOpening.effectiveDate.getTime();
      const opDateStr = DateTzUtil.formatInTz(documentedOpening.effectiveDate, tz, 'yyyy-MM-dd');
      allMovements.push({
        id: `OB-${documentedOpening.documentNumber}`,
        timestamp: opTimeMs,
        dateStr: opDateStr,
        operationType: 'رصيد افتتاحي',
        operationNumber: documentedOpening.documentNumber,
        documentNumber: documentedOpening.documentNumber,
        description: documentedOpening.description || 'رصيد افتتاحي موثق',
        debit: documentedOpening.debit,
        credit: documentedOpening.credit,
        sortWeight: 1,
      });
    }

    // تحويل فواتير المشتريات إلى حركات
    for (const po of purchases) {
      if (!po.receivedAt) {
        hasUndatedReceipts = true;
        reviewOrders.push({
          orderNumber: po.orderNumber,
          totalAmount: Number(po.totalAmount),
          issue: 'طلب شراء مستلم ولكن بدون تاريخ استلام موثق',
        });
        continue;
      }

      const recDate = po.receivedAt;
      const timeMs = new Date(recDate).getTime();
      // استبعاد أي حركة بعد الوقت المرجعي للتقرير
      if (timeMs > toDate.getTime()) {
        continue;
      }

      const dateStr = DateTzUtil.formatInTz(new Date(recDate), tz, 'yyyy-MM-dd');
      const invoiceRef = po.invoiceNumber || po.orderNumber || 'غير مسجل';
      const invoiceLabel = po.invoiceNumber ? `فاتورة #${po.invoiceNumber}` : `أمر #${po.orderNumber}`;

      const itemsDetails = (po.items || []).map((it: any) => ({
        tradeName: it.medicine?.tradeName || 'صنف غير محدد',
        quantity: Number(it.quantity),
        unitType: it.unitType || 'BOX',
      }));

      const totalAmtDec = new Prisma.Decimal(po.totalAmount || 0);
      const paidAmtDec = new Prisma.Decimal(po.paidAmount || 0);

      const itemsSummaryText = itemsDetails.length > 0
        ? itemsDetails.map((i) => `${i.tradeName} (${i.quantity} ${i.unitType})`).join(' - ')
        : '';
      const invoiceDesc = itemsSummaryText
        ? `فاتورة مشتريات (${invoiceLabel}) - ${itemsSummaryText}`
        : `فاتورة مشتريات (${invoiceLabel})`;

      // صف 1: فاتورة مشتريات (دائن)
      allMovements.push({
        id: `PO-${po.id}-CREDIT`,
        timestamp: timeMs,
        dateStr,
        operationType: 'فاتورة مشتريات',
        operationNumber: invoiceRef,
        documentNumber: invoiceRef,
        description: invoiceDesc,
        debit: new Prisma.Decimal(0),
        credit: totalAmtDec,
        sortWeight: 2,
        itemsDetails,
      });

      // صف 2: دفعة عند الشراء (مدين) إن وجدت
      if (paidAmtDec.greaterThan(0)) {
        allMovements.push({
          id: `PO-${po.id}-DEBIT`,
          timestamp: timeMs,
          dateStr,
          operationType: 'دفعة عند الشراء',
          operationNumber: invoiceRef,
          documentNumber: invoiceRef,
          description: `سداد أصلي نقدي/بنكي عند الشراء (مرجع الفاتورة)`,
          debit: paidAmtDec,
          credit: new Prisma.Decimal(0),
          sortWeight: 3,
          isSubRow: true,
        });
      }
    }

    // تحويل القيود المحاسبية المستقلة
    const purchaseOrderIds = new Set(purchases.map((p) => p.id));
    for (const line of journalLines) {
      // التحقق من حساب الذمة المعتمد
      if (apAccountIds.size > 0 && !apAccountIds.has(line.accountId)) {
        continue;
      }

      // منع احتساب قيد الافتتاح مرتين مع مستند OpeningBalanceItem
      if (documentedOpening?.journalEntryId && line.journalEntryId === documentedOpening.journalEntryId) {
        continue;
      }

      // منع التكرار إذا كان القيد صادراً تلقائياً عن نفس فاتورة الشراء
      if (
        line.journalEntry.source === 'PURCHASE' &&
        line.journalEntry.referenceId &&
        purchaseOrderIds.has(line.journalEntry.referenceId)
      ) {
        continue;
      }

      const timeMs = new Date(line.journalEntry.date).getTime();
      if (timeMs > toDate.getTime()) {
        continue;
      }

      const dateStr = DateTzUtil.formatInTz(new Date(line.journalEntry.date), tz, 'yyyy-MM-dd');
      const debitVal = new Prisma.Decimal(line.debit || 0);
      const creditVal = new Prisma.Decimal(line.credit || 0);
      const entryRef = line.journalEntry.entryNumber || 'غير مسجل';

      if (debitVal.greaterThan(0)) {
        allMovements.push({
          id: `JL-${line.id}-DEBIT`,
          timestamp: timeMs,
          dateStr,
          operationType: 'سداد للمورد',
          operationNumber: entryRef,
          documentNumber: entryRef,
          description: line.description || line.notes || `سداد لحساب المورد (قيد محاسبي)`,
          debit: debitVal,
          credit: new Prisma.Decimal(0),
          sortWeight: 4,
          supplierPaymentId: line.journalEntry.source === 'SUPPLIER_PAYMENT'
            ? line.journalEntry.referenceId || undefined
            : undefined,
        });
      }
      if (creditVal.greaterThan(0)) {
        allMovements.push({
          id: `JL-${line.id}-CREDIT`,
          timestamp: timeMs,
          dateStr,
          operationType: 'استحقاق قيد',
          operationNumber: entryRef,
          documentNumber: entryRef,
          description: line.description || line.notes || `استحقاق دائن إضافي (قيد محاسبي)`,
          debit: new Prisma.Decimal(0),
          credit: creditVal,
          sortWeight: 2,
        });
      }
    }

    // فرز الحركات زمنياً بترتيب ثابت عند تساوي الوقت (الافتتاحي ثم الدائن ثم المدين ثم رقم العملية)
    allMovements.sort((a, b) => {
      if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
      if (a.sortWeight !== b.sortWeight) return a.sortWeight - b.sortWeight;
      return a.operationNumber.localeCompare(b.operationNumber);
    });

    // فصل حركات ما قبل الفترة وحركات الفترة
    let priorCreditDec = new Prisma.Decimal(0);
    let priorDebitDec = new Prisma.Decimal(0);
    const periodMovements: MovementRaw[] = [];

    for (const m of allMovements) {
      if (fromDate && m.timestamp < fromDate.getTime()) {
        priorCreditDec = priorCreditDec.plus(m.credit);
        priorDebitDec = priorDebitDec.plus(m.debit);
      } else if (m.timestamp <= toDate.getTime()) {
        periodMovements.push(m);
      }
    }

    // التحقق من إثبات رصيد أول المدة
    // إثبات الرصيد يشترط:
    // 1) عدم وجود تعارض في مستندات الافتتاح
    // 2) عدم وجود استلامات غير مؤرخة
    // 3) وجود افتتاحية موثقة POSTED أو بدء التاريخ من الصفر الموثق
    let isBeginningBalanceProven = false;
    let unprovenReason: string | null = null;

    if (hasConflictingOpenings) {
      isBeginningBalanceProven = false;
      unprovenReason = 'تعارض في المستندات الافتتاحية المسجلة';
    } else if (hasUndatedReceipts) {
      isBeginningBalanceProven = false;
      unprovenReason = 'توجد أوامر شراء مستلمة غير مؤرخة تؤثر في تسلسل الرصيد';
    } else if (documentedOpening) {
      // افتتاحية موثقة ومعتمدة
      isBeginningBalanceProven = true;
    } else {
      // لا توجد افتتاحية موثقة
      // تطابق الحركات مع رصيد البطاقة لا يثبت الافتتاحية بحسب العقد
      isBeginningBalanceProven = false;
      unprovenReason = 'لا يوجد مستند رصيد افتتاحي معتمد وموثق للمورد';
    }

    const beginningBalanceDec = priorCreditDec.minus(priorDebitDec);
    let runningBalanceDec = beginningBalanceDec;
    let periodTotalCreditDec = new Prisma.Decimal(0);
    let periodTotalDebitDec = new Prisma.Decimal(0);

    const formattedItems = periodMovements.map((m) => {
      periodTotalCreditDec = periodTotalCreditDec.plus(m.credit);
      periodTotalDebitDec = periodTotalDebitDec.plus(m.debit);
      runningBalanceDec = runningBalanceDec.plus(m.credit).minus(m.debit);
      return {
        date: m.dateStr,
        operationType: m.operationType,
        operationNumber: m.operationNumber,
        documentNumber: m.documentNumber,
        description: m.description,
        debit: Number(m.debit.toFixed(2)),
        credit: Number(m.credit.toFixed(2)),
        balance: isBeginningBalanceProven ? Number(runningBalanceDec.toFixed(2)) : null,
        itemsDetails: m.itemsDetails,
        isSubRow: m.isSubRow,
        supplierPaymentId: m.supplierPaymentId,
      };
    });

    const netMovementDec = periodTotalCreditDec.minus(periodTotalDebitDec);
    const endingBalanceDec = beginningBalanceDec.plus(netMovementDec);
    const isEndingBalanceProven = isBeginningBalanceProven && !hasUndatedReceipts && !hasConflictingOpenings;

    const recordedCurrentDebt = Number(new Prisma.Decimal(supplier.currentDebt || 0).toFixed(2));

    // S01: سياسة محافظة لمطابقة الرصيد الحالي
    // المقارنة مع Supplier.currentDebt متاحة فقط في عرض «حتى الآن» دون to صريح
    const isBranchScopeMatched = !effectiveBranchId || effectiveBranchId === supplier.branchId;
    const canCompareWithCurrent = !hasExplicitTo && isBranchScopeMatched && isEndingBalanceProven;

    let variance: number | null = null;
    let varianceSuppressedReason: string | null = null;

    if (canCompareWithCurrent) {
      variance = Number(new Prisma.Decimal(supplier.currentDebt || 0).minus(endingBalanceDec).toFixed(2));
    } else {
      if (hasExplicitTo) {
        varianceSuppressedReason = 'حُجب فرق المطابقة: محدد بتاريخ نهاية (المقارنة مع الرصيد اللحظي متاحة فقط في عرض حتى الآن دون تحديد تاريخ نهاية)';
      } else if (!isEndingBalanceProven) {
        varianceSuppressedReason = unprovenReason || 'حُجب فرق المطابقة: رصيد الإقفال غير مثبت (غير متحقق)';
      } else if (!isBranchScopeMatched) {
        varianceSuppressedReason = 'حُجب فرق المطابقة: نطاق الفرع المصفى لا يطابق فرع المورد المسجل';
      }
    }

    return {
      supplier: {
        id: supplier.id,
        name: supplier.name,
        companyName: supplier.companyName,
        phone: supplier.phone,
        taxNumber: supplier.taxNumber,
        address: supplier.address,
        branchName: branchObj?.name,
      },
      company: {
        id: supplier.company.id,
        name: supplier.company.name,
        currency: supplier.company.currency,
        timezone: supplier.company.timezone,
      },
      branch: {
        id: branchObj?.id,
        name: branchObj?.name,
        code: branchObj?.code,
      },
      period: {
        from: query.from || null,
        to: query.to || null,
      },
      summary: {
        beginningBalance: isBeginningBalanceProven ? Number(beginningBalanceDec.toFixed(2)) : null,
        isBeginningBalanceProven,
        totalCredit: Number(periodTotalCreditDec.toFixed(2)),
        totalDebit: Number(periodTotalDebitDec.toFixed(2)),
        netMovement: Number(netMovementDec.toFixed(2)),
        endingBalance: isEndingBalanceProven ? Number(endingBalanceDec.toFixed(2)) : null,
        isEndingBalanceProven,
        recordedCurrentDebt,
        canCompareWithCurrent,
        variance,
        varianceSuppressedReason,
      },
      reviewOrders,
      items: formattedItems,
    };
  }

  /**
   * تصدير كشف حساب المورد إلى PDF
   */
  async getSupplierStatementPdf(supplierId: string, query: SupplierStatementQueryDto, actor: AuthenticatedUser): Promise<{ buffer: Buffer; filename: string; unicodeFilename: string }> {
    const statement = await this.getSupplierStatement(supplierId, query, actor);
    const buffer = await this.pdfService.generateSupplierStatementPdf(statement);
    const safeAscii = `supplier-statement-${statement.supplier.id.slice(0, 8)}.pdf`;
    const unicodeFilename = `كشف_حساب_${(statement.supplier.name || 'المورد').replace(/\s+/g, '_')}.pdf`;
    return {
      buffer,
      filename: safeAscii,
      unicodeFilename,
    };
  }

  /**
   * تقرير أرصدة الدائنين والموردين مجمّعاً مع ملخص المطابقة ومعالجة الحدود والدفعات
   */
  async getCreditorsReport(query: CreditorsReportQueryDto, actor: AuthenticatedUser) {
    if (!actor || !actor.companyId) {
      throw new BadRequestException('نطاق الشركة مطلوب للوصول إلى تقرير الدائنين');
    }

    if (query.from && query.to && query.from > query.to) {
      throw new BadRequestException('تاريخ بداية الفترة لا يمكن أن يكون بعد تاريخ النهاية');
    }

    const effectiveBranchId = actor.branchId || query.branchId || undefined;
    if (query.branchId && query.branchId !== actor.branchId && actor.branchId) {
      throw new NotFoundException('الفرع المحدد خارج نطاق صلاحيات المستخدم');
    }

    const where: Prisma.SupplierWhereInput = { companyId: actor.companyId };
    if (effectiveBranchId) where.branchId = effectiveBranchId;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search } },
        { companyName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const totalSuppliersCount = await this.prisma.supplier.count({ where });
    const MAX_REPORT_SUPPLIERS = 300;
    if (totalSuppliersCount > MAX_REPORT_SUPPLIERS) {
      throw new BadRequestException(`تجاوز عدد الموردين المطابقين الحد الأقصى للمعالجة في تقرير واحد (${MAX_REPORT_SUPPLIERS} مورد). يرجى تضييق النطاق أو التصفية بالفرع.`);
    }

    const suppliers = await this.prisma.supplier.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true, code: true } },
      },
      orderBy: { name: 'asc' },
    });

    const company = await this.prisma.company.findUnique({
      where: { id: actor.companyId },
      select: { id: true, name: true, currency: true, timezone: true },
    });

    let branchObj = null;
    if (effectiveBranchId) {
      branchObj = await this.prisma.branch.findFirst({
        where: { id: effectiveBranchId, companyId: actor.companyId },
        select: { id: true, name: true, code: true },
      });
    }

    let totalCreditAll = new Prisma.Decimal(0);
    let totalDebitAll = new Prisma.Decimal(0);
    let totalNetMovementAll = new Prisma.Decimal(0);
    let totalClosingBalanceAll = new Prisma.Decimal(0);
    let totalRecordedDebtAll = new Prisma.Decimal(0);
    let totalVarianceAll = new Prisma.Decimal(0);
    let incompleteCount = 0;
    let unprovenCount = 0;
    let allComparable = true;

    const hasExplicitTo = Boolean(query.to);

    // معالجة الموردين على دفعات متتالية (BATCH_SIZE = 25)
    const BATCH_SIZE = 25;
    const supplierRows: any[] = [];

    for (let i = 0; i < suppliers.length; i += BATCH_SIZE) {
      const batch = suppliers.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (s) => {
          const stmt = await this.getSupplierStatement(
            s.id,
            { from: query.from, to: query.to, branchId: effectiveBranchId },
            actor,
          );

          return {
            id: s.id,
            name: s.name,
            companyName: s.companyName,
            phone: s.phone,
            taxNumber: s.taxNumber,
            branchName: s.branch?.name,
            openingBalance: stmt.summary.beginningBalance,
            isOpeningBalanceProven: stmt.summary.isBeginningBalanceProven,
            totalCredit: stmt.summary.totalCredit,
            totalDebit: stmt.summary.totalDebit,
            periodNetMovement: stmt.summary.netMovement,
            closingBalance: stmt.summary.endingBalance,
            isClosingBalanceProven: stmt.summary.isEndingBalanceProven,
            recordedCurrentDebt: stmt.summary.recordedCurrentDebt,
            canCompareWithCurrent: stmt.summary.canCompareWithCurrent,
            variance: stmt.summary.variance,
            varianceSuppressedReason: stmt.summary.varianceSuppressedReason,
            items: query.type === 'detailed' ? stmt.items : undefined,
          };
        }),
      );

      for (const row of batchResults) {
        supplierRows.push(row);
        totalCreditAll = totalCreditAll.plus(row.totalCredit);
        totalDebitAll = totalDebitAll.plus(row.totalDebit);
        totalNetMovementAll = totalNetMovementAll.plus(row.periodNetMovement);
        totalRecordedDebtAll = totalRecordedDebtAll.plus(row.recordedCurrentDebt);

        if (row.isClosingBalanceProven && row.closingBalance !== null) {
          totalClosingBalanceAll = totalClosingBalanceAll.plus(row.closingBalance);
        } else {
          unprovenCount++;
        }

        if (row.canCompareWithCurrent && row.variance !== null) {
          totalVarianceAll = totalVarianceAll.plus(row.variance);
          if (Math.abs(row.variance) > 0.01) incompleteCount++;
        } else {
          allComparable = false;
        }
      }
    }

    const isTotalComparable = !hasExplicitTo && allComparable && unprovenCount === 0;

    return {
      company: company || { name: 'مجموعة صيدليات داواكور', currency: 'ج.س', timezone: 'Africa/Cairo' },
      branch: branchObj || { name: 'كافة الفروع المصرح بها' },
      period: {
        from: query.from || null,
        to: query.to || null,
      },
      summary: {
        totalCredit: Number(totalCreditAll.toFixed(2)),
        totalDebit: Number(totalDebitAll.toFixed(2)),
        totalPeriodNetMovement: Number(totalNetMovementAll.toFixed(2)),
        totalClosingBalance: unprovenCount === 0 ? Number(totalClosingBalanceAll.toFixed(2)) : null,
        totalRecordedDebt: Number(totalRecordedDebtAll.toFixed(2)),
        canCompareTotal: isTotalComparable,
        totalVariance: isTotalComparable ? Number(totalVarianceAll.toFixed(2)) : null,
        incompleteCount,
        unprovenCount,
      },
      suppliers: supplierRows,
    };
  }

  /**
   * تصدير تقرير الدائنين إلى PDF (ملخص أو مفصل بالحركات)
   */
  async getCreditorsReportPdf(query: CreditorsReportQueryDto, actor: AuthenticatedUser): Promise<{ buffer: Buffer; filename: string; unicodeFilename: string }> {
    const report = await this.getCreditorsReport(query, actor);
    const buffer = await this.pdfService.generateCreditorsReportPdf(report, query.type || 'summary');
    const typeLabel = query.type === 'detailed' ? 'detailed' : 'summary';
    const dateStr = new Date().toISOString().slice(0, 10);
    return {
      buffer,
      filename: `creditors-report-${typeLabel}-${dateStr}.pdf`,
      unicodeFilename: `تقرير_الدائنين_${query.type === 'detailed' ? 'المفصل' : 'الملخص'}_${dateStr}.pdf`,
    };
  }
}
