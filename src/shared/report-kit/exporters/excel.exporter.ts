import { Injectable, Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { ReportMeta } from '../interfaces/report-meta.interface';
import { ExcelSheet } from '../interfaces/excel-sheet.interface';

/**
 * ExcelExporter
 * ─────────────
 * يحوّل بيانات التقرير (meta + sheets) إلى ملف Excel.
 *
 * الميزات:
 *   📊 RTL + frozen header
 *   🎨 ألوان الهوية (Teal #0F766E)
 *   💰 تنسيق العملة والأرقام
 *   📋 صف إجماليات بارز
 *   📝 footer موحّد
 */
@Injectable()
export class ExcelExporter {
  private readonly logger = new Logger(ExcelExporter.name);

  async render(meta: ReportMeta, sheets: ExcelSheet[]): Promise<Buffer> {
    const start = Date.now();
    const workbook = new ExcelJS.Workbook();

    workbook.creator = 'DawaCore ERP';
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.properties.date1904 = false;

    for (const sheet of sheets) {
      this.buildSheet(workbook, meta, sheet);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const result = Buffer.from(buffer);

    this.logger.log(
      `✅ Excel generated in ${Date.now() - start}ms (${(result.length / 1024).toFixed(0)}KB, ${sheets.length} sheets)`,
    );

    return result;
  }

  private buildSheet(
    workbook: ExcelJS.Workbook,
    meta: ReportMeta,
    sheet: ExcelSheet,
  ): void {
    // اسم الورقة: Excel يمنع بعض الرموز + حد 31 حرف
    const safeName = sheet.name.replace(/[:\\/?*\[\]]/g, '_').slice(0, 31);

    const ws = workbook.addWorksheet(safeName, {
      views: [{ rightToLeft: true, state: 'frozen', ySplit: 6 }],
      properties: { defaultRowHeight: 18 },
    });

    // ─── 1. العنوان الرئيسي
    const colCount = Math.max(sheet.columns.length, 4);
    ws.mergeCells(1, 1, 1, colCount);

    const titleCell = ws.getCell(1, 1);
    titleCell.value = sheet.title || meta.title;
    titleCell.font = { bold: true, size: 16, color: { argb: 'FF0F766E' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 28;

    // ─── 2. اسم الشركة
    ws.mergeCells(2, 1, 2, colCount);
    const companyCell = ws.getCell(2, 1);
    companyCell.value =
      meta.companyName + (meta.branchName ? ` — ${meta.branchName}` : '');
    companyCell.alignment = { horizontal: 'center', vertical: 'middle' };
    companyCell.font = { size: 11, color: { argb: 'FF6B7280' } };

    // ─── 3. الفترة
    ws.mergeCells(3, 1, 3, colCount);
    const periodCell = ws.getCell(3, 1);
    periodCell.value = `الفترة: ${meta.fromDate} إلى ${meta.toDate}`;
    periodCell.alignment = { horizontal: 'center', vertical: 'middle' };
    periodCell.font = { size: 10, color: { argb: 'FF6B7280' } };

    // ─── 4. meta إضافية (اختياري)
    let currentRow = 4;
    if (sheet.meta && Object.keys(sheet.meta).length > 0) {
      for (const [key, value] of Object.entries(sheet.meta)) {
        ws.getCell(currentRow, 1).value = key;
        ws.getCell(currentRow, 1).font = { bold: true, size: 10 };

        ws.mergeCells(currentRow, 2, currentRow, colCount);
        ws.getCell(currentRow, 2).value = value;
        ws.getCell(currentRow, 2).font = { size: 10 };

        currentRow++;
      }
    }

    const headerRowIndex = 6;

    // ─── 5. إعداد الأعمدة
    ws.columns = sheet.columns.map((col) => ({
      header: col.header,
      key: col.key,
      width: col.width || 18,
      style: {
        alignment: { horizontal: col.align || 'right', vertical: 'middle' },
      },
    }));

    // ─── 6. رأس الجدول (styling)
    const headerRow = ws.getRow(headerRowIndex);
    headerRow.values = sheet.columns.map((c) => c.header);
    headerRow.height = 24;

    headerRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0F766E' },
      };
      cell.alignment = {
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true,
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF0F766E' } },
        left: { style: 'thin', color: { argb: 'FF0F766E' } },
        bottom: { style: 'thin', color: { argb: 'FF0F766E' } },
        right: { style: 'thin', color: { argb: 'FF0F766E' } },
      };
    });

    // ─── 7. الصفوف
    sheet.rows.forEach((rowData, idx) => {
      const row = ws.addRow(sheet.columns.map((c) => rowData[c.key]));
      row.height = 18;

      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const col = sheet.columns[colNumber - 1];
        if (!col) return;

        cell.alignment = {
          horizontal: col.align || 'right',
          vertical: 'middle',
        };

        if (col.format === 'currency' || col.format === 'number') {
          cell.numFmt = '#,##0.00';
        } else if (col.format === 'date') {
          cell.numFmt = 'yyyy-mm-dd';
        }

        // تخطيط الصفوف (Zebra)
        if (idx % 2 === 1) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF9FAFB' },
          };
        }

        cell.border = {
          bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } },
        };
      });
    });

    // ─── 8. صف الإجماليات
    if (sheet.totals && Object.keys(sheet.totals).length > 0) {
      const totalRow = ws.addRow(
        sheet.columns.map((c, i) => {
          if (i === 0) return 'الإجمالي';
          return sheet.totals?.[c.key] ?? null;
        }),
      );
      totalRow.height = 22;

      totalRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const col = sheet.columns[colNumber - 1];
        cell.font = { bold: true, size: 11, color: { argb: 'FF0F766E' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFECFDF5' },
        };
        cell.border = {
          top: { style: 'medium', color: { argb: 'FF0F766E' } },
        };
        cell.alignment = {
          horizontal: col?.align || 'right',
          vertical: 'middle',
        };

        if (col?.format === 'currency' || col?.format === 'number') {
          cell.numFmt = '#,##0.00';
        }
      });
    }

    // ─── 9. Footer
    const footerRow = ws.addRow([]);
    const footerRowNumber = footerRow.number;

    ws.mergeCells(footerRowNumber, 1, footerRowNumber, colCount);
    const footerCell = ws.getCell(footerRowNumber, 1);
    footerCell.value = `تم الإنشاء بواسطة DawaCore ERP — ${this.formatDate(meta.generatedAt)} — ${meta.generatedBy.name}`;
    footerCell.font = {
      size: 9,
      italic: true,
      color: { argb: 'FF9CA3AF' },
    };
    footerCell.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  private formatDate(date: Date): string {
    const d = new Date(date);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  }
}
