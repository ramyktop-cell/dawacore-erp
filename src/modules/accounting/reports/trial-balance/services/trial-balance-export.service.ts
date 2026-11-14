import { Injectable } from '@nestjs/common';
import {
  PdfExporter,
  ExcelExporter,
  PdfSection,
  ExcelSheet,
} from 'src/shared/report-kit';
import { TrialBalanceService } from './trial-balance.service';
import { TrialBalanceFilterDto } from '../dto/trial-balance-filter.dto';
import {
  TrialBalanceResponse,
  TrialBalanceRow,
} from '../interfaces/trial-balance.interface';

/**
 * TrialBalanceExportService
 * ─────────────────────────
 * تصدير ميزان المراجعة إلى PDF (Landscape A4) و Excel.
 *
 * الميزات:
 *   📄 PDF: A4 Landscape + مؤشر توازن + إجماليات المدين/الدائن
 *   📊 Excel: RTL + أعمدة مقسّمة (افتتاحي/حركة/ختامي)
 */
@Injectable()
export class TrialBalanceExportService {
  constructor(
    private readonly trialBalanceService: TrialBalanceService,
    private readonly pdfExporter: PdfExporter,
    private readonly excelExporter: ExcelExporter,
  ) {}

  // ─────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────

  async toPdf(
    filters: TrialBalanceFilterDto,
    companyId: string,
    userId: string,
  ): Promise<Buffer> {
    const report = await this.trialBalanceService.generate(
      filters,
      companyId,
      userId,
    );
    return this.pdfExporter.render(
      report.meta,
      this.buildPdfSections(report),
      { landscape: true }, // ← A4 Landscape
    );
  }

  async toExcel(
    filters: TrialBalanceFilterDto,
    companyId: string,
    userId: string,
  ): Promise<Buffer> {
    const report = await this.trialBalanceService.generate(
      filters,
      companyId,
      userId,
    );
    return this.excelExporter.render(report.meta, this.buildExcelSheets(report));
  }

  // ─────────────────────────────────────────────
  // PDF Sections
  // ─────────────────────────────────────────────

  private buildPdfSections(report: TrialBalanceResponse): PdfSection[] {
    const { summary, rows } = report;

    // ─── حالة التوازن (KPI مميّز)
    const balanceKpi = summary.isBalanced
      ? {
          label: '⚖️ حالة الميزان',
          value: 'متوازن ✓',
          hint: `فرق: ${this.formatNumber(summary.closingDifference)}`,
          color: 'success' as const,
        }
      : {
          label: '⚠️ حالة الميزان',
          value: 'غير متوازن',
          hint: `فرق: ${this.formatNumber(summary.closingDifference)}`,
          color: 'danger' as const,
        };

    // ─── هل نعرض إشعار عدم التوازن؟
    const unbalancedNote = !summary.isBalanced
      ? `⚠️ تنبيه: الميزان غير متوازن بفرق قدره ${this.formatNumber(summary.closingDifference)}. يرجى مراجعة القيود المحاسبية.`
      : undefined;

    // ─── حد أقصى 200 صف في PDF
    const PDF_MAX_ROWS = 200;
    const displayRows = rows.slice(0, PDF_MAX_ROWS);

    return [
      // ═══ 1. الملخص التنفيذي
      {
        heading: 'الملخص التنفيذي',
        kpis: [
          {
            label: 'عدد الحسابات',
            value: summary.totalAccounts,
            color: 'info',
          },
          {
            label: 'حسابات ذات نشاط',
            value: summary.accountsWithActivity,
            color: 'primary',
          },
          {
            label: 'الافتتاحي مدين',
            value: this.formatNumber(summary.totalOpeningDebit),
            color: 'info',
          },
          {
            label: 'الافتتاحي دائن',
            value: this.formatNumber(summary.totalOpeningCredit),
            color: 'info',
          },
          {
            label: 'حركة مدين',
            value: this.formatNumber(summary.totalMovementDebit),
            color: 'primary',
          },
          {
            label: 'حركة دائن',
            value: this.formatNumber(summary.totalMovementCredit),
            color: 'primary',
          },
          {
            label: 'الختامي مدين',
            value: this.formatNumber(summary.totalClosingDebit),
            color: 'success',
          },
          {
            label: 'الختامي دائن',
            value: this.formatNumber(summary.totalClosingCredit),
            color: 'success',
          },
          balanceKpi,
        ],
        note: unbalancedNote,
      },

      // ═══ 2. جدول الحسابات
      {
        heading: 'تفاصيل ميزان المراجعة',
        tables: [
          {
            columns: [
              { key: 'accountCode', label: 'الكود', align: 'right' },
              { key: 'accountName', label: 'اسم الحساب', align: 'right' },
              {
                key: 'openingDebit',
                label: 'افتتاحي مدين',
                align: 'left',
                format: 'currency',
              },
              {
                key: 'openingCredit',
                label: 'افتتاحي دائن',
                align: 'left',
                format: 'currency',
              },
              {
                key: 'movementDebit',
                label: 'حركة مدين',
                align: 'left',
                format: 'currency',
              },
              {
                key: 'movementCredit',
                label: 'حركة دائن',
                align: 'left',
                format: 'currency',
              },
              {
                key: 'closingDebit',
                label: 'ختامي مدين',
                align: 'left',
                format: 'currency',
              },
              {
                key: 'closingCredit',
                label: 'ختامي دائن',
                align: 'left',
                format: 'currency',
              },
            ],
            rows: displayRows,
            totals: {
              openingDebit: summary.totalOpeningDebit,
              openingCredit: summary.totalOpeningCredit,
              movementDebit: summary.totalMovementDebit,
              movementCredit: summary.totalMovementCredit,
              closingDebit: summary.totalClosingDebit,
              closingCredit: summary.totalClosingCredit,
            },
          },
        ],
        note:
          rows.length > PDF_MAX_ROWS
            ? `يعرض أول ${PDF_MAX_ROWS} حساب من إجمالي ${rows.length}. للقائمة الكاملة استخدم تصدير Excel.`
            : undefined,
      },
    ];
  }

