import { Injectable } from '@nestjs/common';
import {
  PdfExporter,
  ExcelExporter,
  PdfSection,
  PdfTable,
  PdfTableColumn,
  PdfKpiCard,
  ExcelSheet,
  ExcelColumn,
} from 'src/shared/report-kit';
import { IncomeStatementService } from './income-statement.service';
import { IncomeStatementFilterDto } from '../dto/income-statement-filter.dto';
import {
  IncomeStatementResponse,
  IncomeStatementGroup,
  IncomeStatementLine,
} from '../interfaces/income-statement.interface';

// ─────────────────────────────────────────────────────────────
// Internal Types
// ─────────────────────────────────────────────────────────────

/**
 * صف مسطّح لجدول قائمة الدخل — يُستخدم في PDF و Excel معاً.
 *
 * حقول اختيارية (isSection, isTotal) تفيد التنسيق المستقبلي.
 */
interface FlatRow {
  label: string;
  amount: number | string | null;
  previousAmount: number | string | null;
  variance: number | string | null;
  variancePercentage: number | string | null;
  /** علامة لتمييز الصفوف الرأسية (بدون قيم) */
  isSection?: boolean;
  /** علامة لتمييز صفوف الإجماليات */
  isTotal?: boolean;
}

/**
 * IncomeStatementExportService
 * ────────────────────────────
 * تصدير قائمة الدخل إلى PDF (Landscape) و Excel.
 *
 * الميزات:
 *   📄 PDF: جدول هرمي موحّد + 4 KPIs + مقارنة شرطية
 *   📊 Excel: 3 sheets (الملخص + القائمة + تفاصيل الحسابات)
 *   🔒 Landscape يُفعّل تلقائياً عند تفعيل المقارنة فقط
 */
@Injectable()
export class IncomeStatementExportService {
  constructor(
    private readonly incomeStatementService: IncomeStatementService,
    private readonly pdfExporter: PdfExporter,
    private readonly excelExporter: ExcelExporter,
  ) {}

  // ─────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────

  async toPdf(
    filters: IncomeStatementFilterDto,
    companyId: string,
    userId: string,
  ): Promise<Buffer> {
    const report = await this.incomeStatementService.generate(
      filters,
      companyId,
      userId,
    );
    const hasComparison = report.comparison.mode !== 'NONE';

    return this.pdfExporter.render(
      report.meta,
      this.buildPdfSections(report),
      { landscape: hasComparison }, // ← ذكي
    );
  }

  async toExcel(
    filters: IncomeStatementFilterDto,
    companyId: string,
    userId: string,
  ): Promise<Buffer> {
    const report = await this.incomeStatementService.generate(
      filters,
      companyId,
      userId,
    );
    return this.excelExporter.render(report.meta, this.buildExcelSheets(report));
  }

  // ─────────────────────────────────────────────
  // PDF Sections
  // ─────────────────────────────────────────────

