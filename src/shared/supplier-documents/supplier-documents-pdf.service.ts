import { Injectable, Logger } from '@nestjs/common';
import { ArabicTextUtil } from '../../modules/accounting/reports/utils/arabic-text.util';

const pdfmake = require('pdfmake-rtl');
const Roboto = require('pdfmake-rtl/fonts/Roboto');
const Cairo = require('pdfmake-rtl/fonts/Cairo');

@Injectable()
export class SupplierDocumentsPdfService {
  private readonly logger = new Logger(SupplierDocumentsPdfService.name);

  constructor() {
    try {
      pdfmake.addFonts(Roboto);
      pdfmake.addFonts(Cairo);
      this.logger.log('✅ تهيئة محرك pdfmake-rtl وخطوط Cairo لمستندات الموردين بنجاح');
    } catch (error: any) {
      this.logger.error(`❌ فشل تحميل خطوط مستندات الموردين: ${error.message}`);
    }
  }

  // ============================================
  // 1. كشف حساب المورد PDF
  // ============================================
  async generateSupplierStatementPdf(statement: any): Promise<Buffer> {
    const docDefinition = this.buildSupplierStatementDocDefinition(statement);
    const processed = ArabicTextUtil.processDocDefinition(docDefinition);
    return this.renderPdf(processed);
  }

  // ============================================
  // 2. تقرير الدائنين PDF (ملخص أو مفصل بالحركات)
  // ============================================
  async generateCreditorsReportPdf(report: any, type: 'summary' | 'detailed' = 'summary'): Promise<Buffer> {
    const docDefinition = this.buildCreditorsReportDocDefinition(report, type);
    const processed = ArabicTextUtil.processDocDefinition(docDefinition);
    return this.renderPdf(processed);
  }

  // ============================================
  // 3. فاتورة المشتريات / أمر الشراء PDF
  // ============================================
  async generatePurchaseInvoicePdf(order: any): Promise<Buffer> {
    const docDefinition = this.buildPurchaseInvoiceDocDefinition(order);
    const processed = ArabicTextUtil.processDocDefinition(docDefinition);
    return this.renderPdf(processed);
  }

  // ============================================
  // 4. مستند الاستلام والتوريد PDF
  // ============================================
  async generateReceivingNotePdf(order: any): Promise<Buffer> {
    const docDefinition = this.buildReceivingNoteDocDefinition(order);
    const processed = ArabicTextUtil.processDocDefinition(docDefinition);
    return this.renderPdf(processed);
  }

  async generateSupplierPaymentPdf(payment: any): Promise<Buffer> {
    const docDefinition = this.buildSupplierPaymentDocDefinition(payment);
    const processed = ArabicTextUtil.processDocDefinition(docDefinition);
    return this.renderPdf(processed);
  }

  // ============================================
  // Builders
  // ============================================

  private buildSupplierStatementDocDefinition(statement: any): any {
    const supplier = statement.supplier || {};
    const company = statement.company || {};
    const branch = statement.branch || {};
    const period = statement.period || {};
    const summary = statement.summary || {};
    const items = statement.items || [];
    const currency = company.currency || 'ج.س';

    const beginningText = summary.isBeginningBalanceProven && summary.beginningBalance !== null
      ? `${this.fmt(summary.beginningBalance)} ${currency}`
      : 'غير متحقق';

    const endingText = summary.isEndingBalanceProven && summary.endingBalance !== null
      ? `${this.fmt(summary.endingBalance)} ${currency}`
      : 'غير متحقق';

    return {
      pageSize: 'A4',
      pageOrientation: 'portrait',
      pageMargins: [25, 35, 25, 30],
      defaultStyle: { font: 'Cairo', alignment: 'right', fontSize: 9 },
      footer: (currentPage: number, pageCount: number) => ({
        columns: [
          { text: 'نظام DawaCore ERP المحاسبي', alignment: 'right', fontSize: 8, color: '#94A3B8' },
          { text: `صفحة ${currentPage} من ${pageCount}`, alignment: 'center', fontSize: 8, color: '#94A3B8' },
          { text: `تاريخ الاستخراج: ${new Date().toLocaleDateString('ar-EG')}`, alignment: 'left', fontSize: 8, color: '#94A3B8' },
        ],
        margin: [25, 10, 25, 0],
      }),
      content: [
        // ترويسة
        {
          columns: [
            {
              width: '50%',
              text: [
                { text: `${company.name || 'مجموعة صيدليات داواكور'}\n`, fontSize: 14, bold: true, color: '#582949' },
                { text: `فرع: ${branch.name || 'كافة الفروع المصرح بها'}\n`, fontSize: 9, color: '#64748B' },
              ],
            },
            {
              width: '50%',
              alignment: 'left',
              text: [
                { text: 'كشف حساب مورد (Supplier Statement)\n', fontSize: 13, bold: true, color: '#009E9E' },
                { text: `الفترة: ${period.from || 'البداية'} إلى ${period.to || 'الآن'}\n`, fontSize: 9, color: '#334155' },
              ],
            },
          ],
          margin: [0, 0, 0, 8],
        },
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 545, y2: 0, lineWidth: 1.5, lineColor: '#582949' }], margin: [0, 0, 0, 8] },

        // بيانات المورد
        {
          table: {
            widths: ['50%', '50%'],
            body: [
              [
                {
                  text: [
                    { text: 'اسم المورد: ', bold: true, color: '#475569' },
                    { text: `${supplier.name || '—'} `, bold: true, color: '#0F172A' },
                    { text: supplier.companyName ? `(${supplier.companyName})` : '', color: '#334155' },
                    { text: '\nالهاتف: ', bold: true, color: '#475569' },
                    { text: supplier.phone || '—', color: '#0F172A' },
                  ],
                  fillColor: '#F8FAFC',
                },
                {
                  text: [
                    { text: 'الرقم الضريبي: ', bold: true, color: '#475569' },
                    { text: `${supplier.taxNumber || '—'}\n`, color: '#0F172A' },
                    { text: 'العنوان: ', bold: true, color: '#475569' },
                    { text: `${supplier.address || '—'}`, color: '#0F172A' },
                  ],
                  fillColor: '#F8FAFC',
                },
              ],
            ],
          },
          layout: {
            hLineColor: () => '#E2E8F0',
            vLineColor: () => '#E2E8F0',
            hLineWidth: () => 0.8,
            vLineWidth: () => 0.8,
          },
          margin: [0, 0, 0, 8],
        },

