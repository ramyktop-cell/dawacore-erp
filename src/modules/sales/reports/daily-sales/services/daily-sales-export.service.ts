import { Injectable } from '@nestjs/common';
import {
  PdfExporter,
  ExcelExporter,
  PdfSection,
  ExcelSheet,
} from 'src/shared/report-kit';
import { DailySalesService } from './daily-sales.service';
import { DailySalesFilterDto } from '../dto/daily-sales-filter.dto';
import { DailySalesResponse } from '../interfaces/daily-sales.interface';

/**
 * DailySalesExportService
 * ───────────────────────
 * مسؤول عن تصدير تقرير المبيعات اليومية إلى PDF و Excel.
 *
 * يستخدم:
 *   - PdfExporter   (من report-kit) → HTML → PDF عبر Puppeteer
 *   - ExcelExporter (من report-kit) → ExcelJS workbook
 *
 * لا يحتوي على منطق تقرير — فقط تحويل البيانات إلى sections/sheets.
 */
@Injectable()
export class DailySalesExportService {
  constructor(
    private readonly dailySalesService: DailySalesService,
    private readonly pdfExporter: PdfExporter,
    private readonly excelExporter: ExcelExporter,
  ) {}

  // ─────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────

  async toPdf(
    filters: DailySalesFilterDto,
    companyId: string,
    userId: string,
  ): Promise<Buffer> {
    const report = await this.dailySalesService.generate(
      filters,
      companyId,
      userId,
    );
    return this.pdfExporter.render(report.meta, this.buildPdfSections(report));
  }

  async toExcel(
    filters: DailySalesFilterDto,
    companyId: string,
    userId: string,
  ): Promise<Buffer> {
    const report = await this.dailySalesService.generate(
      filters,
      companyId,
      userId,
    );
    return this.excelExporter.render(report.meta, this.buildExcelSheets(report));
  }

  // ─────────────────────────────────────────────
  // PDF Sections
  // ─────────────────────────────────────────────

