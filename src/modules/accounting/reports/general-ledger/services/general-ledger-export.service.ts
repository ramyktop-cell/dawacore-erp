import { Injectable } from '@nestjs/common';
import {
  PdfExporter,
  ExcelExporter,
  PdfSection,
  PdfTable,
  ExcelSheet,
} from 'src/shared/report-kit';
import { GeneralLedgerService } from './general-ledger.service';
import { GeneralLedgerFilterDto } from '../dto/general-ledger-filter.dto';
import {
  GeneralLedgerResponse,
  GeneralLedgerEntry,
  AccountLedger,
  GeneralLedgerCounterparty,
} from '../interfaces/general-ledger.interface';

/**
 * GeneralLedgerExportService
 * ──────────────────────────
 * تصدير دفتر الأستاذ العام.
 *
 * PDF (Landscape A4):
 *   1. الملخص التنفيذي
 *   2. فهرس الحسابات (كل الحسابات)
 *   3. تفاصيل الحسابات النشطة (Single: الحساب المطلوب / All: أعلى 15)
 *
 * Excel:
 *   1. الملخص
 *   2. فهرس الحسابات
 *   3. القيود التفصيلية (كل القيود مسطحة — مع accountCode)
 */
@Injectable()
export class GeneralLedgerExportService {
  /** حد أقصى لعدد القيود المعروضة في PDF لكل حساب. */
  private readonly PDF_MAX_ENTRIES_PER_ACCOUNT = 50;

  /** حد أقصى لعدد الحسابات المفصّلة في PDF (All Mode). */
  private readonly PDF_MAX_DETAILED_ACCOUNTS = 15;

  constructor(
    private readonly generalLedgerService: GeneralLedgerService,
    private readonly pdfExporter: PdfExporter,
    private readonly excelExporter: ExcelExporter,
  ) {}

  // ─────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────

  async toPdf(
    filters: GeneralLedgerFilterDto,
    companyId: string,
    userId: string,
  ): Promise<Buffer> {
    const report = await this.generalLedgerService.generate(
      filters,
      companyId,
      userId,
    );
    return this.pdfExporter.render(
      report.meta,
      this.buildPdfSections(report, filters),
      { landscape: true },
    );
  }

  async toExcel(
    filters: GeneralLedgerFilterDto,
    companyId: string,
    userId: string,
  ): Promise<Buffer> {
    const report = await this.generalLedgerService.generate(
      filters,
      companyId,
      userId,
    );
    return this.excelExporter.render(report.meta, this.buildExcelSheets(report));
  }

  // ─────────────────────────────────────────────
  // PDF Sections
  // ─────────────────────────────────────────────