        // بطاقات الملخص المالي
        {
          table: {
            widths: ['20%', '20%', '20%', '20%', '20%'],
            body: [
              [
                { text: 'رصيد أول المدة', style: 'summaryHeader', alignment: 'center' },
                { text: 'إجمالي الاستحقاق (دائن)', style: 'summaryHeader', alignment: 'center' },
                { text: 'إجمالي السداد (مدين)', style: 'summaryHeader', alignment: 'center' },
                { text: 'صافي حركة الفترة', style: 'summaryHeader', alignment: 'center' },
                { text: 'المتبقي الآجل للمورد', style: 'summaryHeader', alignment: 'center' },
              ],
              [
                { text: beginningText, bold: true, alignment: 'center', color: '#334155', fillColor: '#F8FAFC' },
                { text: `${this.fmt(summary.totalCredit)} ${currency}`, bold: true, alignment: 'center', color: '#DC2626', fillColor: '#FEF2F2' },
                { text: `${this.fmt(summary.totalDebit)} ${currency}`, bold: true, alignment: 'center', color: '#16A34A', fillColor: '#F0FDF4' },
                { text: `${this.fmt(summary.netMovement)} ${currency}`, bold: true, alignment: 'center', color: '#009E9E', fillColor: '#F0FDFA' },
                { text: endingText, bold: true, alignment: 'center', color: '#582949', fillColor: '#FDF2F8' },
              ],
            ],
          },
          layout: {
            hLineColor: () => '#CBD5E1',
            vLineColor: () => '#CBD5E1',
            hLineWidth: () => 0.8,
            vLineWidth: () => 0.8,
          },
          margin: [0, 0, 0, 6],
        },

        // شريط المطابقة مع الرصيد المسجل في بطاقة المورد
        {
          table: {
            widths: ['100%'],
            body: [
              [
                {
                  columns: [
                    { width: '45%', text: `الرصيد المسجل حالياً ببطاقة المورد: ${this.fmt(summary.recordedCurrentDebt)} ${currency}`, bold: true, fontSize: 8.5 },
                    {
                      width: '55%',
                      alignment: 'left',
                      text: summary.canCompareWithCurrent
                        ? (Math.abs(Number(summary.variance || 0)) > 0.01
                            ? `فرق المطابقة مع الرصيد المسجل: ${this.fmt(summary.variance)} ${currency}`
                            : `المطابقة: متطابق 100% مع الحركات المثبتة`)
                        : `مقارنة الرصيد اللحظي: ${summary.varianceSuppressedReason || 'حُجب فرق المطابقة'}`,
                      bold: true,
                      fontSize: 8.5,
                      color: summary.canCompareWithCurrent
                        ? (Math.abs(Number(summary.variance || 0)) > 0.01 ? '#D97706' : '#16A34A')
                        : '#64748B',
                    },
                  ],
                  fillColor: summary.canCompareWithCurrent
                    ? (Math.abs(Number(summary.variance || 0)) > 0.01 ? '#FFFBEB' : '#F0FDF4')
                    : '#F8FAFC',
                  margin: [6, 4, 6, 4],
                },
              ],
            ],
          },
          layout: 'noBorders',
          margin: [0, 0, 0, 10],
        },

        // جدول حركات الحساب
        {
          table: {
            headerRows: 1,
            widths: [52, 60, 58, '*', 48, 48, 54],
            body: [
              [
                { text: 'تاريخ العملية', style: 'tableHeader' },
                { text: 'نوع العملية', style: 'tableHeader' },
                { text: 'رقم العملية', style: 'tableHeader' },
                { text: 'البيان / الأصناف', style: 'tableHeader' },
                { text: 'مدين', style: 'tableHeader' },
                { text: 'دائن', style: 'tableHeader' },
                { text: 'الرصيد بعد العملية', style: 'tableHeader' },
              ],
              ...(items.length === 0
                ? [[{ text: 'لا توجد حركات مثبتة للمورد خلال الفترة المحددة', colSpan: 7, alignment: 'center', margin: [0, 10, 0, 10], color: '#64748B' }, {}, {}, {}, {}, {}, {}]]
                : items.map((item: any, idx: number) => {
                    const isEven = idx % 2 === 0;
                    const bg = isEven ? '#FFFFFF' : '#F8FAFC';
                    return [
                      { text: item.date || '—', alignment: 'center', fontSize: 7.5, fillColor: bg },
                      { text: item.operationType || '—', alignment: 'center', fontSize: 7.5, bold: true, fillColor: bg },
                      { text: item.operationNumber || item.documentNumber || '—', alignment: 'center', fontSize: 7.5, bold: true, fillColor: bg },
                      {
                        stack: [
                          { text: item.description || '—', fontSize: 8, bold: !item.isSubRow },
                          ...(item.itemsDetails && item.itemsDetails.length > 0
                            ? [
                                {
                                  text: `الأصناف: ${item.itemsDetails.map((it: any) => `${it.tradeName} (${it.quantity} ${it.unitType})`).join(' | ')}`,
                                  fontSize: 7.5,
                                  color: '#64748B',
                                  margin: [0, 2, 0, 0],
                                },
                              ]
                            : []),
                        ],
                        fillColor: bg,
                      },
                      { text: item.debit > 0 ? this.fmt(item.debit) : '—', alignment: 'center', fontSize: 8, color: '#16A34A', fillColor: bg },
                      { text: item.credit > 0 ? this.fmt(item.credit) : '—', alignment: 'center', fontSize: 8, color: '#DC2626', fillColor: bg },
                      { text: item.balance !== null ? `${this.fmt(item.balance)}` : 'غير متحقق', alignment: 'center', fontSize: 8, bold: true, fillColor: bg },
                    ];
                  })),
            ],
          },
          layout: {
            hLineColor: () => '#E2E8F0',
            vLineColor: () => '#E2E8F0',
            hLineWidth: () => 0.6,
            vLineWidth: () => 0.6,
            paddingTop: () => 4,
            paddingBottom: () => 4,
          },
          margin: [0, 0, 0, 15],
        },