  // ─────────────────────────────────────────────
  // Excel Sheets
  // ─────────────────────────────────────────────

  private buildExcelSheets(report: TrialBalanceResponse): ExcelSheet[] {
    const { summary, rows } = report;

    return [
      // ═══ 1. الملخص
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
          { label: 'عدد الحسابات', value: summary.totalAccounts },
          {
            label: 'حسابات ذات نشاط',
            value: summary.accountsWithActivity,
          },
          {
            label: 'إجمالي الافتتاحي مدين',
            value: summary.totalOpeningDebit,
          },
          {
            label: 'إجمالي الافتتاحي دائن',
            value: summary.totalOpeningCredit,
          },
          {
            label: 'فرق الافتتاحي',
            value: summary.openingDifference,
          },
          {
            label: 'إجمالي حركة مدين',
            value: summary.totalMovementDebit,
          },
          {
            label: 'إجمالي حركة دائن',
            value: summary.totalMovementCredit,
          },
          {
            label: 'فرق الحركة',
            value: summary.movementDifference,
          },
          {
            label: 'إجمالي الختامي مدين',
            value: summary.totalClosingDebit,
          },
          {
            label: 'إجمالي الختامي دائن',
            value: summary.totalClosingCredit,
          },
          {
            label: 'فرق الختامي',
            value: summary.closingDifference,
          },
          {
            label: 'حالة الميزان',
            value: summary.isBalanced ? 'متوازن ✓' : 'غير متوازن ⚠️',
          },
        ],
      },

      // ═══ 2. جدول ميزان المراجعة
      {
        name: 'ميزان المراجعة',
        title: report.meta.title,
        columns: [
          { key: 'accountCode', header: 'الكود', width: 16 },
          { key: 'accountName', header: 'اسم الحساب', width: 32 },
          {
            key: 'accountType',
            header: 'النوع',
            width: 12,
            align: 'center',
          },
          {
            key: 'openingDebit',
            header: 'افتتاحي مدين',
            width: 16,
            format: 'currency',
            align: 'left',
          },
          {
            key: 'openingCredit',
            header: 'افتتاحي دائن',
            width: 16,
            format: 'currency',
            align: 'left',
          },
          {
            key: 'movementDebit',
            header: 'حركة مدين',
            width: 16,
            format: 'currency',
            align: 'left',
          },
          {
            key: 'movementCredit',
            header: 'حركة دائن',
            width: 16,
            format: 'currency',
            align: 'left',
          },
          {
            key: 'closingDebit',
            header: 'ختامي مدين',
            width: 16,
            format: 'currency',
            align: 'left',
          },
          {
            key: 'closingCredit',
            header: 'ختامي دائن',
            width: 16,
            format: 'currency',
            align: 'left',
          },
        ],
        rows: rows,
        totals: {
          openingDebit: summary.totalOpeningDebit,
          openingCredit: summary.totalOpeningCredit,
          movementDebit: summary.totalMovementDebit,
          movementCredit: summary.totalMovementCredit,
          closingDebit: summary.totalClosingDebit,
          closingCredit: summary.totalClosingCredit,
        },
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