  private buildPdfSections(
    report: GeneralLedgerResponse,
    filters: GeneralLedgerFilterDto,
  ): PdfSection[] {
    const { summary, accounts } = report;
    const isSingleMode = !!filters.accountId;

    const sections: PdfSection[] = [];

    // ═══ 1. الملخص التنفيذي
    const balanceKpi = summary.isBalanced
      ? {
          label: '⚖️ حالة التوازن',
          value: 'متوازن ✓',
          hint: `فرق: ${this.formatNumber(summary.difference)}`,
          color: 'success' as const,
        }
      : {
          label: '⚠️ حالة التوازن',
          value: 'غير متوازن',
          hint: `فرق: ${this.formatNumber(summary.difference)}`,
          color: 'danger' as const,
        };

    sections.push({
      heading: 'الملخص التنفيذي',
      kpis: [
        {
          label: 'عدد الحسابات',
          value: summary.accountsCount,
          color: 'info',
        },
        {
          label: 'حسابات ذات نشاط',
          value: summary.accountsWithActivity,
          color: 'primary',
        },
        {
          label: 'إجمالي القيود المعروضة',
          value: summary.totalEntriesDisplayed.toLocaleString('en-US'),
          color: 'info',
        },
        {
          label: 'إجمالي مدين',
          value: this.formatNumber(summary.totalDebit),
          color: 'primary',
        },
        {
          label: 'إجمالي دائن',
          value: this.formatNumber(summary.totalCredit),
          color: 'primary',
        },
        balanceKpi,
      ],
      note: !summary.isBalanced
        ? `⚠️ تنبيه: يوجد فرق محاسبي قدره ${this.formatNumber(summary.difference)}. يرجى مراجعة القيود.`
        : undefined,
    });

    // ═══ 2. فهرس الحسابات
    sections.push({
      heading: 'فهرس الحسابات',
      tables: [
        {
          columns: [
            { key: 'accountCode', label: 'الكود', align: 'right' },
            { key: 'accountName', label: 'اسم الحساب', align: 'right' },
            {
              key: 'openingBalance',
              label: 'افتتاحي',
              align: 'left',
              format: 'currency',
            },
            {
              key: 'totalDebit',
              label: 'مدين',
              align: 'left',
              format: 'currency',
            },
            {
              key: 'totalCredit',
              label: 'دائن',
              align: 'left',
              format: 'currency',
            },
            {
              key: 'closingBalance',
              label: 'ختامي',
              align: 'left',
              format: 'currency',
            },
            {
              key: 'totalEntries',
              label: 'القيود',
              align: 'center',
              format: 'number',
            },
          ],
          rows: accounts.map((a) => this.mapAccountRow(a)),
          totals: {
            openingBalance: accounts.reduce(
              (s, a) => s + a.openingBalance,
              0,
            ),
            totalDebit: accounts.reduce((s, a) => s + a.totalDebit, 0),
            totalCredit: accounts.reduce((s, a) => s + a.totalCredit, 0),
            closingBalance: accounts.reduce(
              (s, a) => s + a.closingBalance,
              0,
            ),
            totalEntries: accounts.reduce((s, a) => s + a.totalEntries, 0),
          },
        },
      ],
      note: isSingleMode
        ? undefined
        : 'لعرض كشف مفصّل لحساب معين، استخدم فلتر accountId.',
    });

    // ═══ 3. تفاصيل الحسابات
    const accountsToDetail = this.selectAccountsForDetail(accounts, isSingleMode);

    if (accountsToDetail.length > 0) {
      for (const account of accountsToDetail) {
        sections.push(this.buildAccountDetailSection(account));
      }
    }

    return sections;
  }

  // ─────────────────────────────────────────────
  // Per-Account PDF Section
  // ─────────────────────────────────────────────

  private buildAccountDetailSection(account: AccountLedger): PdfSection {
    const displayEntries = account.entries.slice(
      0,
      this.PDF_MAX_ENTRIES_PER_ACCOUNT,
    );

    // وصف الرصيد الافتتاحي/الختامي بالعربي
    const openingLabel = this.formatBalanceLabel(
      account.openingDebit,
      account.openingCredit,
    );
    const closingLabel = this.formatBalanceLabel(
      account.closingDebit,
      account.closingCredit,
    );

    const noteLines: string[] = [
      `الافتتاحي: ${openingLabel}`,
      `الختامي: ${closingLabel}`,
      `إجمالي مدين: ${this.formatNumber(account.totalDebit)}`,
      `إجمالي دائن: ${this.formatNumber(account.totalCredit)}`,
    ];

    if (account.isTruncated) {
      noteLines.push(
        `⚠️ يُعرض ${displayEntries.length} من ${account.totalEntries} قيد. لرؤية الباقي، استخدم Excel.`,
      );
    }

    const table: PdfTable = {
      columns: [
        { key: 'date', label: 'التاريخ', align: 'center' },
        { key: 'entryNumber', label: 'رقم القيد', align: 'right' },
        { key: 'description', label: 'البيان', align: 'right' },
        { key: 'counterpartyLabel', label: 'الطرف المقابل', align: 'right' },
        {
          key: 'debit',
          label: 'مدين',
          align: 'left',
          format: 'currency',
        },
        {
          key: 'credit',
          label: 'دائن',
          align: 'left',
          format: 'currency',
        },
        {
          key: 'runningBalance',
          label: 'الرصيد',
          align: 'left',
          format: 'currency',
        },
      ],
      rows: displayEntries.map((e) => this.mapEntryRow(e)),
      totals: {
        debit: account.totalDebit,
        credit: account.totalCredit,
      },
    };

    return {
      heading: `${account.accountCode} — ${account.accountName}`,
      tables: [table],
      note: noteLines.join(' | '),
    };
  }