        // التوقيعات
        {
          columns: [
            {
              width: '33.3%',
              text: [
                { text: 'إعداد المحاسب:\n\n', bold: true, fontSize: 8.5, color: '#334155', alignment: 'center' },
                { text: 'الاسم: ..........................\n\n', fontSize: 8, color: '#64748B', alignment: 'center' },
                { text: 'التوقيع: ............................', fontSize: 8, color: '#94A3B8', alignment: 'center' },
              ],
            },
            {
              width: '33.3%',
              text: [
                { text: 'مراجعة الحسابات:\n\n', bold: true, fontSize: 8.5, color: '#334155', alignment: 'center' },
                { text: 'الاسم: ..........................\n\n', fontSize: 8, color: '#64748B', alignment: 'center' },
                { text: 'التوقيع: ............................', fontSize: 8, color: '#94A3B8', alignment: 'center' },
              ],
            },
            {
              width: '33.4%',
              text: [
                { text: 'مصادقة المورد:\n\n', bold: true, fontSize: 8.5, color: '#334155', alignment: 'center' },
                { text: `المندوب: ..........................\n\n`, fontSize: 8, color: '#64748B', alignment: 'center' },
                { text: 'الختم / التوقيع: ............................', fontSize: 8, color: '#94A3B8', alignment: 'center' },
              ],
            },
          ],
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
          fillColor: '#F1F5F9',
          color: '#334155',
        },
      },
    };
  }

  private buildCreditorsReportDocDefinition(report: any, type: 'summary' | 'detailed' = 'summary'): any {
    const company = report.company || {};
    const branch = report.branch || {};
    const period = report.period || {};
    const summary = report.summary || {};
    const suppliers = report.suppliers || [];
    const currency = company.currency || 'ج.س';

    const isDetailed = type === 'detailed';

    const content: any[] = [
      {
        columns: [
          {
            width: '50%',
            text: [
              { text: `${company.name || 'مجموعة صيدليات داواكور'}\n`, fontSize: 13, bold: true, color: '#582949' },
              { text: `فرع: ${branch.name || 'كافة الفروع'}\n`, fontSize: 8.5, color: '#64748B' },
            ],
          },
          {
            width: '50%',
            alignment: 'left',
            text: [
              { text: `تقرير أرصدة الدائنين والموردين (${isDetailed ? 'مفصل بالحركات' : 'ملخص'})\n`, fontSize: 12, bold: true, color: '#009E9E' },
              { text: `الفترة: ${period.from || 'البداية'} إلى ${period.to || 'الآن'}\n`, fontSize: 8.5, color: '#334155' },
            ],
          },
        ],
        margin: [0, 0, 0, 6],
      },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 800, y2: 0, lineWidth: 1.5, lineColor: '#582949' }], margin: [0, 0, 0, 8] },

      // ملخص KPIs
      {
        table: {
          widths: ['16%', '16%', '17%', '17%', '17%', '17%'],
          body: [
            [
              { text: 'إجمالي الاستحقاق (دائن)', style: 'summaryHeader', alignment: 'center' },
              { text: 'إجمالي السداد (مدين)', style: 'summaryHeader', alignment: 'center' },
              { text: 'صافي حركة الفترة', style: 'summaryHeader', alignment: 'center' },
              { text: 'إجمالي رصيد الإقفال', style: 'summaryHeader', alignment: 'center' },
              { text: 'الرصيد المسجل حالياً', style: 'summaryHeader', alignment: 'center' },
              { text: 'فرق المطابقة الإجمالي', style: 'summaryHeader', alignment: 'center' },
            ],
            [
              { text: `${this.fmt(summary.totalCredit)} ${currency}`, bold: true, alignment: 'center', color: '#DC2626', fillColor: '#FEF2F2' },
              { text: `${this.fmt(summary.totalDebit)} ${currency}`, bold: true, alignment: 'center', color: '#16A34A', fillColor: '#F0FDF4' },
              { text: `${this.fmt(summary.totalPeriodNetMovement)} ${currency}`, bold: true, alignment: 'center', color: '#009E9E', fillColor: '#F0FDFA' },
              { text: summary.totalClosingBalance !== null ? `${this.fmt(summary.totalClosingBalance)} ${currency}` : 'غير متحقق كلياً', bold: true, alignment: 'center', color: '#582949', fillColor: '#FDF2F8' },
              { text: `${this.fmt(summary.totalRecordedDebt)} ${currency}`, bold: true, alignment: 'center', color: '#334155', fillColor: '#F8FAFC' },
              {
                text: summary.totalVariance !== null ? `${this.fmt(summary.totalVariance)} ${currency}` : '— (محجوب)',
                bold: true,
                alignment: 'center',
                color: summary.totalVariance !== null && Math.abs(Number(summary.totalVariance)) > 0.01 ? '#D97706' : '#16A34A',
                fillColor: summary.totalVariance !== null && Math.abs(Number(summary.totalVariance)) > 0.01 ? '#FFFBEB' : '#F0FDF4',
              },
            ],
          ],
        },
        layout: { hLineColor: () => '#CBD5E1', vLineColor: () => '#CBD5E1', hLineWidth: () => 0.8, vLineWidth: () => 0.8 },
        margin: [0, 0, 0, 6],
      },

      {
        text: `عدد الموردين: ${suppliers.length} | موردون بأرصدة غير مكتملة تاريخياً: ${summary.unprovenCount || 0}`,
        fontSize: 8,
        color: '#64748B',
        margin: [0, 0, 0, 8],
      },
    ];

    if (!isDetailed) {
      // جدول الملخص لجميع الموردين
      content.push({
        table: {
          headerRows: 1,
          widths: [20, 110, 85, 55, 65, 65, 70, 75, 75, 70],
          body: [
            [
              { text: '#', style: 'tableHeader' },
              { text: 'اسم المورد', style: 'tableHeader' },
              { text: 'الشركة / الهاتف', style: 'tableHeader' },
              { text: 'الفرع', style: 'tableHeader' },
              { text: 'استحقاق (دائن)', style: 'tableHeader' },
              { text: 'سداد (مدين)', style: 'tableHeader' },
              { text: 'صافي الحركة', style: 'tableHeader' },
              { text: 'رصيد الإقفال', style: 'tableHeader' },
              { text: 'الرصيد المسجل', style: 'tableHeader' },
              { text: 'فرق المطابقة', style: 'tableHeader' },
            ],
            ...(suppliers.length === 0
              ? [[{ text: 'لا يوجد دائنون مسجلون', colSpan: 10, alignment: 'center', margin: [0, 8, 0, 8] }, {}, {}, {}, {}, {}, {}, {}, {}, {}]]
              : suppliers.map((s: any, idx: number) => {
                  const isEven = idx % 2 === 0;
                  const bg = isEven ? '#FFFFFF' : '#F8FAFC';
                  const closingText = s.isClosingBalanceProven && s.closingBalance !== null ? this.fmt(s.closingBalance) : 'غير متحقق';
                  const varianceText = s.canCompareWithCurrent && s.variance !== null ? this.fmt(s.variance) : '—';
                  return [
                    { text: String(idx + 1), alignment: 'center', fontSize: 7.5, fillColor: bg },
                    { text: s.name, bold: true, fontSize: 8, fillColor: bg },
                    { text: `${s.companyName || ''}\n${s.phone || ''}`, fontSize: 7.5, fillColor: bg },
                    { text: s.branchName || '—', fontSize: 7.5, alignment: 'center', fillColor: bg },
                    { text: this.fmt(s.totalCredit), alignment: 'center', fontSize: 8, color: '#DC2626', fillColor: bg },
                    { text: this.fmt(s.totalDebit), alignment: 'center', fontSize: 8, color: '#16A34A', fillColor: bg },
                    { text: this.fmt(s.periodNetMovement), alignment: 'center', fontSize: 8, color: '#009E9E', fillColor: bg },
                    { text: closingText, alignment: 'center', bold: true, fontSize: 8, color: '#582949', fillColor: bg },
                    { text: this.fmt(s.recordedCurrentDebt), alignment: 'center', fontSize: 8, fillColor: bg },
                    {
                      text: varianceText,
                      alignment: 'center',
                      bold: true,
                      fontSize: 8,
                      color: s.variance !== null && Math.abs(Number(s.variance || 0)) > 0.01 ? '#D97706' : '#16A34A',
                      fillColor: bg,
                    },
                  ];
                })),
          ],
        },
        layout: {
          hLineColor: () => '#E2E8F0',
          vLineColor: () => '#E2E8F0',
          hLineWidth: () => 0.6,
          vLineWidth: () => 0.6,
          paddingTop: () => 3,
          paddingBottom: () => 3,
        },
        margin: [0, 0, 0, 15],
      });
    } else {
      // تفصيلي مجمع حسب المورد مع حركات كل مورد
      for (let sIdx = 0; sIdx < suppliers.length; sIdx++) {
        const s = suppliers[sIdx];
        const items = s.items || [];
        const closingText = s.isClosingBalanceProven && s.closingBalance !== null ? this.fmt(s.closingBalance) : 'غير متحقق';

        content.push({
          table: {
            widths: ['100%'],
            body: [
              [
                {
                  columns: [
                    { width: '40%', text: `${sIdx + 1}. ${s.name} ${s.companyName ? `(${s.companyName})` : ''} - هاتف: ${s.phone || '—'}`, bold: true, fontSize: 8.5, color: '#0F172A' },
                    { width: '20%', text: `الفرع: ${s.branchName || '—'}`, fontSize: 8, alignment: 'center', color: '#475569' },
                    { width: '40%', text: `صافي حركة الفترة: ${this.fmt(s.periodNetMovement)} | رصيد الإقفال: ${closingText}`, bold: true, fontSize: 8.5, alignment: 'left', color: '#582949' },
                  ],
                  fillColor: '#F1F5F9',
                  margin: [4, 4, 4, 4],
                },
              ],
            ],
          },
          layout: 'noBorders',
          margin: [0, sIdx > 0 ? 10 : 0, 0, 4],
        });

        content.push({
          table: {
            headerRows: 1,
            widths: [65, 75, 75, '*', 60, 60, 70],
            body: [
              [
                { text: 'تاريخ العملية', style: 'tableHeader' },
                { text: 'نوع العملية', style: 'tableHeader' },
                { text: 'رقم العملية', style: 'tableHeader' },
                { text: 'البيان / الأصناف', style: 'tableHeader' },
                { text: 'مدين', style: 'tableHeader' },
                { text: 'دائن', style: 'tableHeader' },
                { text: 'الرصيد بعد العملية', style: 'tableHeader' },
              ],
              ...(items.length === 0
                ? [[{ text: 'لا توجد حركات مثبتة لهذا المورد خلال الفترة المحددة', colSpan: 7, alignment: 'center', margin: [0, 4, 0, 4], color: '#64748B' }, {}, {}, {}, {}, {}, {}]]
                : items.map((it: any, iIdx: number) => {
                    const bg = iIdx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
                    return [
                      { text: it.date || '—', alignment: 'center', fontSize: 7.5, fillColor: bg },
                      { text: it.operationType || '—', alignment: 'center', fontSize: 7.5, bold: true, fillColor: bg },
                      { text: it.operationNumber || it.documentNumber || '—', alignment: 'center', fontSize: 7.5, bold: true, fillColor: bg },
                      {
                        stack: [
                          { text: it.description || '—', fontSize: 7.5 },
                          ...(it.itemsDetails && it.itemsDetails.length > 0
                            ? [
                                {
                                  text: `الأصناف: ${it.itemsDetails.map((x: any) => `${x.tradeName} (${x.quantity} ${x.unitType})`).join(' | ')}`,
                                  fontSize: 7,
                                  color: '#64748B',
                                  margin: [0, 2, 0, 0],
                                },
                              ]
                            : []),
                        ],
                        fillColor: bg,
                      },
                      { text: it.debit > 0 ? this.fmt(it.debit) : '—', alignment: 'center', fontSize: 7.5, color: '#16A34A', fillColor: bg },
                      { text: it.credit > 0 ? this.fmt(it.credit) : '—', alignment: 'center', fontSize: 7.5, color: '#DC2626', fillColor: bg },
                      { text: it.balance !== null ? this.fmt(it.balance) : 'غير متحقق', alignment: 'center', fontSize: 7.5, bold: true, fillColor: bg },
                    ];
                  })),
            ],
          },
          layout: {
            hLineColor: () => '#E2E8F0',
            vLineColor: () => '#E2E8F0',
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            paddingTop: () => 2,
            paddingBottom: () => 2,
          },
          margin: [0, 0, 0, 6],
        });
      }
    }

    return {
      pageSize: 'A4',
      pageOrientation: 'landscape',
      pageMargins: [20, 25, 20, 25],
      defaultStyle: { font: 'Cairo', alignment: 'right', fontSize: 8.5 },
      footer: (currentPage: number, pageCount: number) => ({
        columns: [
          { text: 'نظام DawaCore ERP المحاسبي - تقرير الدائنين', alignment: 'right', fontSize: 8, color: '#94A3B8' },
          { text: `صفحة ${currentPage} من ${pageCount}`, alignment: 'center', fontSize: 8, color: '#94A3B8' },
          { text: `تاريخ التصدير: ${new Date().toLocaleDateString('ar-EG')}`, alignment: 'left', fontSize: 8, color: '#94A3B8' },
        ],
        margin: [20, 10, 20, 0],
      }),
      content,
      styles: {
        tableHeader: {
          bold: true,
          fontSize: 8,
          fillColor: '#582949',
          color: '#FFFFFF',
          alignment: 'center',
        },
        summaryHeader: {
          bold: true,
          fontSize: 7.5,
          fillColor: '#F1F5F9',
          color: '#334155',
        },
      },
    };
  }

  private buildPurchaseInvoiceDocDefinition(order: any): any {
    const isReceived = order.status === 'RECEIVED';
    const docTitle = isReceived ? 'فاتورة مشتريات (Purchase Invoice)' : `أمر شراء (Purchase Order) - ${order.status}`;
    const company = order.company || {};
    const branch = order.branch || {};
    const supplier = order.supplier || {};
    const items = order.items || [];
    const currency = company.currency || 'ج.س';

    return {
      pageSize: 'A4',
      pageOrientation: 'portrait',
      pageMargins: [25, 30, 25, 30],
      defaultStyle: { font: 'Cairo', alignment: 'right', fontSize: 9 },
      footer: (currentPage: number, pageCount: number) => ({
        columns: [
          { text: 'نظام DawaCore ERP - إدارة المشتريات والموردين', alignment: 'right', fontSize: 8, color: '#94A3B8' },
          { text: `صفحة ${currentPage} من ${pageCount}`, alignment: 'center', fontSize: 8, color: '#94A3B8' },
          { text: `تاريخ الإصدار: ${new Date().toLocaleDateString('ar-EG')}`, alignment: 'left', fontSize: 8, color: '#94A3B8' },
        ],
        margin: [25, 10, 25, 0],
      }),
      content: [
        // ترويسة
        {
          columns: [
            {
              width: '50%',
              text: [
                { text: `${company.name || 'مجموعة صيدليات داواكور'}\n`, fontSize: 13, bold: true, color: '#582949' },
                { text: `الفرع: ${branch.name || 'الفرع الرئيسي'}\n`, fontSize: 8.5, color: '#64748B' },
              ],
            },
            {
              width: '50%',
              alignment: 'left',
              text: [
                { text: `${docTitle}\n`, fontSize: 12, bold: true, color: isReceived ? '#009E9E' : '#D97706' },
                { text: `رقم المستند: ${order.orderNumber || '—'}\n`, fontSize: 9, bold: true },
                { text: `رقم فاتورة المورد: ${order.invoiceNumber || 'غير مسجل'}\n`, fontSize: 8.5, color: '#475569' },
                { text: `تاريخ الأمر: ${order.createdAt ? new Date(order.createdAt).toISOString().slice(0, 10) : '—'}\n`, fontSize: 8, color: '#64748B' },
                ...(isReceived && order.receivedAt
                  ? [{ text: `تاريخ الاستلام: ${new Date(order.receivedAt).toISOString().slice(0, 10)}\n`, fontSize: 8, color: '#16A34A', bold: true }]
                  : []),
              ],
            },
          ],
          margin: [0, 0, 0, 8],
        },
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 545, y2: 0, lineWidth: 1.5, lineColor: '#582949' }], margin: [0, 0, 0, 8] },

        // شريط الحالة
        {
          table: {
            widths: ['100%'],
            body: [
              [
                {
                  text: isReceived
                    ? 'فاتورة مشتريات معتمدة ومستلمة فعلياً في المستودع'
                    : `تنبيه: هذا مستند مسودة / أمر شراء (${order.status}) ولم يتم استلام البضاعة في المخزن بعد`,
                  alignment: 'center',
                  bold: true,
                  fontSize: 8.5,
                  color: isReceived ? '#166534' : '#92400E',
                  fillColor: isReceived ? '#DCFCE7' : '#FEF3C7',
                  margin: [0, 3, 0, 3],
                },
              ],
            ],
          },
          layout: 'noBorders',
          margin: [0, 0, 0, 10],
        },

        // بيانات المورد
        {
          table: {
            widths: ['50%', '50%'],
            body: [
              [
                {
                  text: [
                    { text: 'بيانات المورد:\n', bold: true, fontSize: 8.5, color: '#475569' },
                    { text: `${supplier.name || '—'} `, bold: true, fontSize: 9.5, color: '#0F172A' },
                    { text: `${supplier.companyName ? `(${supplier.companyName})` : ''}\n`, fontSize: 8.5 },
                    { text: `هاتف: ${supplier.phone || '—'}`, fontSize: 8, color: '#64748B' },
                  ],
                  fillColor: '#F8FAFC',
                },
                {
                  text: [
                    { text: 'الرقم الضريبي للمورد: ', bold: true, fontSize: 8.5, color: '#475569' },
                    { text: `${supplier.taxNumber || 'غير مسجل'}\n`, fontSize: 8.5 },
                    { text: 'العنوان: ', bold: true, fontSize: 8.5, color: '#475569' },
                    { text: `${supplier.address || '—'}\n`, fontSize: 8 },
                    { text: `منشئ المستند: ${order.creatorName || 'غير مسجل'}`, fontSize: 8, color: '#64748B' },
                  ],
                  fillColor: '#F8FAFC',
                },
              ],
            ],
          },
          layout: { hLineColor: () => '#E2E8F0', vLineColor: () => '#E2E8F0', hLineWidth: () => 0.8, vLineWidth: () => 0.8 },
          margin: [0, 0, 0, 10],
        },

        // جدول الأصناف
        {
          table: {
            headerRows: 1,
            widths: [20, '*', 45, 40, 50, 55, 60],
            body: [
              [
                { text: '#', style: 'tableHeader' },
                { text: 'الصنف الدوائي', style: 'tableHeader' },
                { text: 'الكمية', style: 'tableHeader' },
                { text: 'الوحدة', style: 'tableHeader' },
                { text: 'سعر الوحدة', style: 'tableHeader' },
                { text: 'الخصم / الضريبة', style: 'tableHeader' },
                { text: 'الإجمالي', style: 'tableHeader' },
              ],
              ...(items.length === 0
                ? [[{ text: 'لا توجد أصناف في هذا الأمر', colSpan: 7, alignment: 'center', margin: [0, 8, 0, 8] }, {}, {}, {}, {}, {}, {}]]
                : items.map((it: any, idx: number) => {
                    const isEven = idx % 2 === 0;
                    const bg = isEven ? '#FFFFFF' : '#F8FAFC';
                    return [
                      { text: String(idx + 1), alignment: 'center', fontSize: 8, fillColor: bg },
                      { text: it.medicine?.tradeName || it.medicineName || '—', bold: true, fontSize: 8.5, fillColor: bg },
                      { text: String(it.quantity), alignment: 'center', bold: true, fontSize: 8.5, color: '#009E9E', fillColor: bg },
                      { text: it.unitType || 'BOX', alignment: 'center', fontSize: 8, fillColor: bg },
                      { text: this.fmt(Number(it.costPrice || it.unitPrice || 0)), alignment: 'center', fontSize: 8.5, fillColor: bg },
                      { text: `${this.fmt(Number(it.taxAmount || 0))}`, alignment: 'center', fontSize: 8, color: '#64748B', fillColor: bg },
                      { text: this.fmt(Number(it.subtotal || it.total || 0)), alignment: 'center', bold: true, fontSize: 8.5, fillColor: bg },
                    ];
                  })),
            ],
          },
          layout: {
            hLineColor: () => '#CBD5E1',
            vLineColor: () => '#CBD5E1',
            hLineWidth: () => 0.6,
            vLineWidth: () => 0.6,
            paddingTop: () => 4,
            paddingBottom: () => 4,
          },
          margin: [0, 0, 0, 8],
        },

        // مجاميع الفاتورة
        {
          columns: [
            {
              width: '55%',
              text: [
                { text: 'ملاحظات المستند:\n', bold: true, fontSize: 8.5, color: '#475569' },
                { text: `${order.notes || 'لا توجد ملاحظات إضافية مسجلة.'}\n\n`, fontSize: 8, color: '#64748B' },
                { text: 'مصروفات الشحن والنقل: ', bold: true, fontSize: 8, color: '#475569' },
                {
                  text: Number(order.shippingCost || 0) > 0
                    ? `${this.fmt(Number(order.shippingCost))} ${currency} (مفصولة عن حساب المورد وفق المستندات)`
                    : 'لا توجد مصروفات شحن إضافية',
                  fontSize: 8,
                  color: '#334155',
                },
              ],
            },
            {
              width: '45%',
              table: {
                widths: ['50%', '50%'],
                body: [
                  [
                    { text: 'المجموع الفرعي:', fontSize: 8.5, bold: true, color: '#475569' },
                    { text: `${this.fmt(Number(order.subtotal || 0))} ${currency}`, alignment: 'left', fontSize: 8.5, bold: true },
                  ],
                  [
                    { text: 'الخصم التجاري:', fontSize: 8.5, color: '#475569' },
                    { text: `${this.fmt(Number(order.discount || 0))} ${currency}`, alignment: 'left', fontSize: 8.5 },
                  ],
                  [
                    { text: 'ضريبة القيمة المضافة:', fontSize: 8.5, color: '#475569' },
                    { text: `${this.fmt(Number(order.tax || 0))} ${currency}`, alignment: 'left', fontSize: 8.5 },
                  ],
                  [
                    { text: 'إجمالي الفاتورة (الالتزام):', fontSize: 9.5, bold: true, color: '#582949', fillColor: '#FDF2F8' },
                    { text: `${this.fmt(Number(order.totalAmount || 0))} ${currency}`, alignment: 'left', fontSize: 10, bold: true, color: '#582949', fillColor: '#FDF2F8' },
                  ],
                  [
                    { text: 'المدفوع الأصلي عند الشراء:', fontSize: 8.5, bold: true, color: '#16A34A', fillColor: '#F0FDF4' },
                    { text: `${this.fmt(Number(order.paidAmount || 0))} ${currency}`, alignment: 'left', fontSize: 8.5, bold: true, color: '#16A34A', fillColor: '#F0FDF4' },
                  ],
                  [
                    { text: 'المتبقي الآجل للمورد:', fontSize: 9, bold: true, color: '#DC2626', fillColor: '#FEF2F2' },
                    {
                      text: `${this.fmt(Number(order.totalAmount || 0) - Number(order.paidAmount || 0))} ${currency}`,
                      alignment: 'left',
                      fontSize: 9,
                      bold: true,
                      color: '#DC2626',
                      fillColor: '#FEF2F2',
                    },
                  ],
                ],
              },
              layout: { hLineColor: () => '#E2E8F0', vLineColor: () => '#E2E8F0', hLineWidth: () => 0.6, vLineWidth: () => 0.6 },
            },
          ],
          margin: [0, 0, 0, 15],
        },

        // التوقيعات
        {
          columns: [
            {
              width: '33.3%',
              text: [
                { text: 'أمين العهدة والمستودع:\n\n', bold: true, fontSize: 8.5, color: '#334155', alignment: 'center' },
                { text: `الاسم: ${order.receiverName || '..........................'}\n\n`, fontSize: 8, color: '#475569', alignment: 'center' },
                { text: 'التوقيع: ............................', fontSize: 8, color: '#94A3B8', alignment: 'center' },
              ],
            },
            {
              width: '33.3%',
              text: [
                { text: 'إدارة المشتريات:\n\n', bold: true, fontSize: 8.5, color: '#334155', alignment: 'center' },
                { text: `الاسم: ${order.creatorName || '..........................'}\n\n`, fontSize: 8, color: '#475569', alignment: 'center' },
                { text: 'التوقيع: ............................', fontSize: 8, color: '#94A3B8', alignment: 'center' },
              ],
            },
            {
              width: '33.4%',
              text: [
                { text: 'اعتماد الإدارة المالية:\n\n', bold: true, fontSize: 8.5, color: '#334155', alignment: 'center' },
                { text: 'الاسم: ..........................\n\n', fontSize: 8, color: '#475569', alignment: 'center' },
                { text: 'التوقيع: ............................', fontSize: 8, color: '#94A3B8', alignment: 'center' },
              ],
            },
          ],
        },
      ],
      styles: {
        tableHeader: { bold: true, fontSize: 8, fillColor: '#582949', color: '#FFFFFF', alignment: 'center' },
      },
    };
  }

  private buildReceivingNoteDocDefinition(order: any): any {
    const company = order.company || {};
    const branch = order.branch || {};
    const supplier = order.supplier || {};
    const items = order.items || [];

    return {
      pageSize: 'A4',
      pageOrientation: 'portrait',
      pageMargins: [25, 30, 25, 30],
      defaultStyle: { font: 'Cairo', alignment: 'right', fontSize: 9 },
      footer: (currentPage: number, pageCount: number) => ({
        columns: [
          { text: 'نظام DawaCore ERP - مستند استلام وتوريد مخزني رسمي', alignment: 'right', fontSize: 8, color: '#94A3B8' },
          { text: `صفحة ${currentPage} من ${pageCount}`, alignment: 'center', fontSize: 8, color: '#94A3B8' },
          { text: `تاريخ التصدير: ${new Date().toLocaleDateString('ar-EG')}`, alignment: 'left', fontSize: 8, color: '#94A3B8' },
        ],
        margin: [25, 10, 25, 0],
      }),
      content: [
        // ترويسة
        {
          columns: [
            {
              width: '50%',
              text: [
                { text: `${company.name || 'مجموعة صيدليات داواكور'}\n`, fontSize: 13, bold: true, color: '#582949' },
                { text: `مستودع فرع: ${branch.name || 'الفرع الرئيسي'}\n`, fontSize: 9, color: '#64748B' },
              ],
            },
            {
              width: '50%',
              alignment: 'left',
              text: [
                { text: 'مستند استلام وتوريد بضاعة (GRN)\n', fontSize: 12, bold: true, color: '#009E9E' },
                { text: `سند استلام تابع لأمر: ${order.orderNumber || '—'}\n`, fontSize: 9, bold: true },
                { text: `فاتورة المورد: ${order.invoiceNumber || 'غير مسجل'}\n`, fontSize: 8.5, color: '#475569' },
                { text: `تاريخ الاستلام الفعلي: ${order.receivedAt ? new Date(order.receivedAt).toISOString().slice(0, 10) : 'غير مسجل'}\n`, fontSize: 8.5, color: '#16A34A', bold: true },
              ],
            },
          ],
          margin: [0, 0, 0, 8],
        },
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 545, y2: 0, lineWidth: 1.5, lineColor: '#009E9E' }], margin: [0, 0, 0, 8] },

        // بطاقات معلومات المستند
        {
          table: {
            widths: ['50%', '50%'],
            body: [
              [
                {
                  text: [
                    { text: 'المورد المورّد للبضاعة:\n', bold: true, fontSize: 8.5, color: '#475569' },
                    { text: `${supplier.name || '—'} `, bold: true, fontSize: 9.5, color: '#0F172A' },
                    { text: `${supplier.companyName ? `(${supplier.companyName})` : ''}\n`, fontSize: 8.5 },
                    { text: `هاتف: ${supplier.phone || '—'}`, fontSize: 8, color: '#64748B' },
                  ],
                  fillColor: '#F8FAFC',
                },
                {
                  text: [
                    { text: 'بيانات التوثيق والاستلام:\n', bold: true, fontSize: 8.5, color: '#0F766E' },
                    { text: `أمين العهدة المستلم: ${order.receiverName || 'غير مسجل'}\n`, bold: true, fontSize: 9 },
                    { text: `حالة الفحص: لم يُسجل فحص فني مستقل (استلام مستندي فقط)\n`, fontSize: 8, color: '#64748B' },
                    { text: `المنشئ للأمر: ${order.creatorName || 'غير مسجل'}`, fontSize: 8, color: '#64748B' },
                  ],
                  fillColor: '#F0FDFA',
                },
              ],
            ],
          },
          layout: { hLineColor: () => '#CBD5E1', vLineColor: () => '#CBD5E1', hLineWidth: () => 0.8, vLineWidth: () => 0.8 },
          margin: [0, 0, 0, 10],
        },

        // جدول البنود المستلمة ومطابقتها
        {
          table: {
            headerRows: 1,
            widths: [20, '*', 55, 45, 60, 60, 60, 65],
            body: [
              [
                { text: '#', style: 'tableHeader' },
                { text: 'الصنف المستلم', style: 'tableHeader' },
                { text: 'الكمية المستلمة', style: 'tableHeader' },
                { text: 'الوحدة', style: 'tableHeader' },
                { text: 'رقم التشغيلة', style: 'tableHeader' },
                { text: 'تاريخ الصلاحية', style: 'tableHeader' },
                { text: 'تكلفة الوحدة', style: 'tableHeader' },
                { text: 'إجمالي التكلفة', style: 'tableHeader' },
              ],
              ...(items.length === 0
                ? [[{ text: 'لا توجد أصناف', colSpan: 8, alignment: 'center', margin: [0, 8, 0, 8] }, {}, {}, {}, {}, {}, {}, {}]]
                : items.map((it: any, idx: number) => {
                    const isEven = idx % 2 === 0;
                    const bg = isEven ? '#FFFFFF' : '#F8FAFC';
                    const expStr = it.expiryDate ? new Date(it.expiryDate).toISOString().slice(0, 7) : '—';
                    return [
                      { text: String(idx + 1), alignment: 'center', fontSize: 8, fillColor: bg },
                      { text: it.medicine?.tradeName || it.medicineName || '—', bold: true, fontSize: 8.5, fillColor: bg },
                      { text: String(it.quantity), alignment: 'center', bold: true, fontSize: 8.5, color: '#009E9E', fillColor: bg },
                      { text: it.unitType || 'BOX', alignment: 'center', fontSize: 8, fillColor: bg },
                      { text: it.batchNumber || '—', alignment: 'center', fontSize: 8, fillColor: bg },
                      { text: expStr, alignment: 'center', fontSize: 8, fillColor: bg },
                      { text: this.fmt(Number(it.costPrice || 0)), alignment: 'center', fontSize: 8.5, fillColor: bg },
                      { text: this.fmt(Number(it.subtotal || 0)), alignment: 'center', bold: true, fontSize: 8.5, fillColor: bg },
                    ];
                  })),
            ],
          },
          layout: {
            hLineColor: () => '#CBD5E1',
            vLineColor: () => '#CBD5E1',
            hLineWidth: () => 0.6,
            vLineWidth: () => 0.6,
            paddingTop: () => 4,
            paddingBottom: () => 4,
          },
          margin: [0, 0, 0, 10],
        },

        // توثيق واقعة الاستلام والتوريد
        {
          table: {
            widths: ['100%'],
            body: [
              [
                {
                  text: [
                    { text: 'توثيق واقعة الاستلام والتوريد:\n', bold: true, fontSize: 8.5, color: '#334155' },
                    {
                      text: 'يوثق هذا المستند واقعة استلام وتوريد الأصناف والكميات المذكورة أعلاه في مستودع الفرع وفق البيانات المسجلة بالنظام وقت إجراء عملية الاستلام.\n(مستند استلام تاريخي محفوظ للقراءة والطباعة دون أي تأثير مباشر على قيود المخزون الحالية).',
                      fontSize: 8,
                      color: '#475569',
                    },
                  ],
                  fillColor: '#F8FAFC',
                  margin: [6, 6, 6, 6],
                },
              ],
            ],
          },
          layout: { hLineColor: () => '#E2E8F0', vLineColor: () => '#E2E8F0', hLineWidth: () => 0.8, vLineWidth: () => 0.8 },
          margin: [0, 0, 0, 20],
        },

        // التوقيعات الثلاثية
        {
          columns: [
            {
              width: '33.3%',
              text: [
                { text: 'المستلم:\n\n', bold: true, fontSize: 8.5, color: '#334155', alignment: 'center' },
                { text: `الاسم: ${order.receiverName || '..........................'}\n\n`, fontSize: 8, color: '#475569', alignment: 'center' },
                { text: 'التوقيع: ............................', fontSize: 8, color: '#94A3B8', alignment: 'center' },
              ],
            },
            {
              width: '33.3%',
              text: [
                { text: 'مسؤول المستودع:\n\n', bold: true, fontSize: 8.5, color: '#334155', alignment: 'center' },
                { text: 'الاسم: ..........................\n\n', fontSize: 8, color: '#475569', alignment: 'center' },
                { text: 'التوقيع: ............................', fontSize: 8, color: '#94A3B8', alignment: 'center' },
              ],
            },
            {
              width: '33.4%',
              text: [
                { text: 'الاعتماد الإداري:\n\n', bold: true, fontSize: 8.5, color: '#334155', alignment: 'center' },
                { text: `الاسم: ${order.creatorName || '..........................'}\n\n`, fontSize: 8, color: '#475569', alignment: 'center' },
                { text: 'التوقيع: ............................', fontSize: 8, color: '#94A3B8', alignment: 'center' },
              ],
            },
          ],
        },
      ],
      styles: {
        tableHeader: { bold: true, fontSize: 8, fillColor: '#009E9E', color: '#FFFFFF', alignment: 'center' },
      },
    };
  }

  private buildSupplierPaymentDocDefinition(payment: any): any {
    const currency = payment.company?.currency || 'ج.س';
    const allocations = payment.allocations || [];
    return {
      pageSize: 'A4',
      pageMargins: [35, 40, 35, 35],
      defaultStyle: { font: 'Cairo', alignment: 'right', fontSize: 10 },
      content: [
        {
          columns: [
            {
              width: '55%',
              text: [
                { text: `${payment.company?.name || 'DawaCore'}\n`, bold: true, fontSize: 15, color: '#582949' },
                { text: `الفرع: ${payment.branch?.name || '—'}`, color: '#475569' },
              ],
            },
            {
              width: '45%',
              alignment: 'left',
              text: [
                { text: 'سند سداد مورد\n', bold: true, fontSize: 16, color: '#009E9E' },
                { text: payment.paymentNumber || '—', bold: true, color: '#334155' },
              ],
            },
          ],
          margin: [0, 0, 0, 12],
        },
        {
          table: {
            widths: ['25%', '25%', '25%', '25%'],
            body: [
              [
                { text: 'المورد', bold: true, fillColor: '#F1F5F9' },
                { text: payment.supplier?.name || '—' },
                { text: 'التاريخ', bold: true, fillColor: '#F1F5F9' },
                { text: payment.paymentDate ? new Date(payment.paymentDate).toLocaleDateString('ar-EG') : '—' },
              ],
              [
                { text: 'طريقة السداد', bold: true, fillColor: '#F1F5F9' },
                { text: payment.method === 'CASH' ? 'نقداً من الخزنة' : 'تحويل بنكي' },
                { text: 'المرجع', bold: true, fillColor: '#F1F5F9' },
                { text: payment.referenceNo || '—' },
              ],
              [
                { text: 'رقم القيد', bold: true, fillColor: '#F1F5F9' },
                { text: payment.journalEntryNumber || '—' },
                { text: 'المبلغ', bold: true, fillColor: '#F1F5F9' },
                { text: `${this.fmt(payment.amount)} ${currency}`, bold: true, color: '#582949' },
              ],
            ],
          },
          layout: { hLineColor: () => '#CBD5E1', vLineColor: () => '#CBD5E1' },
          margin: [0, 0, 0, 16],
        },
        { text: 'توزيع السداد على فواتير المورد', bold: true, fontSize: 12, color: '#334155', margin: [0, 0, 0, 6] },
        {
          table: {
            headerRows: 1,
            widths: [25, '*', '*', 82, 82, 90],
            body: [
              [
                { text: '#', bold: true, fillColor: '#009E9E', color: '#FFFFFF', alignment: 'center' },
                { text: 'رقم أمر الشراء', bold: true, fillColor: '#009E9E', color: '#FFFFFF' },
                { text: 'فاتورة المورد', bold: true, fillColor: '#009E9E', color: '#FFFFFF' },
                { text: 'إجمالي الفاتورة', bold: true, fillColor: '#009E9E', color: '#FFFFFF', alignment: 'center' },
                { text: 'دفعة هذا السند', bold: true, fillColor: '#009E9E', color: '#FFFFFF', alignment: 'center' },
                { text: 'المتبقي الآجل', bold: true, fillColor: '#009E9E', color: '#FFFFFF', alignment: 'center' },
              ],
              ...allocations.map((row: any, index: number) => [
                { text: String(index + 1), alignment: 'center' },
                { text: row.orderNumber || '—' },
                { text: row.invoiceNumber || '—' },
                { text: `${this.fmt(row.invoiceTotal)} ${currency}`, alignment: 'center' },
                { text: `${this.fmt(row.paidWithThisVoucher)} ${currency}`, alignment: 'center', color: '#16A34A' },
                { text: `${this.fmt(row.remainingAfterPayment)} ${currency}`, alignment: 'center', bold: true, color: '#DC2626' },
              ]),
            ],
          },
          layout: { hLineColor: () => '#CBD5E1', vLineColor: () => '#CBD5E1' },
          margin: [0, 0, 0, 16],
        },
        ...(payment.notes ? [{ text: `البيان: ${payment.notes}`, color: '#475569', margin: [0, 0, 0, 24] }] : []),
        {
          columns: [
            { text: 'توقيع المستلم\n\n........................', alignment: 'center' },
            { text: 'توقيع المحاسب\n\n........................', alignment: 'center' },
            { text: 'اعتماد المدير\n\n........................', alignment: 'center' },
          ],
        },
      ],
    };
  }

  private fmt(val: any): string {
    const num = Number(val || 0);
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private async renderPdf(docDefinition: any): Promise<Buffer> {
    if (!docDefinition.defaultStyle) {
      docDefinition.defaultStyle = {};
    }
    if (!docDefinition.defaultStyle.font) {
      docDefinition.defaultStyle.font = 'Cairo';
    }
    return pdfmake.createPdf(docDefinition).getBuffer();
  }
}
