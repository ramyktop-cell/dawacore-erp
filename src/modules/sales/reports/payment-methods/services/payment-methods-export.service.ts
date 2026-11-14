import { Injectable } from '@nestjs/common';
import {
  PdfExporter,
  ExcelExporter,
  PdfSection,
  ExcelSheet,
} from 'src/shared/report-kit';
import { PaymentMethodsService } from './payment-methods.service';
import { PaymentMethodsFilterDto } from '../dto/payment-methods-filter.dto';
import { PaymentMethodsResponse } from '../interfaces/payment-methods.interface';

/**
 * PaymentMethodsExportService
 * ───────────────────────────
 * مسؤول عن تصدير تقرير طرق الدفع إلى PDF و Excel.
 */
@Injectable()
export class PaymentMethodsExportService {
  constructor(
    private readonly paymentMethodsService: PaymentMethodsService,
    private readonly pdfExporter: PdfExporter,
    private readonly excelExporter: ExcelExporter,
  ) {}

  async toPdf(
    filters: PaymentMethodsFilterDto,
    companyId: string,
    userId: string,
  ): Promise<Buffer> {
    const report = await this.paymentMethodsService.generate(
      filters,
      companyId,
      userId,
    );
    return this.pdfExporter.render(report.meta, this.buildPdfSections(report));
  }

  async toExcel(
    filters: PaymentMethodsFilterDto,
    companyId: string,
    userId: string,
  ): Promise<Buffer> {
    const report = await this.paymentMethodsService.generate(
      filters,
      companyId,
      userId,
    );
    return this.excelExporter.render(report.meta, this.buildExcelSheets(report));
  }

  // ─────────────────────────────────────────────
  // PDF Sections
  // ─────────────────────────────────────────────

