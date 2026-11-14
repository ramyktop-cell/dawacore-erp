import { Injectable } from '@nestjs/common';
import {
  PdfExporter,
  ExcelExporter,
  PdfSection,
  PdfTable,
  PdfKpiCard,
  PdfTableColumn,
  ExcelSheet,
  ExcelColumn,
} from 'src/shared/report-kit';
import { CustomerAgingService } from './customer-aging.service';
import { CustomerAgingFilterDto } from '../dto/customer-aging-filter.dto';
import {
  CustomerAgingResponse,
  CustomerAgingRow,
  AgingDocumentItem,
  AgingRiskLevel,
} from '../interfaces/customer-aging.interface';

/**
 * CustomerAgingExportService
 * ───────────────────────────
 * تصدير تقرير أعمار ديون العملاء إلى PDF (Landscape) و Excel (3 sheets).
 */
@Injectable()
export class CustomerAgingExportService {
  constructor(
    private readonly customerAgingService: CustomerAgingService,
    private readonly pdfExporter: PdfExporter,
    private readonly excelExporter: ExcelExporter,
  ) {}

  // ─────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────

  async toPdf(
    filters: CustomerAgingFilterDto,
    companyId: string,
    userId: string,
  ): Promise<Buffer> {
    const report = await this.customerAgingService.generate(
      filters,
      companyId,
      userId,
    );

    return this.pdfExporter.render(
      report.meta,
      this.buildPdfSections(report),
      { landscape: true },
    );
  }

  async toExcel(
    filters: CustomerAgingFilterDto,
    companyId: string,
    userId: string,
  ): Promise<Buffer> {
    const report = await this.customerAgingService.generate(
      filters,
      companyId,
      userId,
    );

    return this.excelExporter.render(
      report.meta,
      this.buildExcelSheets(report),
    );
  }

  // ─────────────────────────────────────────────
  // PDF Sections
  // ─────────────────────────────────────────────

  private buildPdfSections(report: CustomerAgingResponse): PdfSection[] {
    const riskLabels: Record<AgingRiskLevel, string> = {
      LOW: 'منخفض',
      MEDIUM: 'متوسط',
      HIGH: 'مرتفع',
      CRITICAL: 'حرج',
    };

    // 1. بطاقات KPIs
    const kpiCards: PdfKpiCard[] = [
      {
        label: 'إجمالي المديونية',
        value: report.summary.totalBalance,
        hint: `${report.summary.partnersWithBalance} عميل مدين من أصل ${report.summary.totalPartners}`,
        color: 'primary',
      },
      {
        label: 'نسبة الديون المتأخرة',
        value: `${report.summary.ratios.overdueRatio}%`,
        hint: `تجاوزت ${report.thresholds.bucket1} يوماً`,
        color: report.summary.ratios.overdueRatio > 40 ? 'warning' : 'info',
      },
      {
        label: 'نسبة الديون الحرجة',
        value: `${report.summary.ratios.criticalRatio}%`,
        hint: `تجاوزت ${report.thresholds.bucket3} يوماً`,
        color: report.summary.ratios.criticalRatio > 15 ? 'danger' : 'success',
      },
      {
        label: 'متوسط دين العميل',
        value: report.summary.ratios.averageDebtPerPartner,
        hint: 'للعملاء الذين عليهم مديونية',
        color: 'info',
      },
    ];

    // 2. جدول ملخص الشرائح
    const summaryColumns: PdfTableColumn[] = [
      { key: 'label', label: 'الشريحة', width: '30%', align: 'right' },
      { key: 'range', label: 'المدى بالأيام', width: '20%', align: 'center' },
      { key: 'amount', label: 'المبلغ', width: '25%', align: 'left', format: 'currency' },
      { key: 'percentage', label: 'النسبة %', width: '15%', align: 'center' },
      { key: 'riskLevel', label: 'مستوى المخاطر', width: '10%', align: 'center' },
    ];

    const summaryRows = report.summary.buckets.map((b) => ({
      label: b.label,
      range: b.toDays ? `${b.fromDays} - ${b.toDays}` : `+${b.fromDays}`,
      amount: b.amount,
      percentage: `${b.percentage}%`,
      riskLevel: riskLabels[b.riskLevel],
    }));

    // 3. جدول أعمار ديون العملاء
    const partnerColumns: PdfTableColumn[] = [
      { key: 'partnerCode', label: 'كود العميل', width: '8%', align: 'center' },
      { key: 'partnerName', label: 'اسم العميل', width: '18%', align: 'right' },
      { key: 'phone', label: 'الهاتف', width: '10%', align: 'center' },
      { key: 'current', label: `0-${report.thresholds.bucket1}`, width: '11%', align: 'left', format: 'currency' },
      { key: 'days31_60', label: `${report.thresholds.bucket1 + 1}-${report.thresholds.bucket2}`, width: '11%', align: 'left', format: 'currency' },
      { key: 'days61_90', label: `${report.thresholds.bucket2 + 1}-${report.thresholds.bucket3}`, width: '11%', align: 'left', format: 'currency' },
      { key: 'over90', label: `+${report.thresholds.bucket3}`, width: '11%', align: 'left', format: 'currency' },
      { key: 'currentBalance', label: 'إجمالي الرصيد', width: '12%', align: 'left', format: 'currency' },
      { key: 'oldestDays', label: 'أقدم (يوم)', width: '8%', align: 'center' },
      { key: 'riskLevel', label: 'المخاطر', width: '9%', align: 'center' },
    ];

    const partnerRows = report.customers.map((p) => ({
      partnerCode: p.partnerCode,
      partnerName: p.partnerName,
      phone: p.phone || '-',
      current: p.buckets.current,
      days31_60: p.buckets.days31_60,
      days61_90: p.buckets.days61_90,
      over90: p.buckets.over90,
      currentBalance: p.currentBalance,
      oldestDays: p.oldestDocumentDays,
      riskLevel: riskLabels[p.riskLevel],
    }));

    const totals: Record<string, number> = {
      current: report.summary.buckets[0]?.amount || 0,
      days31_60: report.summary.buckets[1]?.amount || 0,
      days61_90: report.summary.buckets[2]?.amount || 0,
      over90: report.summary.buckets[3]?.amount || 0,
      currentBalance: report.summary.totalBalance,
    };

    return [
      {
        heading: 'المؤشرات والملخص العام',
        kpis: kpiCards,
        tables: [
          {
            title: 'ملخص شرائح أعمار الديون',
            columns: summaryColumns,
            rows: summaryRows,
          },
        ],
      },
      {
        heading: 'أعمار ديون العملاء بالتفصيل',
        tables: [
          {
            title: `قائمة العملاء المدينين (${report.customers.length})`,
            columns: partnerColumns,
            rows: partnerRows,
            totals,
          },
        ],
      },
    ];
  }

