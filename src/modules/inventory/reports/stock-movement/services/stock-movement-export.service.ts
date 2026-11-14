import { Injectable } from '@nestjs/common';
import {
  PdfExporter,
  ExcelExporter,
  PdfSection,
  ExcelSheet,
} from 'src/shared/report-kit';
import { StockMovementService } from './stock-movement.service';
import { StockMovementFilterDto } from '../dto/stock-movement-filter.dto';
import {
  StockMovementResponse,
} from '../interfaces/stock-movement.interface';

/**
 * StockMovementExportService
 * ──────────────────────────
 * مسؤول عن تصدير تقرير حركة الأصناف والرواكد إلى PDF و Excel.
 *
 * الميزات:
 *   📄 PDF: 5 sections (ملخص + تصنيفات + راكد + تحت الحد + كل الأصناف)
 *   📊 Excel: 4 sheets (ملخص + تصنيفات + كل الأصناف + راكد)
 */
@Injectable()
export class StockMovementExportService {
  constructor(
    private readonly stockMovementService: StockMovementService,
    private readonly pdfExporter: PdfExporter,
    private readonly excelExporter: ExcelExporter,
  ) {}

  // ─────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────

  async toPdf(
    filters: StockMovementFilterDto,
    companyId: string,
    userId: string,
  ): Promise<Buffer> {
    const report = await this.stockMovementService.generate(
      filters,
      companyId,
      userId,
    );
    return this.pdfExporter.render(report.meta, this.buildPdfSections(report));
  }

  async toExcel(
    filters: StockMovementFilterDto,
    companyId: string,
    userId: string,
  ): Promise<Buffer> {
    const report = await this.stockMovementService.generate(
      filters,
      companyId,
      userId,
    );
    return this.excelExporter.render(report.meta, this.buildExcelSheets(report));
  }

  // ─────────────────────────────────────────────
  // PDF Sections
  // ─────────────────────────────────────────────