  // ─────────────────────────────────────────────
  // Excel Sheets
  // ─────────────────────────────────────────────

  private buildExcelSheets(report: GeneralLedgerResponse): ExcelSheet[] {
    const { summary, accounts } = report;

    // ═══ 1. الملخص
    const balanceStatus = summary.isBalanced
      ? 'متوازن ✓'
      : 'غير متوازن ⚠️';

    const summarySheet: ExcelSheet = {
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
        { label: 'عدد الحسابات', value: summary.accountsCount },
        {
          label: 'حسابات ذات نشاط',
          value: summary.accountsWithActivity,
        },
        {
          label: 'إجمالي القيود المعروضة',
          value: summary.totalEntriesDisplayed,
        },
        { label: 'إجمالي مدين', value: summary.totalDebit },
        { label: 'إجمالي دائن', value: summary.totalCredit },
        { label: 'الفرق', value: summary.difference },
        { label: 'حالة التوازن', value: balanceStatus },
      ],
    };

    // ═══ 2. فهرس الحسابات
    const indexSheet: ExcelSheet = {
      name: 'فهرس الحسابات',
      columns: [
        { key: 'accountCode', header: 'كود الحساب', width: 16 },
        { key: 'accountName', header: 'اسم الحساب', width: 30 },
        {
          key: 'accountType',
          header: 'النوع',
          width: 14,
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
          key: 'totalDebit',
          header: 'مدين الفترة',
          width: 16,
          format: 'currency',
          align: 'left',
        },
        {
          key: 'totalCredit',
          header: 'دائن الفترة',
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
        {
          key: 'totalEntries',
          header: 'عدد القيود',
          width: 12,
          format: 'number',
          align: 'center',
        },
      ],
      rows: accounts.map((a) => ({
        accountCode: a.accountCode,
        accountName: a.accountName,
        accountType: a.accountType,
        openingDebit: a.openingDebit,
        openingCredit: a.openingCredit,
        totalDebit: a.totalDebit,
        totalCredit: a.totalCredit,
        closingDebit: a.closingDebit,
        closingCredit: a.closingCredit,
        totalEntries: a.totalEntries,
      })),
      totals: {
        openingDebit: accounts.reduce((s, a) => s + a.openingDebit, 0),
        openingCredit: accounts.reduce((s, a) => s + a.openingCredit, 0),
        totalDebit: accounts.reduce((s, a) => s + a.totalDebit, 0),
        totalCredit: accounts.reduce((s, a) => s + a.totalCredit, 0),
        closingDebit: accounts.reduce((s, a) => s + a.closingDebit, 0),
        closingCredit: accounts.reduce((s, a) => s + a.closingCredit, 0),
        totalEntries: accounts.reduce((s, a) => s + a.totalEntries, 0),
      },
    };

    // ═══ 3. القيود التفصيلية (كل القيود مسطحة)
    const flatEntries = this.flattenEntries(accounts);

    const entriesSheet: ExcelSheet = {
      name: 'القيود التفصيلية',
      columns: [
        { key: 'accountCode', header: 'كود الحساب', width: 14 },
        { key: 'accountName', header: 'اسم الحساب', width: 24 },
        { key: 'date', header: 'التاريخ', width: 14, align: 'center' },
        {
          key: 'entryNumber',
          header: 'رقم القيد',
          width: 18,
          align: 'right',
        },
        { key: 'description', header: 'البيان', width: 40 },
        {
          key: 'counterpartyLabel',
          header: 'الطرف المقابل',
          width: 24,
        },
        {
          key: 'debit',
          header: 'مدين',
          width: 14,
          format: 'currency',
          align: 'left',
        },
        {
          key: 'credit',
          header: 'دائن',
          width: 14,
          format: 'currency',
          align: 'left',
        },
        {
          key: 'runningBalance',
          header: 'الرصيد الجاري',
          width: 16,
          format: 'currency',
          align: 'left',
        },
        { key: 'source', header: 'المصدر', width: 14, align: 'center' },
      ],
      rows: flatEntries,
      totals: {
        debit: flatEntries.reduce((s, e) => s + (e.debit as number), 0),
        credit: flatEntries.reduce((s, e) => s + (e.credit as number), 0),
      },
    };

    return [summarySheet, indexSheet, entriesSheet];
  }