  // ─────────────────────────────────────────────
  // Excel Sheets
  // ─────────────────────────────────────────────

  private buildExcelSheets(report: CustomerAgingResponse): ExcelSheet[] {
    const riskLabels: Record<AgingRiskLevel, string> = {
      LOW: 'منخفض',
      MEDIUM: 'متوسط',
      HIGH: 'مرتفع',
      CRITICAL: 'حرج',
    };

    // ─── Sheet 1: ملخص الأعمار
    const summaryColumns: ExcelColumn[] = [
      { key: 'label', header: 'الشريحة', width: 25, align: 'right' },
      { key: 'fromDays', header: 'من يوم', width: 12, align: 'center' },
      { key: 'toDays', header: 'إلى يوم', width: 12, align: 'center' },
      { key: 'amount', header: 'المبلغ', width: 18, align: 'left', format: 'currency' },
      { key: 'percentage', header: 'النسبة %', width: 14, align: 'center', format: 'number' },
      { key: 'riskLevel', header: 'مستوى المخاطر', width: 16, align: 'center' },
    ];

    const summaryRows = report.summary.buckets.map((b) => ({
      label: b.label,
      fromDays: b.fromDays,
      toDays: b.toDays ?? 'فما فوق',
      amount: b.amount,
      percentage: b.percentage,
      riskLevel: riskLabels[b.riskLevel],
    }));

    const sheet1: ExcelSheet = {
      name: 'ملخص الأعمار',
      title: 'تقرير أعمار ديون العملاء — ملخص الشرائح',
      columns: summaryColumns,
      rows: summaryRows,
      totals: {
        amount: report.summary.totalBalance,
        percentage: 100,
      },
      meta: {
        'إجمالي الديون': `${report.summary.totalBalance}`,
        'نسبة الديون المتأخرة': `${report.summary.ratios.overdueRatio}%`,
        'نسبة الديون الحرجة': `${report.summary.ratios.criticalRatio}%`,
        'عدد العملاء المدينين': `${report.summary.partnersWithBalance}`,
      },
    };

    // ─── Sheet 2: أعمار ديون العملاء
    const partnerColumns: ExcelColumn[] = [
      { key: 'partnerCode', header: 'كود العميل', width: 14, align: 'center' },
      { key: 'partnerName', header: 'اسم العميل', width: 28, align: 'right' },
      { key: 'phone', header: 'الهاتف', width: 16, align: 'center' },
      { key: 'creditLimit', header: 'حد الائتمان', width: 16, align: 'left', format: 'currency' },
      { key: 'current', header: `0-${report.thresholds.bucket1}`, width: 16, align: 'left', format: 'currency' },
      { key: 'days31_60', header: `${report.thresholds.bucket1 + 1}-${report.thresholds.bucket2}`, width: 16, align: 'left', format: 'currency' },
      { key: 'days61_90', header: `${report.thresholds.bucket2 + 1}-${report.thresholds.bucket3}`, width: 16, align: 'left', format: 'currency' },
      { key: 'over90', header: `+${report.thresholds.bucket3}`, width: 16, align: 'left', format: 'currency' },
      { key: 'currentBalance', header: 'إجمالي الرصيد', width: 18, align: 'left', format: 'currency' },
      { key: 'oldestDays', header: 'أقدم فاتورة (يوم)', width: 16, align: 'center' },
      { key: 'averageAge', header: 'متوسط العمر (يوم)', width: 16, align: 'center' },
      { key: 'riskLevel', header: 'مستوى المخاطر', width: 14, align: 'center' },
    ];

    const partnerRows = report.customers.map((p) => ({
      partnerCode: p.partnerCode,
      partnerName: p.partnerName,
      phone: p.phone || '-',
      creditLimit: p.creditLimit || 0,
      current: p.buckets.current,
      days31_60: p.buckets.days31_60,
      days61_90: p.buckets.days61_90,
      over90: p.buckets.over90,
      currentBalance: p.currentBalance,
      oldestDays: p.oldestDocumentDays,
      averageAge: p.averageAgeDays,
      riskLevel: riskLabels[p.riskLevel],
    }));

    const sheet2: ExcelSheet = {
      name: 'أعمار ديون العملاء',
      title: 'تفاصيل أعمار الديون حسب كل عميل',
      columns: partnerColumns,
      rows: partnerRows,
      totals: {
        current: report.summary.buckets[0]?.amount || 0,
        days31_60: report.summary.buckets[1]?.amount || 0,
        days61_90: report.summary.buckets[2]?.amount || 0,
        over90: report.summary.buckets[3]?.amount || 0,
        currentBalance: report.summary.totalBalance,
      },
    };

    // ─── Sheet 3: تفاصيل الفواتير غير المسددة
    const invoiceColumns: ExcelColumn[] = [
      { key: 'partnerCode', header: 'كود العميل', width: 14, align: 'center' },
      { key: 'partnerName', header: 'اسم العميل', width: 26, align: 'right' },
      { key: 'invoiceNumber', header: 'رقم الفاتورة', width: 18, align: 'center' },
      { key: 'invoiceDate', header: 'تاريخ الفاتورة', width: 14, align: 'center', format: 'date' },
      { key: 'amount', header: 'قيمة الفاتورة', width: 16, align: 'left', format: 'currency' },
      { key: 'paidAmount', header: 'المسدد', width: 16, align: 'left', format: 'currency' },
      { key: 'remainingAmount', header: 'المتبقي', width: 16, align: 'left', format: 'currency' },
      { key: 'ageInDays', header: 'العمر (يوم)', width: 14, align: 'center' },
      { key: 'bucket', header: 'الشريحة', width: 16, align: 'center' },
    ];

    const invoiceRows: Record<string, any>[] = [];
    let totalInvoicesAmount = 0;
    let totalInvoicesPaid = 0;
    let totalInvoicesRemaining = 0;

    for (const customer of report.customers) {
      if (!customer.documents) continue;
      for (const doc of customer.documents) {
        invoiceRows.push({
          partnerCode: customer.partnerCode,
          partnerName: customer.partnerName,
          invoiceNumber: doc.documentNumber,
          invoiceDate: doc.documentDate,
          amount: doc.amount,
          paidAmount: doc.paidAmount,
          remainingAmount: doc.remainingAmount,
          ageInDays: doc.ageInDays,
          bucket: doc.bucket,
        });

        totalInvoicesAmount += doc.amount;
        totalInvoicesPaid += doc.paidAmount;
        totalInvoicesRemaining += doc.remainingAmount;
      }
    }

    const sheet3: ExcelSheet = {
      name: 'تفاصيل الفواتير',
      title: 'سجل الفواتير غير المسددة',
      columns: invoiceColumns,
      rows: invoiceRows,
      totals: {
        amount: totalInvoicesAmount,
        paidAmount: totalInvoicesPaid,
        remainingAmount: totalInvoicesRemaining,
      },
    };

    return [sheet1, sheet2, sheet3];
  }
}
