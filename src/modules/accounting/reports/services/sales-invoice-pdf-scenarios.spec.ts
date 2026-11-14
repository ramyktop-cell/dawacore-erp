jest.mock('@nestjs/common', () => ({
  Injectable: () => (target: any) => target,
  Logger: class {
    log() {}
    warn() {}
    error() {}
  },
}));

import { PdfExportService } from './pdf-export.service';

describe('Sales Invoice PDF Real Generation Scenarios', () => {
  let service: PdfExportService;

  beforeEach(() => {
    service = new PdfExportService();
  });

  // =========================================================================
  // السيناريو 1: الحالة النقدية (Cash Sale)
  // =========================================================================
  it('1. يجب توليد PDF حقيقي وسليم لفاتورة مبيعات نقدية مع اسم الكاشير وترويسة الشركة والباركود', async () => {
    const cashInvoice = {
      id: 'inv-cash-001',
      invoiceNumber: 'INV-20261113-00001',
      createdAt: new Date('2026-11-13T10:30:00Z'),
      totalAmount: 150000,
      discountAmount: 0,
      netAmount: 150000,
      paidAmount: 150000,
      remainingAmount: 0,
      paymentMethod: 'CASH',
      customerId: 'cust-1',
      balanceSummary: { before: '20000.00', afterInvoice: '170000.00', afterPayment: '20000.00' },
      branch: {
        name: 'الفرع الرئيسي',
        phone: '0912345678',
        address: 'الخرطوم - شارع الستين',
        company: {
          name: 'شركة دواء كور للأدوية والمستلزمات',
          phone: '0900000000',
          address: 'الخرطوم - السودان',
          email: 'info@dawacore.com',
        },
      },
      user: {
        name: 'أحمد الكاشير',
        username: 'ahmed_cashier',
      },
      customer: {
        name: 'محمد عبد الله',
        phone: '0999887766',
        address: 'الخرطوم - الرياض',
      },
      items: [
        {
          medicine: { tradeName: 'بنادول إكسترا' },
          quantity: 3,
          unitLabel: 'شريط',
          unitPrice: 50000,
          discountAmount: 0,
          subtotal: 150000,
        },
      ],
    };

    const pdfBuffer = await service.generateSalesInvoicePdf(cashInvoice);

    expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
    expect(pdfBuffer.length).toBeGreaterThan(5000);
    expect(pdfBuffer.subarray(0, 4).toString()).toBe('%PDF');
  });

  // =========================================================================
  // السيناريو 2: الحالة الآجلة مع أرصدة العميل (Credit Sale)
  // =========================================================================
  it('2. يجب توليد PDF حقيقي لفاتورة مبيعات آجلة مع حركة رصيد العميل السابقة واللاحقة', async () => {
    const creditInvoice = {
      id: 'inv-credit-002',
      invoiceNumber: 'INV-20261113-00002',
      createdAt: new Date('2026-11-13T11:00:00Z'),
      totalAmount: 9900000,
      discountAmount: 0,
      netAmount: 9900000,
      paidAmount: 0,
      remainingAmount: 9900000,
      paymentMethod: 'CREDIT',
      customerBalance: {
        previousDebt: '5000000.00',
        creditAmount: '9900000.00',
        debtAfter: '14900000.00',
      },
      branch: {
        name: 'فرع بحري',
        company: {
          name: 'شركة النخبة التجارية',
          phone: '0900000000',
          address: 'بحري - المنطقة الصناعية',
        },
      },
      user: {
        name: 'عثمان محاسب المبيعات',
      },
      customer: {
        name: 'منظمة كبري الخيرية',
        phone: '0912345678',
        address: 'بحري - كبري',
      },
      items: [
        {
          medicine: { tradeName: 'عدس كرتونة' },
          quantity: 66,
          unitLabel: 'كرتونة',
          unitPrice: 12500,
          discountAmount: 0,
          subtotal: 825000,
        },
        {
          medicine: { tradeName: 'دقيق 01 كيلو' },
          quantity: 33,
          unitLabel: 'كيس',
          unitPrice: 90000,
          discountAmount: 0,
          subtotal: 2970000,
        },
      ],
    };

    const pdfBuffer = await service.generateSalesInvoicePdf(creditInvoice);

    expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
    expect(pdfBuffer.length).toBeGreaterThan(5000);
    expect(pdfBuffer.subarray(0, 4).toString()).toBe('%PDF');
  });

  // =========================================================================
  // السيناريو 3: الحالة المختلطة (Mixed Payment Sale)
  // =========================================================================
  it('3. يجب توليد PDF حقيقي لفاتورة دفع مركب/مختلط (نقدي + بنكك/آجل)', async () => {
    const mixedInvoice = {
      id: 'inv-mixed-003',
      invoiceNumber: 'INV-20261113-00003',
      createdAt: new Date('2026-11-13T12:15:00Z'),
      totalAmount: 1000000,
      discountAmount: 50000,
      netAmount: 950000,
      paidAmount: 600000,
      remainingAmount: 350000,
      paymentMethod: 'MIXED',
      customerId: 'cust-3',
      balanceSummary: { before: '0.00', afterInvoice: '950000.00', afterPayment: '350000.00' },
      branch: {
        name: 'الفرع الرئيسي',
        company: {
          name: 'مجموعة الصيدليات المتحدة',
        },
      },
      user: {
        name: 'سارة المشرفة',
      },
      customer: {
        name: 'شركة الأمل المحدودة',
        phone: '0123000111',
        address: 'أم درمان',
      },
      items: [
        {
          medicine: { tradeName: 'محلول معقم 5 لتر' },
          quantity: 10,
          unitLabel: 'جالون',
          unitPrice: 100000,
          discountAmount: 50000,
          subtotal: 950000,
        },
      ],
    };

    const pdfBuffer = await service.generateSalesInvoicePdf(mixedInvoice);

    expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
    expect(pdfBuffer.length).toBeGreaterThan(5000);
    expect(pdfBuffer.subarray(0, 4).toString()).toBe('%PDF');
  });

  // =========================================================================
  // السيناريو 4: متعددة الوحدات والأصناف الموزونة والخصومات
  // =========================================================================
  it('4. يجب توليد PDF حقيقي للأصناف متعددة الوحدات (كرتونة/كيس/حبة) والأصناف الموزونة بالكسور (كيلو) مع الخصومات', async () => {
    const multiUnitInvoice = {
      id: 'inv-multi-004',
      invoiceNumber: 'INV-20261113-00004',
      createdAt: new Date('2026-11-13T14:45:00Z'),
      totalAmount: 685000,
      discountAmount: 5000,
      netAmount: 680000,
      paidAmount: 680000,
      remainingAmount: 0,
      paymentMethod: 'CASH',
      branch: {
        name: 'فرع أم درمان',
        company: {
          name: 'شركة النخبة التجارية',
          address: 'الخرطوم - السودان',
          phone: '0900000000',
        },
      },
      user: {
        name: 'خالد الكاشير',
      },
      customer: {
        name: 'متجر البركة التجاري',
        phone: '0912000000',
        address: 'سوق أم درمان',
      },
      items: [
        // صنف بالكرتونة مع خصم سطري
        {
          medicine: {
            tradeName: 'معجون أسنان سنسوداين',
            isWeighed: false,
            units: [{ unitType: 'BOX', label: 'كرتونة' }, { unitType: 'UNIT', label: 'حبة' }],
          },
          unitType: 'BOX',
          unitLabel: 'كرتونة',
          quantity: 2,
          unitPrice: 200000,
          discountAmount: 5000,
          subtotal: 395000,
        },
        // صنف بالكيس
        {
          medicine: {
            tradeName: 'شاش قطني معقم',
            isWeighed: false,
            units: [{ unitType: 'UNIT', label: 'كيس' }],
          },
          unitType: 'UNIT',
          unitLabel: 'كيس',
          quantity: 20,
          unitPrice: 10000,
          discountAmount: 0,
          subtotal: 200000,
        },
        // صنف موزون بكمية عشرية (كيلو)
        {
          medicine: {
            tradeName: 'سكر موزون أبيض',
            isWeighed: true,
            units: [{ unitType: 'UNIT', label: 'كيلو' }],
          },
          unitType: 'UNIT',
          quantity: 0.75, // ثلاثة أرباع الكيلو
          unitPrice: 100000,
          discountAmount: 0,
          subtotal: 75000,
        },
        // صنف بالحبة
        {
          medicine: {
            tradeName: 'مرهم جروح موضعي',
            isWeighed: false,
          },
          quantity: 1,
          unitLabel: 'حبة',
          unitPrice: 10000,
          discountAmount: 0,
          subtotal: 10000,
        },
      ],
    };

    const pdfBuffer = await service.generateSalesInvoicePdf(multiUnitInvoice);

    expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
    expect(pdfBuffer.length).toBeGreaterThan(5000);
    expect(pdfBuffer.subarray(0, 4).toString()).toBe('%PDF');
  });

  // =========================================================================
  // السيناريو 5: عميل نقدي بدون حساب (لا يظهر قسم حركة الحساب)
  // =========================================================================
  it('5. يجب توليد PDF لعميل نقدي مباشر بدون حساب وبدون خصم', async () => {
    const pdfBuffer = await service.generateSalesInvoicePdf({
      invoiceNumber: 'INV-20261113-00005',
      createdAt: new Date('2026-11-13T16:00:00Z'),
      totalAmount: 1000,
      discountAmount: 0,
      netAmount: 1000,
      paidAmount: 1500,
      remainingAmount: 0,
      paymentMethod: 'CASH',
      branch: { name: 'الفرع الرئيسي' },
      user: { name: 'كاشير' },
      items: [{ medicine: { tradeName: 'صنف نقدي' }, quantity: 1, unitPrice: 1000, subtotal: 1000 }],
    });

    expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
    expect(pdfBuffer.subarray(0, 4).toString()).toBe('%PDF');
  });
});