  private buildPdfSections(report: PaymentMethodsResponse): PdfSection[] {
    const { summary, methods, dailyTrend } = report;

    const topMethodKpi = summary.topMethodByAmount
      ? {
          label: '🏆 أعلى طريقة قيمة',
          value: summary.topMethodByAmount.methodLabel,
          hint: this.formatNumber(summary.topMethodByAmount.amount),
          color: 'success' as const,
        }
      : {
          label: '🏆 أعلى طريقة قيمة',
          value: '—',
          color: 'info' as const,
        };

    const mostUsedKpi = summary.mostUsedMethod
      ? {
          label: '⚡ الأكثر استخداماً',
          value: summary.mostUsedMethod.methodLabel,
          hint: `${summary.mostUsedMethod.count} فاتورة`,
          color: 'primary' as const,
        }
      : {
          label: '⚡ الأكثر استخداماً',
          value: '—',
          color: 'info' as const,
        };

    const returnRateColor: 'danger' | 'success' =
      summary.totalGrossAmount > 0 &&
      summary.totalReturnsAmount / summary.totalGrossAmount > 0.05
        ? 'danger'
        : 'success';

    return [
      // ─── 1. الملخص التنفيذي
      {
        heading: 'الملخص التنفيذي',
        kpis: [
          {
            label: 'طرق الدفع المستخدمة',
            value: summary.activeMethodsCount,
            color: 'info',
          },
          {
            label: 'إجمالي الفواتير',
            value: summary.totalInvoicesCount,
            color: 'info',
          },
          {
            label: 'إجمالي المبيعات',
            value: this.formatNumber(summary.totalGrossAmount),
            color: 'primary',
          },
          {
            label: 'صافي المبيعات',
            value: this.formatNumber(summary.totalNetAmount),
            color: 'success',
          },
          {
            label: 'إجمالي المرتجعات',
            value: this.formatNumber(summary.totalReturnsAmount),
            color: 'danger',
          },
          {
            label: 'متوسط الفاتورة العام',
            value: this.formatNumber(summary.overallAvgTicket),
            color: 'warning',
          },
          topMethodKpi,
          mostUsedKpi,
          {
            label: 'نسبة المرتجعات',
            value: this.computeReturnRate(
              summary.totalReturnsAmount,
              summary.totalGrossAmount,
            ),
            color: returnRateColor,
          },
        ],
      },

      // ─── 2. جدول توزيع طرق الدفع
      {
        heading: 'توزيع وتحليل طرق الدفع',
        tables: [
          {
            columns: [
              { key: 'rank', label: '#', align: 'center', format: 'number' },
              { key: 'methodLabel', label: 'طريقة الدفع', align: 'right' },
              {
                key: 'totalCount',
                label: 'الفواتير',
                align: 'center',
                format: 'number',
              },
              {
                key: 'grossAmount',
                label: 'إجمالي المبيعات',
                align: 'left',
                format: 'currency',
              },
              {
                key: 'returnsAmount',
                label: 'المرتجعات',
                align: 'left',
                format: 'currency',
              },
              {
                key: 'netAmount',
                label: 'الصافي',
                align: 'left',
                format: 'currency',
              },
              {
                key: 'percentage',
                label: 'النسبة %',
                align: 'center',
                format: 'number',
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
            rows: methods,
            totals: {
              totalCount: methods.reduce((s, m) => s + m.totalCount, 0),
              grossAmount: methods.reduce((s, m) => s + m.grossAmount, 0),
              returnsAmount: methods.reduce((s, m) => s + m.returnsAmount, 0),
              netAmount: methods.reduce((s, m) => s + m.netAmount, 0),
            },
          },
        ],
      },

      // ─── 3. الاتجاه اليومي
      {
        heading: 'الاتجاه اليومي للمبيعات',
        tables: [
          {
            columns: [
              { key: 'date', label: 'التاريخ', align: 'center' },
              {
                key: 'totalCount',
                label: 'عدد الفواتير',
                align: 'center',
                format: 'number',
              },
              {
                key: 'totalAmount',
                label: 'إجمالي المبيعات',
                align: 'left',
                format: 'currency',
              },
              {
                key: 'topMethod',
                label: 'أعلى طريقة',
                align: 'right',
              },
            ],
            rows: dailyTrend.map((d) => ({
              date: d.date,
              totalCount: d.totalCount,
              totalAmount: d.totalAmount,
              topMethod: this.findTopMethodForDay(d),
            })),
            totals: {
              totalCount: dailyTrend.reduce((s, d) => s + d.totalCount, 0),
              totalAmount: dailyTrend.reduce((s, d) => s + d.totalAmount, 0),
            },
          },
        ],
      },
    ];
  }

  // ─────────────────────────────────────────────
  // Excel Sheets
  // ─────────────────────────────────────────────

  private buildExcelSheets(report: PaymentMethodsResponse): ExcelSheet[] {
    const { summary, methods, dailyTrend } = report;

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
          { label: 'عدد طرق الدفع المستخدمة', value: summary.activeMethodsCount },
          { label: 'إجمالي الفواتير', value: summary.totalInvoicesCount },
          { label: 'إجمالي المبيعات', value: summary.totalGrossAmount },
          { label: 'إجمالي المرتجعات', value: summary.totalReturnsAmount },
          { label: 'صافي المبيعات', value: summary.totalNetAmount },
          { label: 'متوسط الفاتورة العام', value: summary.overallAvgTicket },
          {
            label: 'أعلى طريقة دفع قيمة',
            value: summary.topMethodByAmount?.methodLabel || '—',
          },
          {
            label: 'صافي مبيعات أعلى طريقة',
            value: summary.topMethodByAmount?.amount ?? 0,
          },
          {
            label: 'الأكثر استخداماً',
            value: summary.mostUsedMethod?.methodLabel || '—',
          },
          {
            label: 'فواتير الأكثر استخداماً',
            value: summary.mostUsedMethod?.count ?? 0,
          },
        ],
      },

      // ─── 2. جدول طرق الدفع
      {
        name: 'طرق الدفع',
        columns: [
          { key: 'rank', header: '#', width: 6, format: 'number', align: 'center' },
          { key: 'methodLabel', header: 'طريقة الدفع', width: 22 },
          {
            key: 'totalCount',
            header: 'الفواتير',
            width: 12,
            format: 'number',
            align: 'center',
          },
          {
            key: 'completedCount',
            header: 'مكتملة',
            width: 12,
            format: 'number',
            align: 'center',
          },
          {
            key: 'returnedCount',
            header: 'مرتجعة',
            width: 12,
            format: 'number',
            align: 'center',
          },
          {
            key: 'grossAmount',
            header: 'إجمالي المبيعات',
            width: 18,
            format: 'currency',
            align: 'left',
          },
          {
            key: 'returnsAmount',
            header: 'المرتجعات',
            width: 14,
            format: 'currency',
            align: 'left',
          },
          {
            key: 'netAmount',
            header: 'الصافي',
            width: 18,
            format: 'currency',
            align: 'left',
          },
          {
            key: 'percentage',
            header: 'النسبة %',
            width: 14,
            format: 'number',
            align: 'center',
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
        rows: methods,
        totals: {
          totalCount: methods.reduce((s, m) => s + m.totalCount, 0),
          grossAmount: methods.reduce((s, m) => s + m.grossAmount, 0),
          returnsAmount: methods.reduce((s, m) => s + m.returnsAmount, 0),
          netAmount: methods.reduce((s, m) => s + m.netAmount, 0),
        },
      },

      // ─── 3. الاتجاه اليومي
      {
        name: 'الاتجاه اليومي',
        columns: [
          { key: 'date', header: 'التاريخ', width: 14, align: 'center' },
          {
            key: 'totalCount',
            header: 'عدد الفواتير',
            width: 14,
            format: 'number',
            align: 'center',
          },
          {
            key: 'totalAmount',
            header: 'إجمالي المبيعات',
            width: 18,
            format: 'currency',
            align: 'left',
          },
          {
            key: 'topMethod',
            header: 'أعلى طريقة',
            width: 22,
          },
          {
            key: 'methodBreakdown',
            header: 'تفصيل طرق الدفع',
            width: 50,
          },
        ],
        rows: dailyTrend.map((d) => ({
          date: d.date,
          totalCount: d.totalCount,
          totalAmount: d.totalAmount,
          topMethod: this.findTopMethodForDay(d),
          methodBreakdown: d.byMethod
            .map((m) => `${m.methodLabel}: ${this.formatNumber(m.amount)}`)
            .join(' | '),
        })),
        totals: {
          totalCount: dailyTrend.reduce((s, d) => s + d.totalCount, 0),
          totalAmount: dailyTrend.reduce((s, d) => s + d.totalAmount, 0),
        },
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

  private findTopMethodForDay(day: {
    byMethod: Array<{ methodLabel: string; amount: number }>;
  }): string {
    if (!day.byMethod || day.byMethod.length === 0) return '—';
    return day.byMethod.reduce((best, m) =>
      m.amount > best.amount ? m : best,
    ).methodLabel;
  }
}
