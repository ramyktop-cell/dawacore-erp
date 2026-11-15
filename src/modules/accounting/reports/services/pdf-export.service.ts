// src/modules/accounting/reports/services/pdf-export.service.ts
import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import { ArabicTextUtil } from '../utils/arabic-text.util';
import { DailySalesResponse } from '../interfaces/daily-sales.interface';
import { customerLedgerAmount } from '../../../../customers/customer-ledger-amount';

const pdfmake = require('pdfmake-rtl');
const Roboto = require('pdfmake-rtl/fonts/Roboto');
const Cairo = require('pdfmake-rtl/fonts/Cairo');

const CODE128_PATTERNS = [
  '11011001100', '11001101100', '11001100110', '10010011000', '10010001100',
  '10001001100', '10011001000', '10011000100', '10001100100', '11001001000',
  '11001000100', '11000100100', '10110011100', '10011011100', '10011001110',
  '10111001100', '10011101100', '10011100110', '11001110010', '11001011100',
  '11001001110', '11011100100', '11001110100', '11101101110', '11101001100',
  '11100101100', '11100100110', '11101100100', '11100110100', '11100110010',
  '11011011000', '11011000110', '11000110110', '10100011000', '10001011000',
  '10001000110', '10110001000', '10001101000', '10001100010', '11010001000',
  '11000101000', '11000100010', '10110111000', '10110001110', '10001101110',
  '10111011000', '10111000110', '10001110110', '11101110110', '11010001110',
  '11000101110', '11011101000', '11011100010', '11011101110', '11101011000',
  '11101000110', '11100010110', '11101101000', '11101100010', '11100011010',
  '11101111010', '11001000010', '11110001010', '10100110000', '10100001100',
  '10010110000', '10010000110', '10000101100', '10000100110', '10110010000',
  '10110000100', '10011010000', '10011000010', '10000110100', '10000110010',
  '11000010010', '11001010000', '11110111010', '11000010100', '10001111010',
  '10100111100', '10010111100', '10010011110', '10111100100', '10011110100',
  '10011110010', '11110100100', '11110010100', '11110010010', '11011011110',
  '11011110110', '11110110110', '10101111000', '10100011110', '10001011110',
  '10111101000', '10111100010', '11110101000', '11110100010', '10111011110',
  '10111101110', '11101011110', '11110101110', '11010000100', '11010010000',
  '11010011100', '1100011101011',
];

function generateCode128Svg(
  value: string,
  options?: { height?: number; barWidth?: number; showText?: boolean; fontSize?: number },
): string {
  const clean = (value || '00000000').replace(/[^\x20-\x7E]/g, '').trim() || '00000000';
  const height = options?.height ?? 30;
  const barWidth = options?.barWidth ?? 1.3;
  const showText = options?.showText ?? true;
  const fontSize = options?.fontSize ?? 9;

  const codes: number[] = [104];
  let checksum = 104;

  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i) - 32;
    codes.push(code);
    checksum += code * (i + 1);
  }

  codes.push(checksum % 103);
  codes.push(106);

  const binary = codes.map((c) => CODE128_PATTERNS[c] || '').join('');
  const quietZone = 10;
  const totalModules = binary.length + quietZone * 2;
  const svgWidth = Math.round(totalModules * barWidth);
  const totalHeight = showText ? height + fontSize + 4 : height;

  let rects = '';
  let i = 0;
  while (i < binary.length) {
    if (binary[i] === '1') {
      let run = 1;
      while (i + run < binary.length && binary[i + run] === '1') {
        run++;
      }
      const x = (quietZone + i) * barWidth;
      const w = run * barWidth;
      rects += `<rect x="${x.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="${height}" fill="#000000" />`;
      i += run;
    } else {
      i++;
    }
  }

  const textEl = showText
    ? `<text x="${(svgWidth / 2).toFixed(1)}" y="${height + fontSize + 1}" text-anchor="middle" font-family="'Courier New', monospace" font-weight="700" font-size="${fontSize}px" fill="#000000" letter-spacing="1.2">${clean}</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${totalHeight}" width="${svgWidth}" height="${totalHeight}">${rects}${textEl}</svg>`;
}