  private buildPdfSections(report: IncomeStatementResponse): PdfSection[] {
    const { summary, comparison } = report;
    const hasComparison = comparison.mode !== 'NONE';

    // ═══ 1. KPIs
    const netIncomeColor: 'success' | 'danger' =
      summary.netIncome >= 0 ? 'success' : 'danger';
    const marginColor: 'success' | 'warning' | 'danger' =
      summary.netIncomeMargin >= 10
        ? 'success'
        : summary.netIncomeMargin >= 0
          ? 'warning'
          : 'danger';

    const expenseRatio =
      summary.totalRevenue === 0
        ? 0
        : (summary.totalExpenses / summary.totalRevenue) * 100;

    const kpis: PdfKpiCard[] = [
      {
        label: 'إجمالي الإيرادات',
        value: this.formatNumber(summary.totalRevenue),
        hint: hasComparison
          ? `${this.formatSigned(summary.revenueGrowth)}%`
          : undefined,
        color: 'primary',
      },
      {
        label: 'إجمالي المصروفات',
        value: this.formatNumber(summary.totalExpenses),
        hint:
          summary.totalRevenue > 0
            ? `نسبة من الإيراد: ${this.formatNumber(expenseRatio)}%`
            : undefined,
        color: 'warning',
      },
      {
        label: 'صافي الدخل',
        value: this.formatNumber(summary.netIncome),
        hint: hasComparison
          ? `${this.formatSigned(summary.netIncomeGrowth)}%`
          : undefined,
        color: netIncomeColor,
      },
      {
        label: 'هامش الربح',
        value: `${this.formatNumber(summary.netIncomeMargin)}%`,
        hint: hasComparison
          ? `سابقاً: ${this.formatNumber(summary.previousNetIncomeMargin ?? 0)}%`
          : undefined,
        color: marginColor,
      },
    ];

    return [
      {
        heading: 'الملخص التنفيذي',
        kpis,
      },
      {
        heading: 'قائمة الدخل',
        tables: [this.buildIncomeStatementTable(report)],
        note: comparison.label
          ? `المقارنة: ${comparison.label}`
          : undefined,
      },
    ];
  }

  // ─────────────────────────────────────────────
  // Unified Table Builder (PDF + Excel source of truth)
  // ─────────────────────────────────────────────

  /**
   * يبني الجدول الموحّد — يُستخدم في PDF مباشرة وفي Excel كصفوف.
   */
  private buildIncomeStatementTable(report: IncomeStatementResponse): PdfTable {
    const hasComparison = report.comparison.mode !== 'NONE';
    const rows = this.buildFlatRows(report);

    const columns: PdfTableColumn[] = [
      { key: 'label', label: 'البند', align: 'right', width: '40%' },
      {
        key: 'amount',
        label: 'الفترة الحالية',
        align: 'left',
        format: 'currency',
      },
    ];

    if (hasComparison) {
      columns.push(
        {
          key: 'previousAmount',
          label: 'الفترة السابقة',
          align: 'left',
          format: 'currency',
        },
        {
          key: 'variance',
          label: 'الفرق',
          align: 'left',
          format: 'currency',
        },
        {
          key: 'variancePercentage',
          label: 'الفرق %',
          align: 'left',
          format: 'number',
        },
      );
    }

    return {
      columns,
      rows: rows as unknown as Record<string, unknown>[],
    };
  }

  /**
   * المصدر الوحيد للبيانات — DRY.
   */
  private buildFlatRows(report: IncomeStatementResponse): FlatRow[] {
    const { summary, comparison } = report;
    const hasComparison = comparison.mode !== 'NONE';
    const revenue = this.findGroup(report.groups, 'REVENUE');
    const expenses = this.findGroup(report.groups, 'EXPENSE');

    const rows: FlatRow[] = [];

    // ─── الإيرادات
    rows.push(this.sectionRow('◆ الإيرادات', hasComparison));
    for (const line of revenue.lines) {
      if (line.level === 1) continue; // الجذور تُعرض في الإجمالي
      rows.push(this.lineToRow(line, hasComparison));
    }
    rows.push(
      this.totalRow(
        'إجمالي الإيرادات',
        revenue.total,
        revenue.previousTotal,
        revenue.variance,
        revenue.variancePercentage,
        hasComparison,
      ),
    );

    // ─── فاصل
    rows.push(this.emptyRow(hasComparison));

    // ─── المصروفات
    rows.push(this.sectionRow('◆ المصروفات', hasComparison));
    for (const line of expenses.lines) {
      if (line.level === 1) continue;
      rows.push(this.lineToRow(line, hasComparison));
    }
    rows.push(
      this.totalRow(
        'إجمالي المصروفات',
        summary.totalExpenses,
        summary.previousTotalExpenses,
        summary.expensesVariance,
        summary.expensesGrowth,
        hasComparison,
      ),
    );

    // ─── صافي الدخل
    rows.push(this.emptyRow(hasComparison));
    rows.push(
      this.totalRow(
        '◆◆ صافي الدخل',
        summary.netIncome,
        summary.previousNetIncome,
        summary.netIncomeVariance,
        summary.netIncomeGrowth,
        hasComparison,
      ),
    );

    return rows;
  }