  private buildPdfSections(report: DailySalesResponse): PdfSection[] {
    const {
      summary,
      paymentBreakdown,
      cashierBreakdown,
      hourlyBreakdown,
      topProducts,
      invoices,
    } = report;

    return [
      // ─── 1. الملخص التنفيذي
      {
        heading: 'الملخص التنفيذي',
        kpis: [
          {
            label: 'إجمالي الفواتير',
            value: summary.totalInvoicesCount,
            color: 'info',
          },
          {
            label: 'إجمالي المبيعات',
            value: this.formatNumber(summary.grossSales),
            color: 'primary',
          },
          {
            label: 'صافي المبيعات',
            value: this.formatNumber(summary.netSales),
            color: 'success',
          },
          {
            label: 'إجمالي المرتجعات',
            value: this.formatNumber(summary.totalReturns),
            color: 'danger',
          },
          {
            label: 'إجمالي الخصومات',
            value: this.formatNumber(summary.totalDiscounts),
            color: 'warning',
          },
          {
            label: 'المحصّل فعلياً',
            value: this.formatNumber(summary.totalCollected),
            color: 'success',
          },
          {
            label: 'فواتير مكتملة',
            value: summary.completedInvoicesCount,
            color: 'info',
          },
          {
            label: 'فواتير مرتجعة',
            value: summary.returnedInvoicesCount,
            color: 'danger',
          },
        ],
      },

      // ─── 2. توزيع طرق الدفع
      {
        heading: 'توزيع طرق الدفع',
        tables: [
          {
            columns: [
              { key: 'method', label: 'طريقة الدفع', align: 'right' },
              {
                key: 'amount',
                label: 'المبلغ',
                align: 'left',
                format: 'currency',
              },
              {
                key: 'percentage',
                label: 'النسبة %',
                align: 'left',
                format: 'number',
              },
            ],
            rows: paymentBreakdown,
          },
        ],
      },

      // ─── 3. أداء الكاشيرين
      {
        heading: 'أداء الكاشيرين',
        tables: [
          {
            columns: [
              { key: 'cashierName', label: 'الكاشير', align: 'right' },
              {
                key: 'invoicesCount',
                label: 'الفواتير',
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
                key: 'returns',
                label: 'المرتجعات',
                align: 'left',
                format: 'currency',
              },
              {
                key: 'netTotal',
                label: 'الصافي',
                align: 'left',
                format: 'currency',
              },
            ],
            rows: cashierBreakdown,
          },
        ],
      },

      // ─── 4. المبيعات حسب الساعة
      {
        heading: 'المبيعات حسب الساعة',
        tables: [
          {
            columns: [
              { key: 'hourLabel', label: 'الساعة', align: 'center' },
              {
                key: 'invoicesCount',
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
            ],
            rows: hourlyBreakdown.filter((h) => h.invoicesCount > 0),
          },
        ],
      },

      // ─── 5. أعلى 10 أصناف مبيعاً
      {
        heading: 'أعلى 10 أصناف مبيعاً',
        tables: [
          {
            columns: [
              { key: 'tradeName', label: 'الصنف', align: 'right' },
              {
                key: 'totalQuantity',
                label: 'الكمية',
                align: 'center',
                format: 'number',
              },
              {
                key: 'totalSales',
                label: 'إجمالي البيع',
                align: 'left',
                format: 'currency',
              },
            ],
            rows: topProducts,
          },
        ],
      },

      // ─── 6. تفاصيل الفواتير (حد أقصى 100)
      {
        heading: 'تفاصيل الفواتير',
        tables: [
          {
            columns: [
              {
                key: 'invoiceNumber',
                label: 'رقم الفاتورة',
                align: 'right',
              },
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

  private buildExcelSheets(report: DailySalesResponse): ExcelSheet[] {
    const {
      summary,
      paymentBreakdown,
      cashierBreakdown,
      hourlyBreakdown,
      topProducts,
      invoices,
    } = report;

    return [
      // ─── 1. الملخص
      {
        name: 'الملخص',
        title: report.meta.title,
        columns: [
          { key: 'label', header: 'البند', width: 30, align: 'right' },
          {
            key: 'value',
            header: 'القيمة',
            width: 20,
            align: 'left',
            format: 'number',
          },
        ],
        rows: [
          {
            label: 'عدد الفواتير الإجمالي',
            value: summary.totalInvoicesCount,
          },
          {
            label: 'الفواتير المكتملة',
            value: summary.completedInvoicesCount,
          },
          {
            label: 'الفواتير المرتجعة',
            value: summary.returnedInvoicesCount,
          },
          { label: 'إجمالي المبيعات', value: summary.grossSales },
          { label: 'إجمالي الخصومات', value: summary.totalDiscounts },
          { label: 'إجمالي المرتجعات', value: summary.totalReturns },
          { label: 'صافي المبيعات', value: summary.netSales },
          { label: 'المحصّل فعلياً', value: summary.totalCollected },
        ],
      },

      // ─── 2. طرق الدفع
      {
        name: 'طرق الدفع',
        columns: [
          { key: 'method', header: 'طريقة الدفع', width: 20 },
          {
            key: 'amount',
            header: 'المبلغ',
            width: 18,
            format: 'currency',
            align: 'left',
          },
          {
            key: 'percentage',
            header: 'النسبة %',
            width: 12,
            format: 'number',
            align: 'left',
          },
        ],
        rows: paymentBreakdown,
      },

      // ─── 3. أداء الكاشيرين
      {
        name: 'أداء الكاشيرين',
        columns: [
          { key: 'cashierName', header: 'الكاشير', width: 25 },
          {
            key: 'invoicesCount',
            header: 'عدد الفواتير',
            width: 15,
            format: 'number',
          },
          {
            key: 'totalSales',
            header: 'إجمالي المبيعات',
            width: 18,
            format: 'currency',
            align: 'left',
          },
          {
            key: 'returns',
            header: 'المرتجعات',
            width: 15,
            format: 'currency',
            align: 'left',
          },
          {
            key: 'netTotal',
            header: 'الصافي',
            width: 18,
            format: 'currency',
            align: 'left',
          },
        ],
        rows: cashierBreakdown,
      },

      // ─── 4. الساعات
      {
        name: 'الساعات',
        columns: [
          { key: 'hourLabel', header: 'الساعة', width: 12 },
          {
            key: 'invoicesCount',
            header: 'عدد الفواتير',
            width: 15,
            format: 'number',
          },
          {
            key: 'totalSales',
            header: 'إجمالي المبيعات',
            width: 18,
            format: 'currency',
            align: 'left',
          },
        ],
        rows: hourlyBreakdown,
      },

      // ─── 5. أعلى الأصناف
      {
        name: 'أعلى الأصناف',
        columns: [
          { key: 'tradeName', header: 'الصنف', width: 30 },
          {
            key: 'totalQuantity',
            header: 'الكمية',
            width: 15,
            format: 'number',
          },
          {
            key: 'totalSales',
            header: 'إجمالي البيع',
            width: 18,
            format: 'currency',
            align: 'left',
          },
        ],
        rows: topProducts,
      },

      // ─── 6. الفواتير
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
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
}