function tafqeetArabic(amount: number, currency: string = 'جنيه سوداني', subUnit: string = 'قرش'): string {
  if (amount === 0 || isNaN(amount)) return `صفر ${currency}`;

  const ones = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];
  const teens = ['عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
  const tens = ['', 'عشرة', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
  const hundreds = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

  function convertGroup(num: number): string {
    let result = '';
    const h = Math.floor(num / 100);
    const remainder = num % 100;
    const t = Math.floor(remainder / 10);
    const o = remainder % 10;

    if (h > 0) result += hundreds[h];
    if (remainder > 0) {
      if (result) result += ' و';
      if (remainder < 10) {
        result += ones[remainder];
      } else if (remainder < 20) {
        result += teens[remainder - 10];
      } else {
        if (o > 0) {
          result += ones[o] + ' و' + tens[t];
        } else {
          result += tens[t];
        }
      }
    }
    return result;
  }

  const integerPart = Math.floor(Math.abs(amount));
  const decimalPart = Math.round((Math.abs(amount) - integerPart) * 100);

  const billions = Math.floor(integerPart / 1000000000);
  const millions = Math.floor((integerPart % 1000000000) / 1000000);
  const thousands = Math.floor((integerPart % 1000000) / 1000);
  const remainder = integerPart % 1000;

  const parts: string[] = [];

  if (billions > 0) {
    if (billions === 1) parts.push('مليار');
    else if (billions === 2) parts.push('ملياران');
    else if (billions >= 3 && billions <= 10) parts.push(convertGroup(billions) + ' مليارات');
    else parts.push(convertGroup(billions) + ' ملياراً');
  }

  if (millions > 0) {
    if (millions === 1) parts.push('مليون');
    else if (millions === 2) parts.push('مليونان');
    else if (millions >= 3 && millions <= 10) parts.push(convertGroup(millions) + ' ملايين');
    else parts.push(convertGroup(millions) + ' مليوناً');
  }

  if (thousands > 0) {
    if (thousands === 1) parts.push('ألف');
    else if (thousands === 2) parts.push('ألفان');
    else if (thousands >= 3 && thousands <= 10) parts.push(convertGroup(thousands) + ' آلاف');
    else parts.push(convertGroup(thousands) + ' ألفاً');
  }

  if (remainder > 0) {
    parts.push(convertGroup(remainder));
  }

  let text = parts.join(' و');
  if (!text) text = 'صفر';
  text += ` ${currency}`;

  if (decimalPart > 0) {
    text += ` و${convertGroup(decimalPart)} ${subUnit}`;
  }

  return `فقط ${text} لا غير`;
}

function formatInvoiceDate(dateInput: any): string {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const period = hours >= 12 ? 'م' : 'ص';
  hours = hours % 12 || 12;
  const hh = String(hours).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}   ${hh}:${minutes} ${period}`;
}

@Injectable()
export class PdfExportService {
  private readonly logger = new Logger(PdfExportService.name);

  constructor() {
    try {
      pdfmake.addFonts(Roboto);
      pdfmake.addFonts(Cairo);
      this.logger.log('✅ تم تهيئة محرك pdfmake-rtl وخطوط Cairo بنجاح');
    } catch (error) {
      this.logger.error(`❌ فشل تحميل الخطوط: ${error.message}`);
      throw error;
    }
  }

  // ============================================
  // 5. تصدير كشف حساب العميل التفصيلي PDF
  // ============================================
  async generateCustomerStatementPdf(report: any): Promise<Buffer> {
    const docDefinition = this.buildCustomerStatementDocDefinition(report);
    const processed = ArabicTextUtil.processDocDefinition(docDefinition);
    return this.renderPdf(processed);
  }

  // ============================================
  // 6. تصدير كشف حساب العميل (Ledger) PDF
  // ============================================
  async generateCustomerLedgerPdf(ledger: any): Promise<Buffer> {
    const report = this.mapLedgerToCustomerStatement(ledger);
    return this.generateCustomerStatementPdf(report);
  }

  async generateSalesInvoicePdf(invoice: any): Promise<Buffer> {
    // ── لوحة ألوان هادئة ومريحة للعين
    const C = {
      primary: '#1F3A5F',
      accent: '#B8892B',
      text: '#1F2937',
      muted: '#6B7280',
      light: '#F5F7FA',
      zebra: '#FAFBFC',
      border: '#E5E7EB',
      soft: '#FBF7EE',
    };

    const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const money = (v: any) =>
      num(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const cur = (v: any) => `${money(v)} ج.س`;

    // ── بيانات الشركة والفرع والعميل
    const company = invoice.branch?.company || invoice.company || {};
    const companyName = company.name || invoice.companyName || 'MadarCore';
    const companyAddress = company.address || invoice.branch?.address || '';
    const companyPhone = company.phone || invoice.branch?.phone || '';
    const companyEmail = company.email || '';
    const branchName = invoice.branch?.name || '';
    const cashierName =
      invoice.user?.name || invoice.user?.username || invoice.cashier?.name || invoice.cashierName || '';

    const customer = invoice.customer || null;
    const hasCustomer = !!(customer && (customer.name || invoice.customerId));
    const customerName = customer?.name || 'عميل نقدي';

    const paymentMethodMap: Record<string, string> = {
      CASH: 'نقداً',
      CARD: 'بطاقة مصرفية',
      TRANSFER: 'تحويل بنكي / بنكك',
      BANK_TRANSFER: 'تحويل بنكي',
      CREDIT: 'آجل',
      MIXED: 'دفع مركب',
    };
    const paymentMethodLabel = paymentMethodMap[invoice.paymentMethod] || 'نقداً';

    const resolveUnitLabel = (item: any): string => {
      if (item.unitLabel) return String(item.unitLabel);
      if (item.unitName) return String(item.unitName);
      const med = item.medicine || item.batch?.medicine;
      if (item.unitType && Array.isArray(med?.units)) {
        const matched = med.units.find((u: any) => u.unitType === item.unitType);
        if (matched?.label) return matched.label;
      }
      if (item.unitType === 'BOX') return 'علبة';
      if (item.unitType === 'STRIP') return 'شريط';
      if (item.unitType === 'UNIT') return med?.isWeighed ? 'كيلو' : 'حبة';
      if (Array.isArray(med?.units) && med.units.length > 0) {
        const def = med.units.find((u: any) => u.isDefault) || med.units[0];
        if (def?.label) return def.label;
      }
      return med?.isWeighed ? 'كيلو' : '—';
    };

    // ── الإجماليات
    const items = invoice.items || [];
    const totalDiscount = num(invoice.discountAmount);
    const netTotal = num(invoice.netAmount);
    const subTotal = invoice.totalAmount !== undefined && invoice.totalAmount !== null ? num(invoice.totalAmount) : netTotal + totalDiscount;
    const remainingTotal = num(invoice.remainingAmount);
    const settledTotal = Math.max(0, netTotal - remainingTotal); // المسدد فعلياً من قيمة الفاتورة
    const changeAmount = Math.max(0, num(invoice.paidAmount) - settledTotal);
    const lineDiscount = (i: any) => num(i.discountAmount ?? i.discount ?? 0);
    const hasLineDiscount = items.some((i: any) => lineDiscount(i) > 0);
    const hasDiscount = totalDiscount > 0 || hasLineDiscount;

    // ── حركة حساب العميل (قبل الفاتورة / بعد الفاتورة / بعد السداد)
    let balance: { before: number; afterInvoice: number; afterPayment: number } | null = null;
    if (invoice.balanceSummary) {
      balance = {
        before: num(invoice.balanceSummary.before),
        afterInvoice: num(invoice.balanceSummary.afterInvoice),
        afterPayment: num(invoice.balanceSummary.afterPayment),
      };
    } else if (invoice.customerBalance) {
      const before = num(invoice.customerBalance.previousDebt);
      balance = { before, afterInvoice: before + netTotal, afterPayment: before + remainingTotal };
    } else if (hasCustomer) {
      const before =
        invoice.previousDebt !== undefined
          ? num(invoice.previousDebt)
          : customer?.previousDebt !== undefined
            ? num(customer.previousDebt)
            : customer?.currentDebt !== undefined
              ? Math.max(0, num(customer.currentDebt) - remainingTotal)
              : 0;
      balance = { before, afterInvoice: before + netTotal, afterPayment: before + remainingTotal };
    }
    const balanceText = (v: number) => {
      if (Math.abs(v) < 0.005) return cur(0);
      return v > 0 ? `${cur(v)} (عليه)` : `${cur(Math.abs(v))} (له)`;
    };

    const barcodeSvg = generateCode128Svg(invoice.invoiceNumber || 'INV-00000', {
      height: 30,
      barWidth: 1.15,
      showText: true,
      fontSize: 8.5,
    });

    // ── مكوّنات مساعدة
    const kvTable = (rows: Array<[string, string]>) => ({
      table: {
        widths: [80, '*'],
        body: rows.map(([k, v]) => [
          { text: k, color: C.muted, fontSize: 8.5 },
          { text: v, color: C.text, fontSize: 9, bold: true },
        ]),
      },
      layout: { defaultBorder: false, paddingTop: () => 1.5, paddingBottom: () => 1.5, paddingLeft: () => 0, paddingRight: () => 0 },
    });

    const infoBox = (title: string, rows: Array<[string, string]>) => ({
      table: {
        widths: ['*'],
        body: [
          [
            {
              stack: [
                { text: title, bold: true, color: C.primary, fontSize: 10 },
                { canvas: [{ type: 'line', x1: 0, y1: 3, x2: 30, y2: 3, lineWidth: 2, lineColor: C.accent }], margin: [0, 0, 0, 6] },
                kvTable(rows),
              ],
              fillColor: C.light,
              margin: [10, 8, 10, 8],
            },
          ],
        ],
      },
      layout: 'noBorders',
    });

    const summaryRow = (label: string, value: string, opts: any = {}) => [
      { text: label, fontSize: opts.size || 9, bold: !!opts.bold, color: opts.color || C.text, fillColor: opts.fill, margin: [6, 3, 6, 3] },
      { text: value, fontSize: opts.size || 9, bold: !!opts.bold, color: opts.color || C.text, fillColor: opts.fill, alignment: 'left', margin: [6, 3, 6, 3] },
    ];

    const summaryLayout = {
      hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length ? 0 : 0.5),
      vLineWidth: () => 0,
      hLineColor: () => C.border,
      paddingTop: () => 2,
      paddingBottom: () => 2,
    };

    const sectionTitle = (t: string) => ({ text: t, bold: true, color: C.primary, fontSize: 10, margin: [0, 0, 0, 4] });

    // ── جدول الأصناف
    const headerCell = (t: string, alignment = 'center') => ({ text: t, bold: true, color: '#FFFFFF', fillColor: C.primary, alignment, fontSize: 9, margin: [0, 2, 0, 2] });
    const itemsHeader = [
      headerCell('#'),
      headerCell('الصنف', 'right'),
      headerCell('الوحدة'),
      headerCell('الكمية'),
      headerCell('سعر الوحدة'),
      ...(hasLineDiscount ? [headerCell('الخصم')] : []),
      headerCell('الإجمالي'),
    ];
    const itemsBody = items.map((item: any, idx: number) => {
      const uPrice = num(item.unitPrice);
      const qty = num(item.quantity);
      const disc = lineDiscount(item);
      const lineTotal = num(item.subtotal ?? item.totalPrice ?? qty * uPrice - disc);
      const fill = idx % 2 === 1 ? C.zebra : undefined;
      const cell = (t: string, extra: any = {}) => ({ text: t, fontSize: 9, color: C.text, alignment: 'center', fillColor: fill, ...extra });
      return [
        cell(String(idx + 1), { color: C.muted }),
        cell(item.medicine?.tradeName || item.tradeName || '', { alignment: 'right', bold: true }),
        cell(resolveUnitLabel(item)),
        cell(qty.toLocaleString('en-US', { maximumFractionDigits: 3 })),
        cell(money(uPrice)),
        ...(hasLineDiscount ? [cell(disc > 0 ? money(disc) : '—')] : []),
        cell(money(lineTotal), { bold: true }),
      ];
    });
    const itemsWidths = hasLineDiscount ? [20, '*', 50, 45, 70, 55, 80] : [20, '*', 55, 50, 80, 90];

    // ── جدول الإجماليات
    const totalsBody: any[] = [
      summaryRow('إجمالي الأصناف', cur(subTotal)),
      ...(hasDiscount ? [summaryRow('الخصم', `- ${cur(totalDiscount)}`, { color: '#B45309' })] : []),
      summaryRow('صافي الفاتورة', cur(netTotal), { bold: true, size: 10.5, color: '#FFFFFF', fill: C.primary }),
      summaryRow('المسدد', cur(settledTotal)),
      summaryRow('المتبقي على الفاتورة', cur(remainingTotal), { bold: remainingTotal > 0, color: remainingTotal > 0 ? '#B91C1C' : C.text }),
      ...(changeAmount > 0.005 ? [summaryRow('الباقي للعميل', cur(changeAmount), { color: C.muted })] : []),
    ];

    // ── جدول حركة حساب العميل
    const statementBlock = balance
      ? {
          stack: [
            sectionTitle('مديونية وحركة حساب العميل'),
            {
              table: {
                widths: ['*', 'auto'],
                body: [
                  summaryRow('مديونية العميل قبل الفاتورة', balanceText(balance.before), { bold: true, color: C.primary, fill: C.light }),
                  summaryRow('(+) قيمة الفاتورة الحالية', cur(netTotal), { color: C.muted }),
                  summaryRow('إجمالي المديونية بعد الفاتورة', balanceText(balance.afterInvoice), { bold: true }),
                  summaryRow('(−) المسدد في الفاتورة', cur(settledTotal), { color: C.muted }),
                  summaryRow('صافي مديونية العميل بعد السداد', balanceText(balance.afterPayment), { bold: true, size: 10.5, color: C.primary, fill: C.soft }),
                ],
              },
              layout: summaryLayout,
            },
          ],
        }
      : { text: '' };

    const docDefinition: any = {
      pageSize: 'A4',
      pageMargins: [32, 28, 32, 28],
      defaultStyle: { font: 'Cairo', alignment: 'right', fontSize: 9, color: C.text },
      content: [
        // 1. الترويسة: الشركة يميناً، عنوان الفاتورة يساراً
        {
          columns: [
            {
              width: 170,
              stack: [
                { text: 'فاتورة مبيعات', bold: true, fontSize: 16, color: C.primary, alignment: 'left' },
                { text: 'SALES INVOICE', fontSize: 8, color: C.accent, bold: true, alignment: 'left', characterSpacing: 1.5 },
              ],
            },
            {
              width: '*',
              stack: [
                { text: companyName, bold: true, fontSize: 17, color: C.primary },
                ...(companyAddress ? [{ text: companyAddress, fontSize: 8.5, color: C.muted }] : []),
                ...(companyPhone || companyEmail
                  ? [{ text: [companyPhone, companyEmail].filter(Boolean).join('   •   '), fontSize: 8.5, color: C.muted }]
                  : []),
              ],
            },
          ],
          margin: [0, 0, 0, 8],
        },
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 531, y2: 0, lineWidth: 1.5, lineColor: C.primary }] },
        { canvas: [{ type: 'line', x1: 431, y1: 2, x2: 531, y2: 2, lineWidth: 2, lineColor: C.accent }], margin: [0, 0, 0, 12] },

        // 2. بطاقتا المعلومات: بيانات العميل يساراً (العمود الأول في الإحداثيات)، وبيانات الفاتورة يميناً (العمود الثاني)
        {
          columns: [
            {
              width: '*',
              ...infoBox('بيانات العميل', [
                ['الاسم', customerName],
                ...(customer?.phone ? ([['الهاتف', customer.phone]] as Array<[string, string]>) : []),
                ...(customer?.address ? ([['العنوان', customer.address]] as Array<[string, string]>) : []),
                ...(balance ? ([['مديونية قبل الفاتورة', balanceText(balance.before)]] as Array<[string, string]>) : []),
              ]),
            },
            { width: 12, text: '' },
            {
              width: '*',
              ...infoBox('بيانات الفاتورة', [
                ['رقم الفاتورة', invoice.invoiceNumber || '—'],
                ['التاريخ', formatInvoiceDate(invoice.createdAt)],
                ['طريقة الدفع', paymentMethodLabel],
                ...(cashierName ? ([['الكاشير', cashierName]] as Array<[string, string]>) : []),
                ...(branchName ? ([['الفرع', branchName]] as Array<[string, string]>) : []),
              ]),
            },
          ],
          margin: [0, 0, 0, 14],
        },

        // 3. جدول الأصناف
        {
          table: { headerRows: 1, widths: itemsWidths, body: [itemsHeader, ...itemsBody] },
          layout: {
            hLineWidth: (i: number, node: any) => (i === 0 ? 0 : i === 1 || i === node.table.body.length ? 1 : 0.5),
            vLineWidth: () => 0,
            hLineColor: (i: number) => (i === 1 ? C.primary : C.border),
            paddingTop: () => 5,
            paddingBottom: () => 5,
            paddingLeft: () => 5,
            paddingRight: () => 5,
          },
          margin: [0, 0, 0, 14],
        },

        // 4. الملخص: حركة الحساب يميناً، الإجماليات يساراً
        {
          columns: [
            {
              width: '48%',
              stack: [sectionTitle('ملخص الفاتورة'), { table: { widths: ['*', 'auto'], body: totalsBody }, layout: summaryLayout }],
            },
            { width: '4%', text: '' },
            { width: '48%', ...statementBlock },
          ],
          margin: [0, 0, 0, 12],
        },

        // 5. المبلغ كتابةً
        {
          table: {
            widths: ['*'],
            body: [[{
              text: [
                { text: 'المبلغ كتابةً:  ', bold: true, color: C.primary },
                { text: tafqeetArabic(netTotal), color: C.text },
              ],
              fontSize: 9.5,
              fillColor: C.soft,
              margin: [10, 6, 10, 6],
            }]],
          },
          layout: 'noBorders',
          margin: [0, 0, 0, 10],
        },

        // 6. الملاحظات
        ...(invoice.notes ? [{ text: [{ text: 'ملاحظات: ', bold: true, color: C.primary }, { text: String(invoice.notes) }], fontSize: 8.5, margin: [0, 0, 0, 6] }] : []),
        { text: 'البضاعة المباعة لا ترد ولا تستبدل إلا وفق الشروط المعتمدة.', fontSize: 8, color: C.muted, margin: [0, 0, 0, 26] },

        // 7. التوقيعات
        {
          columns: [
            { width: '*', stack: [{ canvas: [{ type: 'line', x1: 40, y1: 0, x2: 200, y2: 0, lineWidth: 0.8, lineColor: C.muted }] }, { text: 'توقيع المحاسب', fontSize: 8.5, color: C.muted, alignment: 'center', margin: [0, 3, 0, 0] }] },
            { width: '*', stack: [{ canvas: [{ type: 'line', x1: 40, y1: 0, x2: 200, y2: 0, lineWidth: 0.8, lineColor: C.muted }] }, { text: 'توقيع المستلم', fontSize: 8.5, color: C.muted, alignment: 'center', margin: [0, 3, 0, 0] }] },
          ],
          margin: [0, 0, 0, 18],
        },

        // 8. التذييل: الباركود وعبارة الشكر
        { svg: barcodeSvg, width: 170, alignment: 'center' },
        { text: `شكراً لتعاملكم مع ${companyName}`, alignment: 'center', fontSize: 9, color: C.primary, bold: true, margin: [0, 4, 0, 0] },
      ],
    };

    return this.renderPdf(ArabicTextUtil.processDocDefinition(docDefinition));
  }

  // ============================================
  // 7. تصدير سند قبض عميل (Receipt Voucher) PDF
  // ============================================
  async generateReceiptVoucherPdf(voucher: any): Promise<Buffer> {
    const docDefinition = this.buildReceiptVoucherDocDefinition(voucher);
    const processed = ArabicTextUtil.processDocDefinition(docDefinition);
    return this.renderPdf(processed);
  }

  // ============================================
  // 8. تصدير سند صرف نقدية / بنك (Expense Voucher) PDF
  // ============================================
  async generateExpenseVoucherPdf(voucher: any): Promise<Buffer> {
    const docDefinition = this.buildExpenseVoucherDocDefinition(voucher);
    const processed = ArabicTextUtil.processDocDefinition(docDefinition);
    return this.renderPdf(processed);
  }

  // ============================================
  // Builders
  // ============================================




  // ============================================
  // 6. تصدير تقرير المبيعات اليومية إلى PDF
  // ============================================
  async generateDailySalesPdf(report: DailySalesResponse): Promise<Buffer> {
    const docDefinition: any = {
      pageSize: 'A4',
      pageOrientation: 'landscape',
      pageMargins: [20, 35, 20, 30],
      defaultStyle: { font: 'Cairo', alignment: 'right', fontSize: 8.5 },
      content: [
        {
          text: report.meta.companyName,
          fontSize: 15,
          bold: true,
          alignment: 'center',
        },
        {
          text: report.meta.title,
          fontSize: 13,
          bold: true,
          color: '#4F46E5',
          alignment: 'center',
          margin: [0, 2, 0, 2],
        },
        {
          text: `الفترة من ${report.meta.fromDate} إلى ${report.meta.toDate}${report.meta.branchName ? ` — ${report.meta.branchName}` : ''}`,
          fontSize: 9.5,
          alignment: 'center',
          margin: [0, 0, 0, 10],
        },

        // كروت المؤشرات الأساسية
        {
          table: {
            widths: ['*', '*', '*', '*', '*', '*'],
            body: [
              [
                { text: `إجمالي الفواتير: ${report.summary.totalInvoicesCount}`, alignment: 'center', bold: true, fillColor: '#F8FAFC' },
                { text: `المكتملة: ${report.summary.completedInvoicesCount}`, alignment: 'center', bold: true, fillColor: '#DCFCE7' },
                { text: `المرتجعة: ${report.summary.returnedInvoicesCount}`, alignment: 'center', bold: true, fillColor: '#FEE2E2' },
                { text: `إجمالي المبيعات: ${this.fmt(report.summary.grossSales)}`, alignment: 'center', bold: true, fillColor: '#DBEAFE' },
                { text: `الخصومات: ${this.fmt(report.summary.totalDiscounts)}`, alignment: 'center', bold: true, fillColor: '#FEF3C7' },
                { text: `صافي المبيعات: ${this.fmt(report.summary.netSales)}`, alignment: 'center', bold: true, fillColor: '#EDE9FE' },
              ],
            ],
          },
          margin: [0, 0, 0, 12],
        },

        // جدولان متجاوران: طرق الدفع وأداء الكاشيرين
        {
          columns: [
            // طرق الدفع
            {
              width: '40%',
              table: {
                headerRows: 1,
                widths: ['*', 70, 45],
                body: [
                  [
                    { text: 'طريقة الدفع', style: 'tableHeader' },
                    { text: 'المبلغ', style: 'tableHeader' },
                    { text: 'النسبة', style: 'tableHeader' },
                  ],
                  ...report.paymentBreakdown.map((p) => [
                    { text: p.method, fontSize: 8 },
                    { text: this.fmt(p.amount), fontSize: 8, alignment: 'left' },
                    { text: `${p.percentage}%`, fontSize: 8, alignment: 'center' },
                  ]),
                ],
              },
            },
            // أداء الكاشيرين
            {
              width: '58%',
              table: {
                headerRows: 1,
                widths: ['*', 50, 75, 65, 75],
                body: [
                  [
                    { text: 'الكاشير', style: 'tableHeader' },
                    { text: 'فواتير', style: 'tableHeader' },
                    { text: 'المبيعات', style: 'tableHeader' },
                    { text: 'المرتجع', style: 'tableHeader' },
                    { text: 'الصافي', style: 'tableHeader' },
                  ],
                  ...report.cashierBreakdown.map((c) => [
                    { text: c.cashierName, fontSize: 8 },
                    { text: `${c.invoicesCount}`, fontSize: 8, alignment: 'center' },
                    { text: this.fmt(c.totalSales), fontSize: 8, alignment: 'left' },
                    { text: this.fmt(c.returns), fontSize: 8, alignment: 'left' },
                    { text: this.fmt(c.netTotal), fontSize: 8, alignment: 'left', bold: true },
                  ]),
                ],
              },
            },
          ],
          columnGap: 15,
          margin: [0, 0, 0, 12],
        },

        // جدول تفاصيل الفواتير
        { text: 'سجل الفواتير:', bold: true, fontSize: 10, margin: [0, 0, 0, 4] },
        {
          table: {
            headerRows: 1,
            widths: [75, 80, 80, 85, 55, 60, 50, 65, 60, 55, 35],
            body: [
              [
                { text: 'رقم الفاتورة', style: 'tableHeader' },
                { text: 'الوقت والتاريخ', style: 'tableHeader' },
                { text: 'الكاشير', style: 'tableHeader' },
                { text: 'العميل', style: 'tableHeader' },
                { text: 'طريقة الدفع', style: 'tableHeader' },
                { text: 'المجموع', style: 'tableHeader' },
                { text: 'الخصم', style: 'tableHeader' },
                { text: 'الصافي', style: 'tableHeader' },
                { text: 'المدفوع', style: 'tableHeader' },
                { text: 'الحالة', style: 'tableHeader' },
                { text: 'أصناف', style: 'tableHeader' },
              ],
              ...report.invoices.slice(0, 100).map((inv) => [
                { text: inv.invoiceNumber, fontSize: 7, alignment: 'center' },
                { text: inv.createdAt.slice(0, 16).replace('T', ' '), fontSize: 7, alignment: 'center' },
                { text: inv.cashierName, fontSize: 7.5 },
                { text: inv.customerName, fontSize: 7.5 },
                { text: inv.paymentMethod, fontSize: 7, alignment: 'center' },
                { text: this.fmt(inv.subTotal), fontSize: 7.5, alignment: 'left' },
                { text: this.fmt(inv.discountTotal), fontSize: 7, alignment: 'left' },
                { text: this.fmt(inv.grandTotal), fontSize: 7.5, alignment: 'left', bold: true },
                { text: this.fmt(inv.paidAmount), fontSize: 7.5, alignment: 'left' },
                {
                  text: inv.status === 'COMPLETED' ? 'مكتملة' : inv.status === 'RETURNED' ? 'مرتجعة' : inv.status,
                  fontSize: 7,
                  alignment: 'center',
                  bold: true,
                  fillColor: inv.status === 'COMPLETED' ? '#DCFCE7' : '#FEE2E2',
                },
                { text: `${inv.itemsCount}`, fontSize: 7.5, alignment: 'center' },
              ]),
            ],
          },
          layout: {
            hLineColor: () => '#CCCCCC',
            vLineColor: () => '#CCCCCC',
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
          },
        },

        // Footer
        {
          text: `تم الإنشاء بواسطة: ${report.meta.generatedBy.name} — ${new Date(report.meta.generatedAt).toLocaleString('ar-EG')}`,
          fontSize: 8,
          italics: true,
          alignment: 'center',
          margin: [0, 12, 0, 0],
          color: '#888888',
        },
      ],
      styles: {
        tableHeader: {
          bold: true,
          fontSize: 8,
          fillColor: '#4F46E5',
          color: '#FFFFFF',
          alignment: 'center',
        },
      },
    };

    const processed = ArabicTextUtil.processDocDefinition(docDefinition);
    return this.renderPdf(processed);
  }

  // ============================================
  // Builder: Customer Statement & Customer Ledger
  // ============================================
  private mapLedgerToCustomerStatement(ledger: any): any {
    const customer = ledger.customer || {};
    const transactions = ledger.transactions || [];

    let totalDebit = 0;
    let totalCredit = 0;

    const items = transactions.map((t: any) => {
      const amt = Number(customerLedgerAmount(t.type, t.amount).toString());
      const isDebit = amt > 0;
      const debitVal = isDebit ? amt : 0;
      const creditVal = !isDebit ? Math.abs(amt) : 0;
      totalDebit += debitVal;
      totalCredit += creditVal;

      let typeLabel = t.type;
      if (t.type === 'SALE') typeLabel = 'فاتورة مبيعات آجل';
      else if (t.type === 'PAYMENT') typeLabel = 'سند تحصيل / سداد';
      else if (t.type === 'RETURN') typeLabel = 'مرتجع مبيعات';
      else if (t.type === 'OPENING_BALANCE') typeLabel = 'رصيد افتتاحي';
      else if (t.type === 'ADJUSTMENT') typeLabel = 'تسوية حساب';

      return {
        date: t.createdAt,
        entryNumber: t.referenceId || (t.id ? t.id.slice(0, 8) : '—'),
        docType: typeLabel,
        description: t.description || '—',
        debit: debitVal > 0 ? debitVal.toFixed(2) : '0.00',
        credit: creditVal > 0 ? creditVal.toFixed(2) : '0.00',
        runningBalance: Number(t.balanceAfter || 0).toFixed(2),
      };
    });

    const firstTx = transactions[0];
    const openingBalance = firstTx
      ? (Number(firstTx.balanceAfter) - Number(customerLedgerAmount(firstTx.type, firstTx.amount).toString())).toFixed(2)
      : Number(customer.currentDebt || 0).toFixed(2);

    const closingBalance = items.length > 0
      ? items[items.length - 1].runningBalance
      : openingBalance;

    return {
      customer: {
        id: customer.id,
        code: customer.phone,
        name: customer.name,
        phone: customer.phone,
        nationalId: customer.nationalId,
        creditLimit: Number(customer.creditLimit || 0).toFixed(2),
        branch: customer.branch,
        company: customer.company,
      },
      period: {
        from: transactions.length > 0 ? new Date(transactions[0].createdAt).toISOString().slice(0, 10) : undefined,
        to: transactions.length > 0 ? new Date(transactions[transactions.length - 1].createdAt).toISOString().slice(0, 10) : undefined,
      },
      openingBalance,
      totalDebit: totalDebit.toFixed(2),
      totalCredit: totalCredit.toFixed(2),
      closingBalance,
      items,
    };
  }

  private buildCustomerStatementDocDefinition(report: any): any {
    const customer = report.customer || {};
    const period = report.period || {};
    const companyName = customer.company?.name || report.meta?.companyName || 'مدار كور';
    const branchName = customer.branch?.name || report.meta?.branchName;

    return {
      pageSize: 'A4',
      pageOrientation: 'portrait',
      pageMargins: [25, 45, 25, 40],
      defaultStyle: {
        font: 'Cairo',
        alignment: 'right',
        fontSize: 9,
      },
      footer: (currentPage: number, pageCount: number) => ({
        columns: [
          {
            text: `صفحة ${currentPage} من ${pageCount}`,
            alignment: 'center',
            fontSize: 8,
            color: '#888888',
          },
        ],
        margin: [20, 10, 20, 0],
      }),
      content: [
        {
          text: companyName,
          fontSize: 16,
          bold: true,
          alignment: 'center',
          color: '#582949',
        },
        {
          text: 'كشف حساب عميل تفصيلي (Customer Statement)',
          fontSize: 13,
          bold: true,
          alignment: 'center',
          color: '#009E9E',
          margin: [0, 2, 0, 3],
        },
        {
          text: period.from && period.to
            ? `الفترة من: ${period.from} إلى: ${period.to}${branchName ? ` — فرع: ${branchName}` : ''}`
            : `حتى تاريخ: ${new Date().toISOString().slice(0, 10)}${branchName ? ` — فرع: ${branchName}` : ''}`,
          fontSize: 10,
          alignment: 'center',
          margin: [0, 0, 0, 12],
          color: '#555555',
        },
        // بطاقة معلومات العميل
        {
          table: {
            widths: ['50%', '50%'],
            body: [
              [
                { text: `اسم العميل: ${customer.name || '—'}`, bold: true, fontSize: 10, fillColor: '#F8FAFC' },
                { text: `كود / هاتف: ${customer.phone || customer.code || '—'}`, fontSize: 10, fillColor: '#F8FAFC' },
              ],
              [
                { text: `الرقم القومي / الضريبي: ${customer.nationalId || '—'}`, fontSize: 9, fillColor: '#F8FAFC' },
                { text: `سقف الائتمان: ${this.fmt(Number(customer.creditLimit || 0))} ج.س`, fontSize: 9, fillColor: '#F8FAFC' },
              ],
            ],
          },
          layout: {
            hLineColor: () => '#E2E8F0',
            vLineColor: () => '#E2E8F0',
            hLineWidth: () => 1,
            vLineWidth: () => 1,
            paddingTop: () => 5,
            paddingBottom: () => 5,
          },
          margin: [0, 0, 0, 10],
        },
        // بطاقة ملخص الأرصدة (KPIs)
        {
          table: {
            widths: ['25%', '25%', '25%', '25%'],
            body: [
              [
                { text: 'الرصيد الافتتاحي', style: 'summaryHeader', alignment: 'center' },
                { text: 'إجمالي المدين (مبيعات)', style: 'summaryHeader', alignment: 'center' },
                { text: 'إجمالي الدائن (سدادات)', style: 'summaryHeader', alignment: 'center' },
                { text: 'الرصيد المستحق', style: 'summaryHeader', alignment: 'center' },
              ],
              [
                { text: `${this.fmt(Number(report.openingBalance || 0))} ج.س`, bold: true, alignment: 'center', fontSize: 10, fillColor: '#F1F5F9' },
                { text: `+${this.fmt(Number(report.totalDebit || 0))} ج.س`, bold: true, alignment: 'center', fontSize: 10, color: '#DC2626', fillColor: '#FEF2F2' },
                { text: `-${this.fmt(Number(report.totalCredit || 0))} ج.س`, bold: true, alignment: 'center', fontSize: 10, color: '#16A34A', fillColor: '#F0FDF4' },
                { text: `${this.fmt(Number(report.closingBalance || 0))} ج.س`, bold: true, alignment: 'center', fontSize: 11, color: '#009E9E', fillColor: '#F0FDFA' },
              ],
            ],
          },
          layout: {
            hLineColor: () => '#CBD5E1',
            vLineColor: () => '#CBD5E1',
            hLineWidth: () => 0.7,
            vLineWidth: () => 0.7,
            paddingTop: () => 4,
            paddingBottom: () => 4,
          },
          margin: [0, 0, 0, 14],
        },
        // جدول الحركات التفصيلي
        {
          table: {
            headerRows: 1,
            widths: [55, 60, 65, '*', 55, 55, 65],
            body: [
              [
                { text: 'التاريخ', style: 'tableHeader' },
                { text: 'رقم السند', style: 'tableHeader' },
                { text: 'نوع الحركة', style: 'tableHeader' },
                { text: 'البيان والتفاصيل', style: 'tableHeader' },
                { text: 'مدين', style: 'tableHeader' },
                { text: 'دائن', style: 'tableHeader' },
                { text: 'الرصيد التراكمي', style: 'tableHeader' },
              ],
              ...(report.items || []).map((row: any, idx: number) => {
                const isEven = idx % 2 === 0;
                const bg = isEven ? '#FFFFFF' : '#F8FAFC';
                const d = new Date(row.date);
                const dateStr = !isNaN(d.getTime()) ? d.toLocaleDateString('en-GB') : String(row.date);
                const debit = Number(row.debit || 0);
                const credit = Number(row.credit || 0);
                const balance = Number(row.runningBalance || 0);

                return [
                  { text: dateStr, fontSize: 7.5, alignment: 'center', fillColor: bg },
                  { text: String(row.entryNumber || '—'), fontSize: 7.5, alignment: 'center', fillColor: bg },
                  { text: String(row.docType || '—'), fontSize: 7.5, alignment: 'center', fillColor: bg },
                  { text: String(row.description || '—'), fontSize: 8, fillColor: bg },
                  { text: debit > 0 ? this.fmt(debit) : '-', fontSize: 8, alignment: 'left', color: debit > 0 ? '#DC2626' : '#000000', fillColor: bg },
                  { text: credit > 0 ? this.fmt(credit) : '-', fontSize: 8, alignment: 'left', color: credit > 0 ? '#16A34A' : '#000000', fillColor: bg },
                  { text: this.fmt(balance), fontSize: 8, alignment: 'left', bold: true, color: '#582949', fillColor: bg },
                ];
              }),
              // سطر الإجمالي
              [
                { text: '', border: [false, true, false, false] },
                { text: '', border: [false, true, false, false] },
                { text: '', border: [false, true, false, false] },
                { text: `إجمالي الحركات (${report.items?.length || 0})`, bold: true, fillColor: '#FFF3CD', alignment: 'center', fontSize: 8 },
                { text: this.fmt(Number(report.totalDebit || 0)), bold: true, fillColor: '#FFF3CD', alignment: 'left', fontSize: 8, color: '#DC2626' },
                { text: this.fmt(Number(report.totalCredit || 0)), bold: true, fillColor: '#FFF3CD', alignment: 'left', fontSize: 8, color: '#16A34A' },
                { text: this.fmt(Number(report.closingBalance || 0)), bold: true, fillColor: '#FFF3CD', alignment: 'left', fontSize: 8.5, color: '#582949' },
              ],
            ],
          },
          layout: {
            hLineColor: () => '#CBD5E1',
            vLineColor: () => '#CBD5E1',
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
          },
        },
        // التذييل
        {
          text: `تم استخراج هذا الكشف آلياً بواسطة منصة مدار كور (MadarCore) — ${new Date().toLocaleString('ar-EG')}`,
          fontSize: 7.5,
          italics: true,
          alignment: 'center',
          margin: [0, 15, 0, 0],
          color: '#888888',
        },
      ],
      styles: {
        tableHeader: {
          bold: true,
          fontSize: 8.5,
          fillColor: '#582949',
          color: '#FFFFFF',
          alignment: 'center',
        },
        summaryHeader: {
          bold: true,
          fontSize: 8,
          fillColor: '#E2E8F0',
          color: '#334155',
        },
      },
    };
  }

  // ============================================
  // Builder: Customer Receipt Voucher (سند قبض)
  // ============================================
  private buildReceiptVoucherDocDefinition(voucher: any): any {
    const companyName = voucher.companyName || 'مدار كور';
    const branchName = voucher.branchName || 'الفرع الرئيسي';
    const receiptNo = voucher.receiptNumber || 'REC-00000';
    const formattedDate = new Date(voucher.createdAt || Date.now()).toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const methodLabel =
      voucher.paymentMethod === 'CARD' ? 'بطاقة بنكية / شبكة' :
      voucher.paymentMethod === 'TRANSFER' ? 'تحويل بنكي / تطبيق بنكك' :
      voucher.paymentMethod === 'CHECK' ? 'شيك بنكي' : 'نقداً';

    return {
      pageSize: 'A5',
      pageOrientation: 'landscape',
      pageMargins: [20, 20, 20, 20],
      defaultStyle: {
        font: 'Cairo',
        alignment: 'right',
        fontSize: 9,
      },
      content: [
        // ترويسة السند
        {
          columns: [
            {
              width: '50%',
              text: [
                { text: `${companyName}\n`, fontSize: 13, bold: true, color: '#582949' },
                { text: `فرع: ${branchName}`, fontSize: 9, color: '#64748B' },
              ],
            },
            {
              width: '50%',
              alignment: 'left',
              text: [
                { text: `سند قبض نقدي / بنكي\n`, fontSize: 13, bold: true, color: '#009E9E' },
                { text: `رقم السند: ${receiptNo}\n`, fontSize: 10, bold: true, color: '#334155' },
                { text: `التاريخ: ${formattedDate}`, fontSize: 8, color: '#64748B' },
              ],
            },
          ],
          margin: [0, 0, 0, 10],
        },
        // خط فاصل
        {
          canvas: [{ type: 'line', x1: 0, y1: 0, x2: 555, y2: 0, lineWidth: 1.5, lineColor: '#009E9E' }],
          margin: [0, 0, 0, 10],
        },
        // بطاقة المبلغ والمستلم
        {
          table: {
            widths: ['65%', '35%'],
            body: [
              [
                {
                  text: [
                    { text: 'استلمنا من السيد / السادة: ', bold: true, color: '#475569' },
                    { text: `${voucher.customerName || '—'}\n`, bold: true, fontSize: 11, color: '#0F172A' },
                    { text: `رقم الهاتف: ${voucher.customerPhone || '—'}  |  العنوان: ${voucher.customerAddress || '—'}`, fontSize: 8, color: '#64748B' },
                  ],
                  fillColor: '#F8FAFC',
                  margin: [5, 4, 5, 4],
                },
                {
                  text: [
                    { text: 'المبلغ المقبوض\n', fontSize: 9, bold: true, alignment: 'center', color: '#007A7A' },
                    { text: `${this.fmt(Number(voucher.amount || 0))} ج.س`, fontSize: 13, bold: true, alignment: 'center', color: '#009E9E' },
                  ],
                  fillColor: '#E6F7F7',
                  margin: [5, 4, 5, 4],
                },
              ],
            ],
          },
          layout: {
            hLineColor: () => '#CBD5E1',
            vLineColor: () => '#CBD5E1',
            hLineWidth: () => 1,
            vLineWidth: () => 1,
          },
          margin: [0, 0, 0, 8],
        },
        // جدول تفاصيل العملية والحساب
        {
          table: {
            widths: ['25%', '25%', '25%', '25%'],
            body: [
              [
                { text: 'طريقة الدفع', style: 'summaryHeader', alignment: 'center' },
                { text: 'رقم المرجع / الإشعار', style: 'summaryHeader', alignment: 'center' },
                { text: 'المديونية السابقة', style: 'summaryHeader', alignment: 'center' },
                { text: 'المتبقي بعد السداد', style: 'summaryHeader', alignment: 'center' },
              ],
              [
                { text: methodLabel, alignment: 'center', bold: true, fontSize: 9, fillColor: '#FFFFFF' },
                { text: voucher.referenceNo || '—', alignment: 'center', fontSize: 9, fillColor: '#FFFFFF' },
                { text: `${this.fmt(Number(voucher.previousDebt || 0))} ج.س`, alignment: 'center', bold: true, fontSize: 9, color: '#DC2626', fillColor: '#FEF2F2' },
                { text: `${this.fmt(Number(voucher.remainingDebt || 0))} ج.س`, alignment: 'center', bold: true, fontSize: 9, color: Number(voucher.remainingDebt || 0) > 0 ? '#DC2626' : '#16A34A', fillColor: '#F8FAFC' },
              ],
            ],
          },
          layout: {
            hLineColor: () => '#CBD5E1',
            vLineColor: () => '#CBD5E1',
            hLineWidth: () => 0.8,
            vLineWidth: () => 0.8,
            paddingTop: () => 4,
            paddingBottom: () => 4,
          },
          margin: [0, 0, 0, 8],
        },
        // البيان
        {
          table: {
            widths: ['100%'],
            body: [
              [
                {
                  text: [
                    { text: 'وذلك سداداً عن: ', bold: true, color: '#334155' },
                    { text: voucher.notes || voucher.description || 'سداد دفعة من الحساب الجاري / مديونية المبيعات الآجلة' },
                  ],
                  fillColor: '#F8FAFC',
                  fontSize: 8.5,
                  margin: [5, 4, 5, 4],
                },
              ],
            ],
          },
          layout: {
            hLineColor: () => '#E2E8F0',
            vLineColor: () => '#E2E8F0',
          },
          margin: [0, 0, 0, 10],
        },
        // التوقيعات
        {
          columns: [
            {
              width: '50%',
              text: [
                { text: `المستلم / المحصل: ${voucher.createdBy || 'الكاشير'}\n`, fontSize: 8, color: '#475569' },
                { text: 'التوقيع: ............................', fontSize: 8, color: '#94A3B8' },
              ],
            },
            {
              width: '50%',
              alignment: 'left',
              text: [
                { text: 'توقيع المسلّم (العميل):\n', fontSize: 8, color: '#475569' },
                { text: 'التوقيع: ............................', fontSize: 8, color: '#94A3B8' },
              ],
            },
          ],
        },
      ],
      styles: {
        summaryHeader: {
          bold: true,
          fontSize: 8,
          fillColor: '#F1F5F9',
          color: '#334155',
        },
      },
    };
  }

  // ============================================
  // Builder: Expense Voucher (سند صرف نقدية / بنك)
  // ============================================
  private buildExpenseVoucherDocDefinition(voucher: any): any {
    const companyName = voucher.companyName || 'مدار كور';
    const branchName = voucher.branchName || 'الفرع الرئيسي';
    const voucherNo = voucher.expenseNumber || 'EXP-00000';
    const currency = voucher.currency || 'ج.س';

    let formattedDate = '';
    try {
      formattedDate = new Date(voucher.date || voucher.createdAt || Date.now()).toLocaleString('ar-EG', {
        timeZone: voucher.timezone || 'Africa/Cairo',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      formattedDate = new Date(voucher.date || voucher.createdAt || Date.now()).toLocaleDateString('ar-EG');
    }

    const statusBadge =
      voucher.status === 'APPROVED'
        ? {
            text: 'معتمد (APPROVED)',
            fillColor: '#DCFCE7',
            color: '#15803D',
            desc: 'سند معتمد ومقيد دفترياً ومصرح بالصرف',
          }
        : voucher.status === 'REJECTED'
        ? {
            text: 'مرفوض (REJECTED)',
            fillColor: '#FEE2E2',
            color: '#B91C1C',
            desc: 'تنبيه: سند مرفوض وغير معتمد محاسبياً',
          }
        : {
            text: 'قيد الاعتماد (PENDING)',
            fillColor: '#FEF3C7',
            color: '#B45309',
            desc: 'مسودة قيد المراجعة - لا تعتبر إثبات صرف نهائي',
          };

    const paymentSourceLabel =
      voucher.paidFrom === 'CASH'
        ? 'خزينة النقدية (الدرج)'
        : voucher.paidFrom === 'BANK'
        ? 'الحساب البنكي'
        : (voucher.paidFrom || 'غير محدد');

    const paymentMethodLabel =
      voucher.paymentMethod === 'CASH'
        ? 'نقدي'
        : voucher.paymentMethod === 'BANK_TRANSFER'
        ? 'تحويل بنكي'
        : voucher.paymentMethod === 'CHEQUE'
        ? 'شيك'
        : (voucher.paymentMethod || 'نقدي');

    let categoryLabel = 'غير محدد';
    if (voucher.category === 'OPERATING' || voucher.category === 'EXPENSE') {
      categoryLabel = 'مصروف تشغيلي';
    } else if (voucher.category === 'LIABILITY') {
      categoryLabel = 'سداد التزام';
    } else if (voucher.category) {
      categoryLabel = String(voucher.category);
    }

    const beneficiary = voucher.paidTo && String(voucher.paidTo).trim().length > 0
      ? String(voucher.paidTo).trim()
      : 'غير محدد';

    const accountText = voucher.accountCode || voucher.accountName
      ? `${voucher.accountCode ? voucher.accountCode + ' - ' : ''}${voucher.accountName || ''}`
      : 'غير محدد';

    return {
      pageSize: 'A4',
      pageOrientation: 'portrait',
      pageMargins: [30, 35, 30, 35],
      defaultStyle: {
        font: 'Cairo',
        alignment: 'right',
        fontSize: 10,
      },
      footer: (currentPage: number, pageCount: number) => ({
        columns: [
          { text: 'منصة MadarCore ERP & POS المحاسبية', alignment: 'right', fontSize: 8, color: '#94A3B8' },
          { text: `صفحة ${currentPage} من ${pageCount}`, alignment: 'center', fontSize: 8, color: '#94A3B8' },
          { text: `تاريخ التصدير: ${formattedDate}`, alignment: 'left', fontSize: 8, color: '#94A3B8' },
        ],
        margin: [30, 10, 30, 0],
      }),
      content: [
        // ترويسة السند
        {
          columns: [
            {
              width: '50%',
              text: [
                { text: `${companyName}\n`, fontSize: 15, bold: true, color: '#582949' },
                { text: `فرع: ${branchName}`, fontSize: 10, color: '#64748B' },
              ],
            },
            {
              width: '50%',
              alignment: 'left',
              text: [
                { text: 'سند صرف نقدية / بنك\n', fontSize: 15, bold: true, color: '#009E9E' },
                { text: `رقم السند: ${voucherNo}\n`, fontSize: 11, bold: true, color: '#334155' },
                { text: `التاريخ: ${formattedDate}`, fontSize: 9, color: '#64748B' },
              ],
            },
          ],
          margin: [0, 0, 0, 10],
        },
        // خط فاصل علوي
        {
          canvas: [{ type: 'line', x1: 0, y1: 0, x2: 535, y2: 0, lineWidth: 2, lineColor: '#582949' }],
          margin: [0, 0, 0, 10],
        },
        // شريط الحالة (Status Banner)
        {
          table: {
            widths: ['100%'],
            body: [
              [
                {
                  columns: [
                    {
                      width: '30%',
                      text: `الحالة: ${statusBadge.text}`,
                      bold: true,
                      fontSize: 11,
                      color: statusBadge.color,
                    },
                    {
                      width: '70%',
                      text: statusBadge.desc,
                      fontSize: 9,
                      alignment: 'left',
                      color: statusBadge.color,
                    },
                  ],
                  fillColor: statusBadge.fillColor,
                  margin: [8, 5, 8, 5],
                },
              ],
            ],
          },
          layout: 'noBorders',
          margin: [0, 0, 0, 12],
        },
        // بطاقة المبلغ وجهة الصرف
        {
          table: {
            widths: ['60%', '40%'],
            body: [
              [
                {
                  text: [
                    { text: 'المبلغ المنصرف:\n', fontSize: 10, color: '#475569', bold: true },
                    { text: `${this.fmt(Number(voucher.amount || 0))} `, fontSize: 20, bold: true, color: '#582949' },
                    { text: `${currency}`, fontSize: 12, bold: true, color: '#582949' },
                  ],
                  fillColor: '#FDF2F8',
                  margin: [10, 8, 10, 8],
                },
                {
                  text: [
                    { text: 'مصدر الدفع:\n', fontSize: 9, color: '#0F766E', bold: true },
                    { text: `${paymentSourceLabel}\n`, fontSize: 13, bold: true, color: '#009E9E' },
                    { text: `طريقة الصرف: ${paymentMethodLabel}`, fontSize: 9, color: '#475569' },
                  ],
                  fillColor: '#F0FDFA',
                  margin: [10, 8, 10, 8],
                },
              ],
            ],
          },
          layout: {
            hLineColor: () => '#E2E8F0',
            vLineColor: () => '#E2E8F0',
            hLineWidth: () => 1,
            vLineWidth: () => 1,
          },
          margin: [0, 0, 0, 14],
        },
        // جدول تفاصيل السند
        {
          table: {
            widths: ['22%', '28%', '22%', '28%'],
            body: [
              [
                { text: 'اصرفوا إلى السيد / الجهة', style: 'fieldLabel' },
                { text: beneficiary, style: 'fieldValue', bold: true },
                { text: 'تصنيف المصروف', style: 'fieldLabel' },
                { text: categoryLabel, style: 'fieldValue' },
              ],
              [
                { text: 'الحساب المدين', style: 'fieldLabel' },
                { text: accountText, style: 'fieldValue' },
                { text: 'بند الصرف', style: 'fieldLabel' },
                { text: voucher.expenseType || 'مصروفات عامة', style: 'fieldValue' },
              ],
              [
                { text: 'طريقة الصرف', style: 'fieldLabel' },
                { text: paymentMethodLabel, style: 'fieldValue' },
                { text: 'رقم المرجع / الشيك', style: 'fieldLabel' },
                { text: voucher.referenceNo || '—', style: 'fieldValue' },
              ],
            ],
          },
          layout: {
            hLineColor: () => '#CBD5E1',
            vLineColor: () => '#CBD5E1',
            hLineWidth: () => 0.8,
            vLineWidth: () => 0.8,
            paddingTop: () => 6,
            paddingBottom: () => 6,
          },
          margin: [0, 0, 0, 12],
        },
        // البيان والغرض من الصرف
        {
          table: {
            widths: ['100%'],
            body: [
              [
                {
                  text: [
                    { text: 'البيان والغرض من الصرف:\n', bold: true, color: '#334155', fontSize: 10 },
                    { text: voucher.description || '—', color: '#1E293B', fontSize: 10 },
                  ],
                  fillColor: '#F8FAFC',
                  margin: [8, 8, 8, 8],
                },
              ],
              ...(voucher.status === 'REJECTED' && voucher.rejectionReason
                ? [
                    [
                      {
                        text: [
                          { text: 'سبب الرفض:\n', bold: true, color: '#DC2626', fontSize: 10 },
                          { text: voucher.rejectionReason, color: '#991B1B', fontSize: 10 },
                        ],
                        fillColor: '#FEF2F2',
                        margin: [8, 6, 8, 6],
                      },
                    ],
                  ]
                : []),
            ],
          },
          layout: {
            hLineColor: () => '#CBD5E1',
            vLineColor: () => '#CBD5E1',
            hLineWidth: () => 0.8,
            vLineWidth: () => 0.8,
          },
          margin: [0, 0, 0, 25],
        },
        // التوقيعات والاعتمادات
        {
          columns: [
            {
              width: '33.3%',
              text: [
                { text: 'المستلم / المستفيد\n\n', bold: true, fontSize: 10, color: '#334155', alignment: 'center' },
                { text: `الاسم: ${beneficiary}\n\n`, fontSize: 9, color: '#475569', alignment: 'center' },
                { text: 'التوقيع: ............................', fontSize: 9, color: '#94A3B8', alignment: 'center' },
              ],
            },
            {
              width: '33.3%',
              text: [
                { text: 'المحاسب / الصندوق\n\n', bold: true, fontSize: 10, color: '#334155', alignment: 'center' },
                { text: `الاسم: ${voucher.creatorName || 'المحاسب'}\n\n`, fontSize: 9, color: '#475569', alignment: 'center' },
                { text: 'التوقيع: ............................', fontSize: 9, color: '#94A3B8', alignment: 'center' },
              ],
            },
            {
              width: '33.4%',
              text: [
                { text: 'المدير المسؤول / الاعتماد\n\n', bold: true, fontSize: 10, color: '#334155', alignment: 'center' },
                {
                  text: `الاسم: ${voucher.status === 'APPROVED' ? (voucher.approverName || 'معتمد رسمياً') : '..........................'}\n\n`,
                  fontSize: 9,
                  color: '#475569',
                  alignment: 'center',
                },
                { text: 'التوقيع: ............................', fontSize: 9, color: '#94A3B8', alignment: 'center' },
              ],
            },
          ],
          margin: [0, 10, 0, 0],
        },
      ],
      styles: {
        fieldLabel: {
          bold: true,
          fontSize: 9,
          fillColor: '#F1F5F9',
          color: '#334155',
        },
        fieldValue: {
          fontSize: 9.5,
          color: '#0F172A',
          fillColor: '#FFFFFF',
        },
      },
    };
  }

  // ============================================
  // Helper: Render PDF to Buffer
  // ============================================
  private renderPdf(docDefinition: any): Promise<Buffer> {
    if (docDefinition.rtl === undefined) {
      docDefinition.rtl = true;
    }
    if (!docDefinition.defaultStyle) {
      docDefinition.defaultStyle = {};
    }
    if (!docDefinition.defaultStyle.font) {
      docDefinition.defaultStyle.font = 'Cairo';
    }
    return pdfmake.createPdf(docDefinition).getBuffer();
  }

  private fmt(value?: number): string {
    if (value === undefined || value === null) return '-';
    if (Math.abs(value) < 0.005) return '-';
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
}
