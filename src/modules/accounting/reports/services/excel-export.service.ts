import { Injectable, Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { DailySalesResponse } from '../interfaces/daily-sales.interface';

@Injectable()
export class ExcelExportService {
  private readonly logger = new Logger(ExcelExportService.name);

  // ============================================
  // تصدير تقرير المبيعات اليومية إلى Excel
  // ============================================
  async generateDailySalesExcel(report: DailySalesResponse): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();

    // ورقة العمل الأولى: ملخص المبيعات
    const sheet1 = workbook.addWorksheet('ملخص المبيعات', {
      views: [{ rightToLeft: true }],
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true },
    });

    // الترويسة
    sheet1.mergeCells('A1:D1');
    sheet1.getCell('A1').value = report.meta.companyName;
    sheet1.getCell('A1').font = { size: 14, bold: true };
    sheet1.getCell('A1').alignment = { horizontal: 'center' };

    sheet1.mergeCells('A2:D2');
    sheet1.getCell('A2').value = report.meta.title;
    sheet1.getCell('A2').font = { size: 13, bold: true, color: { argb: 'FF4F46E5' } };
    sheet1.getCell('A2').alignment = { horizontal: 'center' };

    sheet1.mergeCells('A3:D3');
    sheet1.getCell('A3').value = `الفترة من ${report.meta.fromDate} إلى ${report.meta.toDate}${report.meta.branchName ? ` — ${report.meta.branchName}` : ''}`;
    sheet1.getCell('A3').alignment = { horizontal: 'center' };
    sheet1.getCell('A3').font = { size: 10 };

    // ملخص المؤشرات
    sheet1.getCell('A5').value = 'المؤشر المالي';
    sheet1.getCell('B5').value = 'القيمة';
    sheet1.getRow(5).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet1.getRow(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };

    const summaryRows = [
      ['إجمالي عدد الفواتير', report.summary.totalInvoicesCount],
      ['عدد الفواتير المكتملة', report.summary.completedInvoicesCount],
      ['عدد الفواتير المرتجعة', report.summary.returnedInvoicesCount],
      ['إجمالي المبيعات (قبل الخصم)', report.summary.grossSales],
      ['إجمالي الخصومات الممنوحة', report.summary.totalDiscounts],
      ['إجمالي المرتجعات', report.summary.totalReturns],
      ['صافي المبيعات المحاسبي', report.summary.netSales],
      ['إجمالي المبالغ المحصلة', report.summary.totalCollected],
    ];

    let r = 6;
    for (const [label, val] of summaryRows) {
      sheet1.getCell(`A${r}`).value = label;
      sheet1.getCell(`B${r}`).value = val;
      sheet1.getCell(`B${r}`).alignment = { horizontal: 'left' };
      if (typeof val === 'number' && r >= 9) {
        sheet1.getCell(`B${r}`).numFmt = '#,##0.00;[Red](#,##0.00);"-"';
      }
      r++;
    }

    // جدول طرق الدفع
    r += 2;
    sheet1.getCell(`A${r}`).value = 'طريقة الدفع';
    sheet1.getCell(`B${r}`).value = 'المبلغ المحصل';
    sheet1.getCell(`C${r}`).value = 'النسبة المئوية';
    sheet1.getRow(r).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet1.getRow(r).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10B981' } };

    r++;
    for (const pay of report.paymentBreakdown) {
      sheet1.getCell(`A${r}`).value = pay.method;
      sheet1.getCell(`B${r}`).value = pay.amount;
      sheet1.getCell(`B${r}`).numFmt = '#,##0.00';
      sheet1.getCell(`C${r}`).value = `${pay.percentage}%`;
      r++;
    }

    // جدول أداء الكاشيرين
    r += 2;
    sheet1.getCell(`A${r}`).value = 'الكاشير';
    sheet1.getCell(`B${r}`).value = 'عدد الفواتير';
    sheet1.getCell(`C${r}`).value = 'إجمالي المبيعات';
    sheet1.getCell(`D${r}`).value = 'المرتجعات';
    sheet1.getRow(r).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet1.getRow(r).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6366F1' } };

    r++;
    for (const c of report.cashierBreakdown) {
      sheet1.getCell(`A${r}`).value = c.cashierName;
      sheet1.getCell(`B${r}`).value = c.invoicesCount;
      sheet1.getCell(`C${r}`).value = c.totalSales;
      sheet1.getCell(`C${r}`).numFmt = '#,##0.00';
      sheet1.getCell(`D${r}`).value = c.returns;
      sheet1.getCell(`D${r}`).numFmt = '#,##0.00';
      r++;
    }

    sheet1.columns = [{ width: 28 }, { width: 18 }, { width: 18 }, { width: 18 }];

    // ورقة العمل الثانية: تفاصيل الفواتير
    const sheet2 = workbook.addWorksheet('تفاصيل الفواتير', {
      views: [{ rightToLeft: true }],
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true },
    });

    const invoiceHeaders = [
      { header: 'رقم الفاتورة', width: 18 },
      { header: 'التاريخ والوقت', width: 20 },
      { header: 'الكاشير', width: 20 },
      { header: 'العميل', width: 22 },
      { header: 'طريقة الدفع', width: 14 },
      { header: 'الإجمالي الفرعي', width: 15 },
      { header: 'الخصم', width: 14 },
      { header: 'الإجمالي الكلي', width: 16 },
      { header: 'المدفوع', width: 16 },
      { header: 'الحالة', width: 14 },
      { header: 'عدد الأصناف', width: 13 },
    ];

    sheet2.columns = invoiceHeaders.map((h) => ({ width: h.width }));
    const hRow = sheet2.getRow(1);
    hRow.values = invoiceHeaders.map((h) => h.header);
    hRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };

    let invR = 2;
    for (const inv of report.invoices) {
      const row = sheet2.getRow(invR);
      row.values = [
        inv.invoiceNumber,
        inv.createdAt.slice(0, 19).replace('T', ' '),
        inv.cashierName,
        inv.customerName,
        inv.paymentMethod,
        inv.subTotal,
        inv.discountTotal,
        inv.grandTotal,
        inv.paidAmount,
        inv.status,
        inv.itemsCount,
      ];

      for (const col of ['F', 'G', 'H', 'I']) {
        sheet2.getCell(`${col}${invR}`).numFmt = '#,##0.00;[Red](#,##0.00);"-"';
      }
      invR++;
    }

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}