  // ─────────────────────────────────────────────
  // Row Builders
  // ─────────────────────────────────────────────

  private sectionRow(label: string, hasComparison: boolean): FlatRow {
    return {
      label,
      amount: null,
      previousAmount: hasComparison ? null : null,
      variance: null,
      variancePercentage: null,
      isSection: true,
    };
  }

  private emptyRow(hasComparison: boolean): FlatRow {
    return {
      label: '',
      amount: null,
      previousAmount: hasComparison ? null : null,
      variance: null,
      variancePercentage: null,
    };
  }

  private totalRow(
    label: string,
    amount: number,
    previousAmount: number | null,
    variance: number | null,
    variancePercentage: number | null,
    hasComparison: boolean,
  ): FlatRow {
    return {
      label,
      amount,
      previousAmount: hasComparison ? previousAmount : null,
      variance: hasComparison ? variance : null,
      variancePercentage: hasComparison ? variancePercentage : null,
      isTotal: true,
    };
  }

  /**
   * يستخدم \u00A0 (non-breaking spaces) للإزاحة — لا تُطوى في HTML/Excel.
   */
  private lineToRow(
    line: IncomeStatementLine,
    hasComparison: boolean,
  ): FlatRow {
    const depth = Math.max(0, line.level - 1);
    const indent = '\u00A0\u00A0\u00A0\u00A0'.repeat(depth);
    const label = `${indent}${line.accountCode} — ${line.accountName}`;

    return {
      label,
      amount: line.amount,
      previousAmount: hasComparison ? line.previousAmount : null,
      variance: hasComparison ? line.variance : null,
      variancePercentage: hasComparison ? line.variancePercentage : null,
    };
  }

  // ─────────────────────────────────────────────
  // Excel Sheets
  // ─────────────────────────────────────────────

  private buildExcelSheets(report: IncomeStatementResponse): ExcelSheet[] {
    const { summary, comparison } = report;
    const hasComparison = comparison.mode !== 'NONE';
    const revenue = this.findGroup(report.groups, 'REVENUE');
    const expenses = this.findGroup(report.groups, 'EXPENSE');

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
        rows: this.buildSummarySheetRows(report),
      },

      // ═══ 2. قائمة الدخل (نفس بنية PDF)
      {
        name: 'قائمة الدخل',
        title: report.meta.title,
        columns: this.buildExcelIncomeColumns(hasComparison),
        rows: this.buildFlatRows(report) as unknown as Record<string, unknown>[],
      },