  private buildPdfSections(report: StockMovementResponse): PdfSection[] {
    const { summary, items } = report;

    const stagnantItems = items.filter(
      (i) => i.classification === 'STAGNANT',
    );
    const belowMinItems = items.filter((i) => i.isBelowMinStock);
    const top100Items = items.slice(0, 100);

    const belowMinColor: 'warning' | 'success' =
      summary.itemsBelowMinStock > 0 ? 'warning' : 'success';
    const stagnantColor: 'danger' | 'warning' =
      summary.stagnantValuePercentage > 20 ? 'danger' : 'warning';

    const sections: PdfSection[] = [];

    // ═══ 1. الملخص التنفيذي
    sections.push({
      heading: 'الملخص التنفيذي',
      kpis: [
        {
          label: 'إجمالي الأصناف',
          value: summary.totalItems,
          color: 'info',
        },
        {
          label: 'أصناف بمخزون',
          value: summary.itemsWithStock,
          color: 'primary',
        },
        {
          label: 'تحت الحد الأدنى',
          value: summary.itemsBelowMinStock,
          color: belowMinColor,
        },
        {
          label: 'قيمة المخزون',
          value: this.formatNumber(summary.totalStockValue),
          color: 'success',
        },
        {
          label: 'قيمة الرواكد',
          value: this.formatNumber(summary.totalStockValueStagnant),
          hint: `${this.formatNumber(summary.stagnantValuePercentage)}%`,
          color: stagnantColor,
        },
        {
          label: 'الكمية المباعة',
          value: summary.totalQuantitySold.toLocaleString('en-US'),
          hint: `إيراد: ${this.formatNumber(summary.totalSalesRevenue)}`,
          color: 'info',
        },
        {
          label: 'متوسط الدوران',
          value: this.formatNumber(summary.avgTurnoverRatio),
          color: 'primary',
        },
        {
          label: 'متوسط التغطية',
          value: `${this.formatNumber(summary.avgCoverageDays)} يوم`,
          color: 'info',
        },
      ],
    });

    // ═══ 2. توزيع التصنيفات
    sections.push({
      heading: 'توزيع التصنيفات',
      tables: [
        {
          columns: [
            { key: 'label', label: 'التصنيف', align: 'right' },
            {
              key: 'itemsCount',
              label: 'عدد الأصناف',
              align: 'center',
              format: 'number',
            },
            {
              key: 'stockValue',
              label: 'قيمة المخزون',
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
          rows: summary.classificationBreakdown,
          totals: {
            itemsCount: summary.totalItems,
            stockValue: summary.totalStockValue,
          },
        },
      ],
    });

    // ═══ 3. الأصناف الراكدة (حد أقصى 50)
    if (stagnantItems.length > 0) {
      sections.push({
        heading: `الأصناف الراكدة (${stagnantItems.length})`,
        tables: [
          {
            columns: [
              { key: 'code', label: 'الكود', align: 'right' },
              { key: 'tradeName', label: 'الاسم التجاري', align: 'right' },
              {
                key: 'currentStock',
                label: 'الرصيد',
                align: 'center',
                format: 'number',
              },
              {
                key: 'stockValue',
                label: 'القيمة',
                align: 'left',
                format: 'currency',
              },
              {
                key: 'lastSaleAt',
                label: 'آخر بيع',
                align: 'center',
              },
              {
                key: 'daysSinceLastSale',
                label: 'أيام الخمول',
                align: 'center',
                format: 'number',
              },
            ],
            rows: stagnantItems.slice(0, 50).map((i) => ({
              code: i.code,
              tradeName: i.tradeName,
              currentStock: i.currentStock,
              stockValue: i.stockValue,
              lastSaleAt: this.formatDate(i.lastSaleAt),
              daysSinceLastSale: i.daysSinceLastSale ?? '—',
            })),
            totals: {
              stockValue: stagnantItems.reduce(
                (s, i) => s + i.stockValue,
                0,
              ),
            },
          },
        ],
        note:
          stagnantItems.length > 50
            ? `يعرض أول 50 صنف راكد من إجمالي ${stagnantItems.length}. للتفاصيل الكاملة استخدم تصدير Excel.`
            : 'يُنصح بمراجعة الأصناف الراكدة لاتخاذ قرارات التصفية أو الإرجاع.',
      });
    }

    // ═══ 4. تحت الحد الأدنى
    if (belowMinItems.length > 0) {
      sections.push({
        heading: `أصناف تحت الحد الأدنى (${belowMinItems.length})`,
        tables: [
          {
            columns: [
              { key: 'code', label: 'الكود', align: 'right' },
              { key: 'tradeName', label: 'الاسم التجاري', align: 'right' },
              {
                key: 'currentStock',
                label: 'الرصيد',
                align: 'center',
                format: 'number',
              },
              {
                key: 'minStockLevel',
                label: 'الحد الأدنى',
                align: 'center',
                format: 'number',
              },
              {
                key: 'gap',
                label: 'النقص',
                align: 'center',
                format: 'number',
              },
            ],
            rows: belowMinItems.slice(0, 50).map((i) => ({
              code: i.code,
              tradeName: i.tradeName,
              currentStock: i.currentStock,
              minStockLevel: i.minStockLevel,
              gap: Math.max(0, i.minStockLevel - i.currentStock),
            })),
          },
        ],
        note:
          belowMinItems.length > 50
            ? `يعرض أول 50 صنف من إجمالي ${belowMinItems.length}. راجع Excel للقائمة الكاملة.`
            : 'تحتاج هذه الأصناف إلى إعادة طلب عاجلة.',
      });
    }

    // ═══ 5. كل الأصناف (حد أقصى 100)
    sections.push({
      heading: 'تفاصيل الأصناف',
      tables: [
        {
          columns: [
            { key: 'code', label: 'الكود', align: 'right' },
            { key: 'tradeName', label: 'الاسم التجاري', align: 'right' },
            { key: 'category', label: 'الفئة', align: 'right' },
            {
              key: 'currentStock',
              label: 'الرصيد',
              align: 'center',
              format: 'number',
            },
            {
              key: 'netSold',
              label: 'صافي المباع',
              align: 'center',
              format: 'number',
            },
            {
              key: 'stockValue',
              label: 'القيمة',
              align: 'left',
              format: 'currency',
            },
            {
              key: 'coverageDays',
              label: 'التغطية (يوم)',
              align: 'center',
              format: 'number',
            },
            {
              key: 'classificationLabel',
              label: 'التصنيف',
              align: 'center',
            },
          ],
          rows: top100Items.map((i) => ({
            code: i.code,
            tradeName: i.tradeName,
            category: i.category,
            currentStock: i.currentStock,
            netSold: i.netSold,
            stockValue: i.stockValue,
            coverageDays:
              i.coverageDays >= 9999 ? '∞' : i.coverageDays,
            classificationLabel: i.classificationLabel,
          })),
          totals: {
            currentStock: top100Items.reduce(
              (s, i) => s + i.currentStock,
              0,
            ),
            netSold: top100Items.reduce((s, i) => s + i.netSold, 0),
            stockValue: top100Items.reduce(
              (s, i) => s + i.stockValue,
              0,
            ),
          },
        },
      ],
      note:
        items.length > 100
          ? `يعرض أول 100 صنف من إجمالي ${items.length}. للقائمة الكاملة استخدم تصدير Excel.`
          : undefined,
    });

    return sections;
  }

  // ─────────────────────────────────────────────
  // Excel Sheets
  // ─────────────────────────────────────────────

  private buildExcelSheets(report: StockMovementResponse): ExcelSheet[] {
    const { summary, items } = report;

    const stagnantItems = items.filter(
      (i) => i.classification === 'STAGNANT',
    );

    return [
      // ═══ 1. الملخص
      {
        name: 'الملخص',
        title: report.meta.title,
        columns: [
          { key: 'label', header: 'البند', width: 35, align: 'right' },
          {
            key: 'value',
            header: 'القيمة',
            width: 22,
            align: 'left',
            format: 'number',
          },
        ],
        rows: [
          { label: 'إجمالي الأصناف', value: summary.totalItems },
          {
            label: 'أصناف بمخزون',
            value: summary.itemsWithStock,
          },
          {
            label: 'أصناف تحت الحد الأدنى',
            value: summary.itemsBelowMinStock,
          },
          {
            label: 'إجمالي الكمية في المخزون',
            value: summary.totalQuantityOnHand,
          },
          {
            label: 'إجمالي قيمة المخزون',
            value: summary.totalStockValue,
          },
          {
            label: 'قيمة المخزون الراكد',
            value: summary.totalStockValueStagnant,
          },
          {
            label: 'نسبة قيمة الرواكد %',
            value: summary.stagnantValuePercentage,
          },
          {
            label: 'إجمالي الكمية المباعة (صافي)',
            value: summary.totalQuantitySold,
          },
          {
            label: 'إجمالي إيراد المبيعات',
            value: summary.totalSalesRevenue,
          },
          {
            label: 'متوسط معدل الدوران',
            value: summary.avgTurnoverRatio,
          },
          {
            label: 'متوسط أيام التغطية',
            value: summary.avgCoverageDays,
          },
        ],
      },

      // ═══ 2. توزيع التصنيفات
      {
        name: 'التصنيفات',
        columns: [
          { key: 'label', header: 'التصنيف', width: 22 },
          {
            key: 'itemsCount',
            header: 'عدد الأصناف',
            width: 14,
            format: 'number',
            align: 'center',
          },
          {
            key: 'stockValue',
            header: 'قيمة المخزون',
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
        rows: summary.classificationBreakdown,
        totals: {
          itemsCount: summary.totalItems,
          stockValue: summary.totalStockValue,
          percentage: 100,
        },
      },

      // ═══ 3. كل الأصناف (كامل — بدون حد)
      {
        name: 'الأصناف',
        columns: [
          { key: 'code', header: 'الكود', width: 12 },
          { key: 'barcode', header: 'الباركود', width: 16 },
          { key: 'tradeName', header: 'الاسم التجاري', width: 26 },
          {
            key: 'scientificName',
            header: 'الاسم العلمي',
            width: 24,
          },
          { key: 'category', header: 'الفئة', width: 18 },
          {
            key: 'currentStock',
            header: 'الرصيد',
            width: 12,
            format: 'number',
            align: 'center',
          },
          {
            key: 'batchesCount',
            header: 'الدفعات',
            width: 10,
            format: 'number',
            align: 'center',
          },
          {
            key: 'minStockLevel',
            header: 'الحد الأدنى',
            width: 12,
            format: 'number',
            align: 'center',
          },
          {
            key: 'avgCost',
            header: 'متوسط التكلفة',
            width: 14,
            format: 'currency',
            align: 'left',
          },
          {
            key: 'stockValue',
            header: 'قيمة المخزون',
            width: 16,
            format: 'currency',
            align: 'left',
          },
          {
            key: 'totalIn',
            header: 'داخل',
            width: 10,
            format: 'number',
            align: 'center',
          },
          {
            key: 'totalOut',
            header: 'خارج',
            width: 10,
            format: 'number',
            align: 'center',
          },
          {
            key: 'netSold',
            header: 'صافي المباع',
            width: 12,
            format: 'number',
            align: 'center',
          },
          {
            key: 'salesRevenue',
            header: 'الإيراد',
            width: 16,
            format: 'currency',
            align: 'left',
          },
          {
            key: 'turnoverRatio',
            header: 'الدوران',
            width: 12,
            format: 'number',
            align: 'center',
          },
          {
            key: 'coverageDays',
            header: 'التغطية (يوم)',
            width: 14,
            format: 'number',
            align: 'center',
          },
          { key: 'lastSaleAt', header: 'آخر بيع', width: 20 },
          { key: 'lastMovementAt', header: 'آخر حركة', width: 20 },
          { key: 'nearestExpiry', header: 'أقرب انتهاء', width: 20 },
          { key: 'classificationLabel', header: 'التصنيف', width: 14 },
        ],
        rows: items.map((i) => ({
          code: i.code,
          barcode: i.barcode,
          tradeName: i.tradeName,
          scientificName: i.scientificName,
          category: i.category,
          currentStock: i.currentStock,
          batchesCount: i.batchesCount,
          minStockLevel: i.minStockLevel,
          avgCost: i.avgCost,
          stockValue: i.stockValue,
          totalIn: i.totalIn,
          totalOut: i.totalOut,
          netSold: i.netSold,
          salesRevenue: i.salesRevenue,
          turnoverRatio: i.turnoverRatio,
          coverageDays:
            i.coverageDays >= 9999 ? '' : i.coverageDays,
          lastSaleAt: this.formatDate(i.lastSaleAt),
          lastMovementAt: this.formatDate(i.lastMovementAt),
          nearestExpiry: this.formatDate(i.nearestExpiry),
          classificationLabel: i.classificationLabel,
        })),
        totals: {
          currentStock: items.reduce((s, i) => s + i.currentStock, 0),
          stockValue: items.reduce((s, i) => s + i.stockValue, 0),
          netSold: items.reduce((s, i) => s + i.netSold, 0),
          salesRevenue: items.reduce((s, i) => s + i.salesRevenue, 0),
        },
      },

      // ═══ 4. الرواكد فقط (للمراجعة المالية)
      {
        name: 'الرواكد',
        columns: [
          { key: 'code', header: 'الكود', width: 12 },
          { key: 'tradeName', header: 'الاسم التجاري', width: 26 },
          { key: 'category', header: 'الفئة', width: 18 },
          {
            key: 'currentStock',
            header: 'الرصيد',
            width: 12,
            format: 'number',
            align: 'center',
          },
          {
            key: 'avgCost',
            header: 'متوسط التكلفة',
            width: 14,
            format: 'currency',
            align: 'left',
          },
          {
            key: 'stockValue',
            header: 'قيمة المخزون',
            width: 16,
            format: 'currency',
            align: 'left',
          },
          { key: 'lastSaleAt', header: 'آخر بيع', width: 20 },
          {
            key: 'daysSinceLastSale',
            header: 'أيام الخمول',
            width: 14,
            format: 'number',
            align: 'center',
          },
          { key: 'nearestExpiry', header: 'أقرب انتهاء', width: 20 },
        ],
        rows: stagnantItems.map((i) => ({
          code: i.code,
          tradeName: i.tradeName,
          category: i.category,
          currentStock: i.currentStock,
          avgCost: i.avgCost,
          stockValue: i.stockValue,
          lastSaleAt: this.formatDate(i.lastSaleAt),
          daysSinceLastSale: i.daysSinceLastSale ?? '',
          nearestExpiry: this.formatDate(i.nearestExpiry),
        })),
        totals: {
          currentStock: stagnantItems.reduce(
            (s, i) => s + i.currentStock,
            0,
          ),
          stockValue: stagnantItems.reduce(
            (s, i) => s + i.stockValue,
            0,
          ),
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

  private formatDate(value?: string | null): string {
    if (!value) return '—';
    try {
      const d = new Date(value);
      if (isNaN(d.getTime())) return '—';
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    } catch {
      return '—';
    }
  }
}
