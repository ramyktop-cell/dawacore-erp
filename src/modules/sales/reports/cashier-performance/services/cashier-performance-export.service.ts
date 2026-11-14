import { Injectable } from '@nestjs/common';
import {
  PdfExporter,
  ExcelExporter,
  PdfSection,
  ExcelSheet,
} from 'src/shared/report-kit';
import { CashierPerformanceService } from './cashier-performance.service';
import { CashierPerformanceFilterDto } from '../dto/cashier-performance-filter.dto';
import { CashierPerformanceResponse } from '../interfaces/cashier-performance.interface';

/**
 * CashierPerformanceExportService
 * ───────────────────────────────
 * مسؤول عن تصدير تقرير أداء الكاشيرين إلى PDF و Excel.
 */
@Injectable()
export class CashierPerformanceExportService {
  constructor(
    private readonly cashierPerformanceService: CashierPerformanceService,
    private readonly pdfExporter: PdfExporter,
    private readonly excelExporter: ExcelExporter,
  ) {}

  // ─────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────

  async toPdf(
    filters: CashierPerformanceFilterDto,
    companyId: string,
    userId: string,
  ): Promise<Buffer> {
    const report = await this.cashierPerformanceService.generate(
      filters,
      companyId,
      userId,
    );
    return this.pdfExporter.render(report.meta, this.buildPdfSections(report));
  }

  async toExcel(
    filters: CashierPerformanceFilterDto,
    companyId: string,
    userId: string,
  ): Promise<Buffer> {
    const report = await this.cashierPerformanceService.generate(
      filters,
      companyId,
      userId,
    );
    return this.excelExporter.render(report.meta, this.buildExcelSheets(report));
  }

  // ─────────────────────────────────────────────
  // PDF Sections
  // ─────────────────────────────────────────────

  private buildPdfSections(report: CashierPerformanceResponse): PdfSection[] {
    const { summary, cashiers, dailyTrend, invoices } = report;

    const bestCashierKpi = summary.bestCashier
      ? {
          label: '🏆 أفضل كاشير',
          value: summary.bestCashier.cashierName,
          hint: this.formatNumber(summary.bestCashier.netSales),
          color: 'success' as const,
        }
      : {
          label: '🏆 أفضل كاشير',
          value: '—',
          color: 'info' as const,
        };

    const returnRateColor: 'danger' | 'success' =
      summary.totalGrossSales > 0 &&
      summary.totalReturns / summary.totalGrossSales > 0.05
        ? 'danger'
        : 'success';

    return [
      // ─── 1. الملخص التنفيذي
      {
        heading: 'الملخص التنفيذي',
        kpis: [
          {
            label: 'عدد الكاشيرين',
            value: summary.totalCashiers,
            color: 'info',
          },
          {
            label: 'إجمالي الفواتير',
            value: summary.totalInvoicesCount,
            color: 'info',
          },
          {
            label: 'إجمالي المبيعات',
            value: this.formatNumber(summary.totalGrossSales),
            color: 'primary',
          },
          {
            label: 'صافي المبيعات',
            value: this.formatNumber(summary.totalNetSales),
            color: 'success',
          },
          {
            label: 'إجمالي المرتجعات',
            value: this.formatNumber(summary.totalReturns),
            color: 'danger',
          },
          {
            label: 'متوسط الفاتورة',
            value: this.formatNumber(summary.overallAvgTicket),
            color: 'warning',
          },
          bestCashierKpi,
          {
            label: 'نسبة المرتجعات',
            value: this.computeReturnRate(
              summary.totalReturns,
              summary.totalGrossSales,
            ),
            color: returnRateColor,
          },
        ],
      },

      // ─── 2. جدول ترتيب الكاشيرين
      {
        heading: 'ترتيب أداء الكاشيرين',
        tables: [
          {
            columns: [
              { key: 'rank', label: '#', align: 'center', format: 'number' },
              { key: 'cashierName', label: 'الكاشير', align: 'right' },
              {
                key: 'invoicesCount',
                label: 'الفواتير',
                align: 'center',
                format: 'number',
              },
              {
                key: 'grossSales',
                label: 'إجمالي المبيعات',
                align: 'left',
                format: 'currency',
              },
              {
                key: 'returns',
                label: 'المرتجعات',
                align: 'left',
                format: 'currency',
              },
              {
                key: 'netSales',
                label: 'الصافي',
                align: 'left',
                format: 'currency',
              },
              {
                key: 'avgTicket',
                label: 'متوسط الفاتورة',
                align: 'left',
                format: 'currency',
              },
              {
                key: 'returnRate',
                label: 'نسبة المرتجعات %',
                align: 'left',
                format: 'number',
              },
            ],
            rows: cashiers,
            totals: {
              invoicesCount: cashiers.reduce(
                (sum, c) => sum + c.invoicesCount,
                0,
              ),
              grossSales: cashiers.reduce((sum, c) => sum + c.grossSales, 0),
              returns: cashiers.reduce((sum, c) => sum + c.returns, 0),
              netSales: cashiers.reduce((sum, c) => sum + c.netSales, 0),
            },
          },
        ],
        note:
          'الترتيب حسب صافي المبيعات (netSales) بترتيب تنازلي. يمكن تغيير الترتيب عبر sortBy/sortOrder.',
      },

      // ─── 3. الاتجاه اليومي
      {
        heading: 'الاتجاه اليومي للمبيعات',
        tables: [
          {
            columns: [
              { key: 'date', label: 'التاريخ', align: 'center' },
              {
                key: 'totalInvoices',
                label: 'عدد الفواتير',
                align: 'center',
                format: 'number',
              },
              {
                key: 'totalSales',
                label: 'إجمالي المبيعات',
                align: 'left',
                format: 'currency',
              },
              {
                key: 'topCashier',
                label: 'أفضل كاشير',
                align: 'right',
              },
            ],
            rows: dailyTrend.map((d) => ({
              date: d.date,
              totalInvoices: d.totalInvoices,
              totalSales: d.totalSales,
              topCashier: this.findTopCashierForDay(d),
            })),
            totals: {
              totalInvoices: dailyTrend.reduce(
                (sum, d) => sum + d.totalInvoices,
                0,
              ),
              totalSales: dailyTrend.reduce(
                (sum, d) => sum + d.totalSales,
                0,
              ),
            },
          },
        ],
      },

      // ─── 4. تفاصيل الفواتير (حد أقصى 100)
      {
        heading: 'تفاصيل الفواتير',
        tables: [
          {
            columns: [
              { key: 'invoiceNumber', label: 'رقم الفاتورة', align: 'right' },
              { key: 'createdAt', label: 'التاريخ', align: 'center' },
              { key: 'cashierName', label: 'الكاشير', align: 'right' },
              { key: 'customerName', label: 'العميل', align: 'right' },
              {
                key: 'grandTotal',
                label: 'الإجمالي',
                align: 'left',
                format: 'currency',
              },
              { key: 'status', label: 'الحالة', align: 'center' },
            ],
            rows: invoices.slice(0, 100),
          },
        ],
        note:
          invoices.length > 100
            ? `يتم عرض أول 100 فاتورة من إجمالي ${invoices.length}. للتفاصيل الكاملة استخدم تصدير Excel.`
            : undefined,
      },
    ];
  }

