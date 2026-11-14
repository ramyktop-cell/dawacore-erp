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
import { BalanceSheetService } from './balance-sheet.service';
import { BalanceSheetFilterDto } from '../dto/balance-sheet-filter.dto';
import {
  BalanceSheetResponse,
  BalanceSheetGroup,
  BalanceSheetLine,
  BalanceSheetRatio,
} from '../interfaces/balance-sheet.interface';

// ─────────────────────────────────────────────────────────────
// Internal Types
// ─────────────────────────────────────────────────────────────

interface FlatRow {
  label: string;
  balance: number | string | null;
  previousBalance: number | string | null;
  variance: number | string | null;
  variancePercentage: number | string | null;
  isSection?: boolean;
  isTotal?: boolean;
  isVirtual?: boolean;
}

// ─────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────

/**
 * BalanceSheetExportService
 * ─────────────────────────
 * تصدير الميزانية العمومية إلى PDF (Landscape عند المقارنة) و Excel.
 *
 * الميزات:
 *   📄 PDF: KPIs (توازن + مؤشرات) + جدول موحّد (Assets/Liab/Equity)
 *   📊 Excel: 4 sheets (الملخص، الميزانية، المؤشرات، تفاصيل الحسابات)
 *   ⚡ تمييز السطور الافتراضية (Retained Earnings / Net Income)
 */
@Injectable()
export class BalanceSheetExportService {
  constructor(
    private readonly balanceSheetService: BalanceSheetService,
    private readonly pdfExporter: PdfExporter,
    private readonly excelExporter: ExcelExporter,
  ) {}

  // ─────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────

  async toPdf(
    filters: BalanceSheetFilterDto,
    companyId: string,
    userId: string,
  ): Promise<Buffer> {
    const report = await this.balanceSheetService.generate(filters, companyId, userId);
    const hasComparison = report.comparison.mode !== 'NONE';

    return this.pdfExporter.render(
      report.meta,
      this.buildPdfSections(report),
      { landscape: hasComparison },
    );
  }

  async toExcel(
    filters: BalanceSheetFilterDto,
    companyId: string,
    userId: string,
  ): Promise<Buffer> {
    const report = await this.balanceSheetService.generate(filters, companyId, userId);
    return this.excelExporter.render(report.meta, this.buildExcelSheets(report));
  }

  // ─────────────────────────────────────────────
  // PDF Sections
  // ─────────────────────────────────────────────

  private buildPdfSections(report: BalanceSheetResponse): PdfSection[] {
    const { summary, comparison } = report;
    const hasComparison = comparison.mode !== 'NONE';

    // ═══ 1. Balance Status KPI + Main Group Totals
    const balanceKpi: PdfKpiCard = summary.isBalanced
      ? {
          label: '⚖️ حالة الميزانية',
          value: 'متوازنة ✓',
          hint: `فرق: ${this.formatNumber(summary.balanceDifference)}`,
          color: 'success',
        }
      : {
          label: '⚠️ حالة الميزانية',
          value: 'غير متوازنة',
          hint: `فرق: ${this.formatNumber(summary.balanceDifference)}`,
          color: 'danger',
        };

    const kpis: PdfKpiCard[] = [
      {
        label: 'إجمالي الأصول',
        value: this.formatNumber(summary.totalAssets),
        hint:
          hasComparison && summary.assetsVariance !== null
            ? `${this.formatSigned(summary.assetsVariance)}`
            : undefined,
        color: 'primary',
      },
      {
        label: 'إجمالي الخصوم',
        value: this.formatNumber(summary.totalLiabilities),
        hint:
          hasComparison && summary.liabilitiesVariance !== null
            ? `${this.formatSigned(summary.liabilitiesVariance)}`
            : undefined,
        color: 'warning',
      },
      {
        label: 'حقوق الملكية',
        value: this.formatNumber(summary.totalEquity),
        hint:
          hasComparison && summary.equityVariance !== null
            ? `${this.formatSigned(summary.equityVariance)}`
            : undefined,
        color: 'info',
      },
      balanceKpi,
    ];

    // ═══ 2. النسب المالية الرئيسية (KPIs إضافية)
    const ratioKpis: PdfKpiCard[] = summary.ratios.slice(0, 4).map((r) => ({
      label: r.label,
      value: this.formatRatioValue(r),
      hint: r.hint,
      color: r.isHealthy ? 'success' : 'warning',
    }));

    // ═══ 3. Banner للتوازن (ملاحظة عند عدم التوازن)
    const balanceNote = summary.isBalanced
      ? `✅ المعادلة متوازنة: الأصول (${this.formatNumber(summary.totalAssets)}) = الخصوم + حقوق الملكية (${this.formatNumber(summary.totalLiabilities + summary.totalEquity)})`
      : `⚠️ تنبيه: يوجد فرق ${this.formatNumber(summary.balanceDifference)} بين الأصول والخصوم + حقوق الملكية. يرجى مراجعة القيود.`;

    const sections: PdfSection[] = [
      {
        heading: 'الملخص التنفيذي',
        kpis,
        note: balanceNote,
      },
      {
        heading: 'المؤشرات المالية',
        kpis: ratioKpis.length > 0 ? ratioKpis : undefined,
        note: ratioKpis.length === 0 ? 'لا تتوفر بيانات كافية لحساب المؤشرات.' : undefined,
      },
      {
        heading: 'الميزانية العمومية',
        tables: [this.buildBalanceSheetTable(report)],
        note: comparison.label ? `المقارنة: ${comparison.label}` : undefined,
      },
    ];

    return sections;
  }