  // ─────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────

  /**
   * يختار الحسابات التي ستُعرض تفاصيلها في PDF.
   *
   * Single Mode  → الحساب المطلوب فقط
   * All Mode     → أعلى 15 حساب بعدد القيود
   */
  private selectAccountsForDetail(
    accounts: AccountLedger[],
    isSingleMode: boolean,
  ): AccountLedger[] {
    if (isSingleMode) return accounts;
    return [...accounts]
      .sort((a, b) => b.totalEntries - a.totalEntries)
      .slice(0, this.PDF_MAX_DETAILED_ACCOUNTS);
  }

  /**
   * يحوّل قيداً إلى صف PDF.
   */
  private mapEntryRow(e: GeneralLedgerEntry) {
    return {
      date: this.formatDate(e.date),
      entryNumber: e.entryNumber,
      description: e.description,
      counterpartyLabel: this.formatCounterparty(e.counterparty),
      debit: e.debit,
      credit: e.credit,
      runningBalance: e.runningBalance,
    };
  }

  /**
   * يحوّل حساباً إلى صف الفهرس.
   */
  private mapAccountRow(a: AccountLedger) {
    return {
      accountCode: a.accountCode,
      accountName: a.accountName,
      openingBalance: a.openingBalance,
      totalDebit: a.totalDebit,
      totalCredit: a.totalCredit,
      closingBalance: a.closingBalance,
      totalEntries: a.totalEntries,
    };
  }

  /**
   * تسطيح القيود عبر كل الحسابات — لورقة Excel.
   */
  private flattenEntries(accounts: AccountLedger[]) {
    const result: Array<{
      accountCode: string;
      accountName: string;
      date: string;
      entryNumber: string;
      description: string;
      counterpartyLabel: string;
      debit: number;
      credit: number;
      runningBalance: number;
      source: string;
    }> = [];

    for (const acc of accounts) {
      for (const e of acc.entries) {
        result.push({
          accountCode: acc.accountCode,
          accountName: acc.accountName,
          date: this.formatDate(e.date),
          entryNumber: e.entryNumber,
          description: e.description,
          counterpartyLabel: this.formatCounterparty(e.counterparty),
          debit: e.debit,
          credit: e.credit,
          runningBalance: e.runningBalance,
          source: e.source,
        });
      }
    }

    return result;
  }

  /**
   * تنسيق الطرف المقابل.
   */
  private formatCounterparty(cp: GeneralLedgerCounterparty): string {
    if (cp.type === 'CUSTOMER' && cp.name) return `عميل: ${cp.name}`;
    if (cp.type === 'SUPPLIER' && cp.name) return `مورد: ${cp.name}`;
    return '—';
  }

  /**
   * تنسيق الرصيد الافتتاحي/الختامي كـ "X مدين" / "Y دائن" / "صفر".
   */
  private formatBalanceLabel(debit: number, credit: number): string {
    if (debit > 0 && credit === 0) {
      return `${this.formatNumber(debit)} مدين`;
    }
    if (credit > 0 && debit === 0) {
      return `${this.formatNumber(credit)} دائن`;
    }
    return 'صفر';
  }

  /**
   * تنسيق التاريخ من ISO إلى YYYY-MM-DD.
   */
  private formatDate(isoDate: string): string {
    if (!isoDate) return '—';
    try {
      const d = new Date(isoDate);
      if (isNaN(d.getTime())) return '—';
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    } catch {
      return '—';
    }
  }

  /**
   * تنسيق رقم بفاصلة آلاف.
   */
  private formatNumber(value: number): string {
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
}