  // ─────────────────────────────────────────────
  // Excel Sheets
  // ─────────────────────────────────────────────

  private buildExcelSheets(report: CashierPerformanceResponse): ExcelSheet[] {
    const { summary, cashiers, dailyTrend, invoices } = report;

    return [
      // ─── 1. الملخص
      {
        name: 'الملخص',
        title: report.meta.title,
        columns: [
          { key: 'label', header: 'البند', width: 32, align: 'right' },
          {
            key: 'value',
            header: 'القيمة',
            width: 22,
            align: 'left',
            format: 'number',
          },
        ],
        rows: [
          { label: 'عدد الكاشيرين', value: summary.totalCashiers },
          {
            label: 'إجمالي الفواتير',
            value: summary.totalInvoicesCount,
          },
          {
            label: 'إجمالي المبيعات',
            value: summary.totalGrossSales,
          },
          {
            label: 'إجمالي المرتجعات',
            value: summary.totalReturns,
          },
          {
            label: 'صافي المبيعات',
            value: summary.totalNetSales,
          },
          {
            label: 'متوسط الفاتورة العام',
            value: summary.overallAvgTicket,
          },
          {
            label: 'أفضل كاشير',
            value: summary.bestCashier?.cashierName || '—',
          },
          {
            label: 'صافي مبيعات أفضل كاشير',
            value: summary.bestCashier?.netSales ?? 0,
          },
        ],
      },

      // ─── 2. ترتيب الكاشيرين
      {
        name: 'أداء الكاشيرين',
        columns: [
          { key: 'rank', header: '#', width: 6, format: 'number', align: 'center' },
          { key: 'cashierName', header: 'الكاشير', width: 22 },
          {
            key: 'invoicesCount',
            header: 'الفواتير',
            width: 12,
            format: 'number',
            align: 'center',
          },
          {
            key: 'completedInvoicesCount',
            header: 'مكتملة',
            width: 12,
            format: 'number',
            align: 'center',
          },
          {
            key: 'returnedInvoicesCount',
            header: 'مرتجعة',
            width: 12,
            format: 'number',
            align: 'center',
          },
          {
            key: 'grossSales',
            header: 'إجمالي المبيعات',
            width: 18,
            format: 'currency',
            align: 'left',
          },
          {
            key: 'totalDiscounts',
            header: 'الخصومات',
            width: 14,
            format: 'currency',
            align: 'left',
          },
          {
            key: 'returns',
            header: 'المرتجعات',
            width: 14,
            format: 'currency',
            align: 'left',
          },
          {
            key: 'netSales',
            header: 'الصافي',
            width: 18,
            format: 'currency',
            align: 'left',
          },
          {
            key: 'totalCollected',
            header: 'المحصّل',
            width: 18,
            format: 'currency',
            align: 'left',
          },
          {
            key: 'avgTicket',
            header: 'متوسط الفاتورة',
            width: 16,
            format: 'currency',
            align: 'left',
          },
          {
            key: 'returnRate',
            header: 'نسبة المرتجعات %',
            width: 18,
            format: 'number',
            align: 'left',
          },
        ],
        rows: cashiers,
        totals: {
          invoicesCount: cashiers.reduce((s, c) => s + c.invoicesCount, 0),
          grossSales: cashiers.reduce((s, c) => s + c.grossSales, 0),
          totalDiscounts: cashiers.reduce((s, c) => s + c.totalDiscounts, 0),
          returns: cashiers.reduce((s, c) => s + c.returns, 0),
          netSales: cashiers.reduce((s, c) => s + c.netSales, 0),
          totalCollected: cashiers.reduce((s, c) => s + c.totalCollected, 0),
        },
      },

      // ─── 3. الاتجاه اليومي
      {
        name: 'الاتجاه اليومي',
        columns: [
          { key: 'date', header: 'التاريخ', width: 14, align: 'center' },
          {
            key: 'totalInvoices',
            header: 'عدد الفواتير',
            width: 14,
            format: 'number',
            align: 'center',
          },
          {
            key: 'totalSales',
            header: 'إجمالي المبيعات',
            width: 18,
            format: 'currency',
            align: 'left',
          },
          {
            key: 'topCashier',
            header: 'أفضل كاشير',
            width: 22,
          },
          {
            key: 'cashierBreakdown',
            header: 'مساهمة الكاشيرين',
            width: 50,
          },
        ],
        rows: dailyTrend.map((d) => ({
          date: d.date,
          totalInvoices: d.totalInvoices,
          totalSales: d.totalSales,
          topCashier: this.findTopCashierForDay(d),
          cashierBreakdown: d.byCashier
            .map((c) => `${c.cashierName}: ${this.formatNumber(c.sales)}`)
            .join(' | '),
        })),
        totals: {
          totalInvoices: dailyTrend.reduce(
            (sum, d) => sum + d.totalInvoices,
            0,
          ),
          totalSales: dailyTrend.reduce((sum, d) => sum + d.totalSales, 0),
        },
      },

      // ─── 4. تفاصيل الفواتير (كل الفواتير)
      {
        name: 'الفواتير',
        columns: [
          { key: 'invoiceNumber', header: 'رقم الفاتورة', width: 18 },
          { key: 'createdAt', header: 'التاريخ', width: 20 },
          { key: 'cashierName', header: 'الكاشير', width: 20 },
          { key: 'customerName', header: 'العميل', width: 20 },
          {
            key: 'subTotal',
            header: 'قبل الخصم',
            width: 14,
            format: 'currency',
            align: 'left',
          },
          {
            key: 'discountTotal',
            header: 'الخصم',
            width: 12,
            format: 'currency',
            align: 'left',
          },
          {
            key: 'grandTotal',
            header: 'الإجمالي',
            width: 14,
            format: 'currency',
            align: 'left',
          },
          {
            key: 'paidAmount',
            header: 'المدفوع',
            width: 14,
            format: 'currency',
            align: 'left',
          },
          { key: 'status', header: 'الحالة', width: 14 },
        ],
        rows: invoices,
      },
    ];
  }

  // ─────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────

  private formatNumber(value: number): string {
    return (value ?? 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  private computeReturnRate(returns: number, grossSales: number): string {
    if (!grossSales || grossSales <= 0) return '0.00%';
    const rate = (returns / grossSales) * 100;
    return `${this.formatNumber(rate)}%`;
  }

  /**
   * يُحدد أفضل كاشير في يوم معين (الأعلى sales).
   */
  private findTopCashierForDay(day: {
    byCashier: Array<{ cashierName: string; sales: number }>;
  }): string {
    if (!day.byCashier || day.byCashier.length === 0) return '—';
    return day.byCashier.reduce((best, c) =>
      c.sales > best.sales ? c : best,
    ).cashierName;
  }
}