      // ═══ 3. تفاصيل الحسابات (لتحليل PivotTable)
      {
        name: 'تفاصيل الحسابات',
        columns: this.buildExcelDetailColumns(hasComparison),
        rows: [
          ...revenue.lines.map((l) =>
            this.lineToDetailRow(l, 'إيرادات', hasComparison),
          ),
          ...expenses.lines.map((l) =>
            this.lineToDetailRow(l, 'مصروفات', hasComparison),
          ),
        ],
      },
    ];
  }

  private buildSummarySheetRows(report: IncomeStatementResponse) {
    const { summary, comparison } = report;
    const hasComparison = comparison.mode !== 'NONE';

    const base = [
      { label: 'إجمالي الإيرادات', value: summary.totalRevenue },
      { label: 'إجمالي المصروفات', value: summary.totalExpenses },
      { label: 'صافي الدخل', value: summary.netIncome },
      { label: 'هامش الربح %', value: summary.netIncomeMargin },
    ];

    if (!hasComparison) return base;

    return [
      ...base,
      {
        label: '— الفترة السابقة —',
        value: '',
      },
      {
        label: 'إيرادات الفترة السابقة',
        value: summary.previousTotalRevenue ?? 0,
      },
      {
        label: 'مصروفات الفترة السابقة',
        value: summary.previousTotalExpenses ?? 0,
      },
      {
        label: 'صافي الدخل السابق',
        value: summary.previousNetIncome ?? 0,
      },
      { label: '— النمو —', value: '' },
      {
        label: 'نمو الإيرادات %',
        value: summary.revenueGrowth ?? 0,
      },
      {
        label: 'نمو المصروفات %',
        value: summary.expensesGrowth ?? 0,
      },
      {
        label: 'نمو صافي الدخل %',
        value: summary.netIncomeGrowth ?? 0,
      },
    ];
  }

  private buildExcelIncomeColumns(hasComparison: boolean): ExcelColumn[] {
    const cols: ExcelColumn[] = [
      { key: 'label', header: 'البند', width: 45 },
      {
        key: 'amount',
        header: 'الفترة الحالية',
        width: 18,
        format: 'currency',
        align: 'left',
      },
    ];

    if (hasComparison) {
      cols.push(
        {
          key: 'previousAmount',
          header: 'الفترة السابقة',
          width: 18,
          format: 'currency',
          align: 'left',
        },
        {
          key: 'variance',
          header: 'الفرق',
          width: 16,
          format: 'currency',
          align: 'left',
        },
        {
          key: 'variancePercentage',
          header: 'الفرق %',
          width: 12,
          format: 'number',
          align: 'left',
        },
      );
    }

    return cols;
  }

  private buildExcelDetailColumns(hasComparison: boolean): ExcelColumn[] {
    const cols: ExcelColumn[] = [
      { key: 'group', header: 'المجموعة', width: 14, align: 'center' },
      { key: 'accountCode', header: 'كود الحساب', width: 14 },
      { key: 'accountName', header: 'اسم الحساب', width: 32 },
      { key: 'level', header: 'المستوى', width: 10, align: 'center' },
      { key: 'isLeaf', header: 'طرفي؟', width: 10, align: 'center' },
      {
        key: 'amount',
        header: 'الفترة الحالية',
        width: 18,
        format: 'currency',
        align: 'left',
      },
    ];

    if (hasComparison) {
      cols.push(
        {
          key: 'previousAmount',
          header: 'الفترة السابقة',
          width: 18,
          format: 'currency',
          align: 'left',
        },
        {
          key: 'variance',
          header: 'الفرق',
          width: 16,
          format: 'currency',
          align: 'left',
        },
      );
    }

    return cols;
  }

  private lineToDetailRow(
    line: IncomeStatementLine,
    group: string,
    hasComparison: boolean,
  ) {
    return {
      group,
      accountCode: line.accountCode,
      accountName: line.accountName,
      level: line.level,
      isLeaf: line.isLeaf ? 'نعم' : 'لا',
      amount: line.amount,
      previousAmount: hasComparison ? line.previousAmount : null,
      variance: hasComparison ? line.variance : null,
    };
  }

  // ─────────────────────────────────────────────
  // Safe Helpers
  // ─────────────────────────────────────────────

  /**
   * يُرجع مجموعة بأمان — مع fallback افتراضي عند الغياب.
   */
  private findGroup(
    groups: IncomeStatementGroup[],
    key: 'REVENUE' | 'EXPENSE',
  ): IncomeStatementGroup {
    return (
      groups.find((g) => g.groupKey === key) ?? {
        groupKey: key,
        groupLabel: key === 'REVENUE' ? 'الإيرادات' : 'المصروفات',
        lines: [],
        total: 0,
        previousTotal: null,
        variance: null,
        variancePercentage: null,
      }
    );
  }

  private formatNumber(value: number): string {
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  /**
   * تنسيق موقّع للنمو — يعرض "+" فقط للأرقام الموجبة غير الصفرية.
   */
  private formatSigned(value: number | null): string {
    if (value === null) return '—';
    if (value === 0) return '0.00';
    const prefix = value > 0 ? '+' : '';
    return `${prefix}${this.formatNumber(value)}`;
  }
}