  // ─────────────────────────────────────────────
  // Unified Balance Sheet Table
  // ─────────────────────────────────────────────

  private buildBalanceSheetTable(report: BalanceSheetResponse): PdfTable {
    const hasComparison = report.comparison.mode !== 'NONE';
    const rows = this.buildFlatRows(report);

    const columns: PdfTableColumn[] = [
      { key: 'label', label: 'البند', align: 'right', width: '40%' },
      {
        key: 'balance',
        label: 'الرصيد',
        align: 'left',
        format: 'currency',
      },
    ];

    if (hasComparison) {
      columns.push(
        {
          key: 'previousBalance',
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

  // ─────────────────────────────────────────────
  // Flat Rows — Source of truth for PDF + Excel
  // ─────────────────────────────────────────────

  private buildFlatRows(report: BalanceSheetResponse): FlatRow[] {
    const { summary } = report;
    const hasComparison = report.comparison.mode !== 'NONE';
    const assets = this.findGroup(report.groups, 'ASSETS');
    const liabilities = this.findGroup(report.groups, 'LIABILITIES');
    const equity = this.findGroup(report.groups, 'EQUITY');

    const rows: FlatRow[] = [];

    // ─── الأصول
    rows.push(this.sectionRow('◆ الأصول', hasComparison));
    for (const line of assets.lines) {
      if (line.level === 1) continue;
      rows.push(this.lineToRow(line, hasComparison));
    }
    rows.push(
      this.totalRow(
        'إجمالي الأصول',
        summary.totalAssets,
        summary.previousTotalAssets,
        summary.assetsVariance,
        hasComparison,
      ),
    );

    rows.push(this.emptyRow(hasComparison));

    // ─── الخصوم
    rows.push(this.sectionRow('◆ الخصوم', hasComparison));
    for (const line of liabilities.lines) {
      if (line.level === 1) continue;
      rows.push(this.lineToRow(line, hasComparison));
    }
    rows.push(
      this.totalRow(
        'إجمالي الخصوم',
        summary.totalLiabilities,
        summary.previousTotalLiabilities,
        summary.liabilitiesVariance,
        hasComparison,
      ),
    );

    rows.push(this.emptyRow(hasComparison));

    // ─── حقوق الملكية
    rows.push(this.sectionRow('◆ حقوق الملكية', hasComparison));
    for (const line of equity.lines) {
      if (line.level === 1) continue;
      rows.push(this.lineToRow(line, hasComparison));
    }
    rows.push(
      this.totalRow(
        'إجمالي حقوق الملكية',
        summary.totalEquity,
        summary.previousTotalEquity,
        summary.equityVariance,
        hasComparison,
      ),
    );

    // ─── Grand Total: Liabilities + Equity
    rows.push(this.emptyRow(hasComparison));
    rows.push(
      this.totalRow(
        '◆◆ إجمالي الخصوم + حقوق الملكية',
        summary.totalLiabilities + summary.totalEquity,
        hasComparison
          ? (summary.previousTotalLiabilities ?? 0) + (summary.previousTotalEquity ?? 0)
          : null,
        hasComparison
          ? (summary.liabilitiesVariance ?? 0) + (summary.equityVariance ?? 0)
          : null,
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
      balance: null,
      previousBalance: hasComparison ? null : null,
      variance: null,
      variancePercentage: null,
      isSection: true,
    };
  }

  private emptyRow(hasComparison: boolean): FlatRow {
    return {
      label: '',
      balance: null,
      previousBalance: hasComparison ? null : null,
      variance: null,
      variancePercentage: null,
    };
  }

  private totalRow(
    label: string,
    balance: number,
    previousBalance: number | null,
    variance: number | null,
    hasComparison: boolean,
  ): FlatRow {
    const variancePercentage =
      hasComparison && previousBalance !== null && previousBalance !== 0
        ? ((balance - previousBalance) / Math.abs(previousBalance)) * 100
        : null;

    return {
      label,
      balance,
      previousBalance: hasComparison ? previousBalance : null,
      variance: hasComparison ? variance : null,
      variancePercentage: hasComparison ? variancePercentage : null,
      isTotal: true,
    };
  }

  private lineToRow(line: BalanceSheetLine, hasComparison: boolean): FlatRow {
    const depth = Math.max(0, line.level - 1);
    const indent = '\u00A0\u00A0\u00A0\u00A0'.repeat(depth);
    const virtualMark = line.isVirtual ? '⚡ ' : '';
    const label = `${indent}${virtualMark}${line.accountCode} — ${line.accountName}`;

    return {
      label,
      balance: line.absoluteBalance,
      previousBalance: hasComparison
        ? line.previousBalance === null
          ? null
          : Math.abs(line.previousBalance)
        : null,
      variance: hasComparison ? line.variance : null,
      variancePercentage: hasComparison ? line.variancePercentage : null,
      isVirtual: line.isVirtual,
    };
  }

  // ─────────────────────────────────────────────
  // Excel Sheets
  // ─────────────────────────────────────────────

  private buildExcelSheets(report: BalanceSheetResponse): ExcelSheet[] {
    const { summary, comparison } = report;
    const hasComparison = comparison.mode !== 'NONE';
    const assets = this.findGroup(report.groups, 'ASSETS');
    const liabilities = this.findGroup(report.groups, 'LIABILITIES');
    const equity = this.findGroup(report.groups, 'EQUITY');

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

      // ═══ 2. الميزانية العمومية
      {
        name: 'الميزانية',
        title: report.meta.title,
        columns: this.buildExcelSheetColumns(hasComparison),
        rows: this.buildFlatRows(report) as unknown as Record<string, unknown>[],
      },

      // ═══ 3. المؤشرات المالية
      {
        name: 'المؤشرات المالية',
        columns: [
          { key: 'label', header: 'المؤشر', width: 32 },
          {
            key: 'value',
            header: 'القيمة',
            width: 18,
            format: 'number',
            align: 'left',
          },
          { key: 'status', header: 'الحالة', width: 14, align: 'center' },
          { key: 'hint', header: 'الوصف', width: 40 },
        ],
        rows: summary.ratios.map((r) => ({
          label: r.label,
          value: r.value,
          status: r.isHealthy ? '✓ سليم' : '⚠️ يحتاج مراجعة',
          hint: r.hint ?? '',
        })),
      },

      // ═══ 4. تفاصيل الحسابات
      {
        name: 'تفاصيل الحسابات',
        columns: this.buildExcelDetailColumns(hasComparison),
        rows: [
          ...assets.lines.map((l) => this.lineToDetailRow(l, 'الأصول', hasComparison)),
          ...liabilities.lines.map((l) =>
            this.lineToDetailRow(l, 'الخصوم', hasComparison),
          ),
          ...equity.lines.map((l) => this.lineToDetailRow(l, 'حقوق الملكية', hasComparison)),
        ],
      },
    ];
  }

  private buildSummarySheetRows(report: BalanceSheetResponse) {
    const { summary, comparison, fiscalYear } = report;
    const hasComparison = comparison.mode !== 'NONE';

    const base = [
      { label: '— الفترة الحالية —', value: '' },
      { label: 'إجمالي الأصول', value: summary.totalAssets },
      { label: 'إجمالي الخصوم', value: summary.totalLiabilities },
      { label: 'إجمالي حقوق الملكية', value: summary.totalEquity },
      { label: 'الأصول المتداولة', value: summary.currentAssets },
      { label: 'الأصول غير المتداولة', value: summary.nonCurrentAssets },
      { label: 'الخصوم المتداولة', value: summary.currentLiabilities },
      { label: 'الخصوم غير المتداولة', value: summary.nonCurrentLiabilities },
      { label: 'الأرباح المبقاة (تراكمي)', value: summary.retainedEarnings },
      { label: 'صافي دخل السنة الحالية', value: summary.currentPeriodNetIncome },
      { label: 'فرق التوازن', value: summary.balanceDifference },
      { label: 'حالة التوازن', value: summary.isBalanced ? 'متوازنة ✓' : 'غير متوازنة ⚠️' },
      { label: 'بداية السنة المالية', value: fiscalYear.startDate },
    ];

    if (!hasComparison) return base;

    return [
      ...base,
      { label: '— المقارنة —', value: '' },
      { label: 'مقارنة مع', value: comparison.label ?? '' },
      { label: 'أصول الفترة السابقة', value: summary.previousTotalAssets ?? 0 },
      { label: 'خصوم الفترة السابقة', value: summary.previousTotalLiabilities ?? 0 },
      {
        label: 'حقوق ملكية الفترة السابقة',
        value: summary.previousTotalEquity ?? 0,
      },
      { label: 'فرق الأصول', value: summary.assetsVariance ?? 0 },
      { label: 'فرق الخصوم', value: summary.liabilitiesVariance ?? 0 },
      { label: 'فرق حقوق الملكية', value: summary.equityVariance ?? 0 },
    ];
  }

  private buildExcelSheetColumns(hasComparison: boolean): ExcelColumn[] {
    const cols: ExcelColumn[] = [
      { key: 'label', header: 'البند', width: 48 },
      {
        key: 'balance',
        header: 'الرصيد',
        width: 18,
        format: 'currency',
        align: 'left',
      },
    ];

    if (hasComparison) {
      cols.push(
        {
          key: 'previousBalance',
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
      { key: 'group', header: 'المجموعة', width: 16, align: 'center' },
      { key: 'accountCode', header: 'كود الحساب', width: 16 },
      { key: 'accountName', header: 'اسم الحساب', width: 32 },
      { key: 'level', header: 'المستوى', width: 10, align: 'center' },
      { key: 'isLeaf', header: 'طرفي؟', width: 10, align: 'center' },
      { key: 'isVirtual', header: 'افتراضي؟', width: 12, align: 'center' },
      {
        key: 'absoluteBalance',
        header: 'الرصيد',
        width: 18,
        format: 'currency',
        align: 'left',
      },
      { key: 'debit', header: 'مدين', width: 16, format: 'currency', align: 'left' },
      { key: 'credit', header: 'دائن', width: 16, format: 'currency', align: 'left' },
    ];

    if (hasComparison) {
      cols.push(
        {
          key: 'previousBalance',
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
    line: BalanceSheetLine,
    group: string,
    hasComparison: boolean,
  ) {
    return {
      group,
      accountCode: line.accountCode,
      accountName: line.accountName,
      level: line.level,
      isLeaf: line.isLeaf ? 'نعم' : 'لا',
      isVirtual: line.isVirtual ? '⚡' : '',
      absoluteBalance: line.absoluteBalance,
      debit: line.debit,
      credit: line.credit,
      previousBalance: hasComparison
        ? line.previousBalance === null
          ? null
          : Math.abs(line.previousBalance)
        : null,
      variance: hasComparison ? line.variance : null,
    };
  }

  // ─────────────────────────────────────────────
  // Safe Helpers
  // ─────────────────────────────────────────────

  private findGroup(
    groups: BalanceSheetGroup[],
    key: 'ASSETS' | 'LIABILITIES' | 'EQUITY',
  ): BalanceSheetGroup {
    return (
      groups.find((g) => g.groupKey === key) ?? {
        groupKey: key,
        groupLabel:
          key === 'ASSETS' ? 'الأصول' : key === 'LIABILITIES' ? 'الخصوم' : 'حقوق الملكية',
        lines: [],
        total: 0,
        previousTotal: null,
        variance: null,
        variancePercentage: null,
      }
    );
  }

  /**
   * ينسّق قيمة المؤشر المالي حسب نوعه.
   * النسب المئوية (debtRatio, equityRatio) → مع %
   * الباقي → كأرقام.
   */
  private formatRatioValue(r: BalanceSheetRatio): string {
    if (r.key === 'debtRatio' || r.key === 'equityRatio') {
      return `${this.formatNumber(r.value)}%`;
    }
    return this.formatNumber(r.value);
  }

  private formatNumber(value: number): string {
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  private formatSigned(value: number | null): string {
    if (value === null) return '—';
    if (value === 0) return '0.00';
    const prefix = value > 0 ? '+' : '';
    return `${prefix}${this.formatNumber(value)}`;
  }
}
