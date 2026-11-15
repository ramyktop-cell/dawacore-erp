import { getActiveCompanyBrand } from '../utils/platform-brand';

declare global {
  interface Window {
    qz: any;
  }
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export interface ThermalReceiptItem {
  tradeName: string;
  unitLabel?: string;
  quantity: number;
  unitPrice: number;
  discountAmount?: number;
  totalPrice: number;
}

export interface ThermalReceiptPayload {
  companyName?: string;
  branchName: string;
  branchPhone?: string;
  branchAddress?: string;
  invoiceNumber: string;
  createdAt?: string | Date;
  cashierName?: string;
  customerName?: string;
  paymentMethod?: string;
  bankReference?: string;
  currencySymbol?: string;
  items: ThermalReceiptItem[];
  subTotal?: string | number;
  discountTotal?: string | number;
  grandTotal: string | number;
  paidAmount: string | number;
  changeAmount: string | number;
  remainingDebt?: string | number;
  customerBalance?: { previousDebt: string; creditAmount: string; debtAfter: string } | null;
  showCustomerBalance?: boolean;
  footerMessage?: string;
  paperWidth?: '80mm' | '58mm';
}

export type BarcodeLabelSize = '38x25' | '50x25' | '40x30';

export interface BarcodeLabelPayload {
  pharmacyName?: string;
  tradeName: string;
  scientificName?: string;
  barcode: string;
  price: number | string;
  currencySymbol?: string;
  unitLabel?: string;
  batchNumber?: string;
  expiryDate?: string;
  copies?: number;
  labelSize?: BarcodeLabelSize;
  showPrice?: boolean;
  showExpiry?: boolean;
  showPharmacyName?: boolean;
}

/**
 * مولد باركود قياسي Code-128B بصيغة SVG نقية (بدون أي مكتبات خارجية)
 * متوافق 100% مع جميع قارئات الباركود الليزرية والضوئية (1D/2D Scanners)
 */
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

export function generateCode128Svg(
  value: string,
  options?: { height?: number; barWidth?: number; showText?: boolean; fontSize?: number },
): string {
  const clean = (value || '00000000').replace(/[^\x20-\x7E]/g, '').trim() || '00000000';
  const height = options?.height ?? 38;
  const barWidth = options?.barWidth ?? 1.4;
  const showText = options?.showText ?? true;
  const fontSize = options?.fontSize ?? 10;

  // Start Code B = 104
  const codes: number[] = [104];
  let checksum = 104;

  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i) - 32;
    codes.push(code);
    checksum += code * (i + 1);
  }

  codes.push(checksum % 103);
  codes.push(106); // Stop pattern

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

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${totalHeight}" width="100%" height="${totalHeight}" style="max-width:${svgWidth}px;display:block;margin:0 auto;shape-rendering:crispEdges;">${rects}${textEl}</svg>`;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'نقدي (كاش)',
  CARD: 'تطبيق بنكك / بطاقة مصرفية',
  TRANSFER: 'تحويل بنكي',
  BANK_TRANSFER: 'تحويل بنكي',
  CREDIT: 'بيع آجل (ذمم)',
  MIXED: 'دفع مركب (نقدي + بنكك)',
};

export class ThermalPrinterService {
  /**
   * طباعة الفاتورة الحرارية مقاس 80mm أو 58mm وإرسال أمر فتح الدرج
   */
  static async printInvoice(saleData: ThermalReceiptPayload) {
    // 1. التحقق من اتصال QZ Tray المباشر إن وجد
    if (window.qz && window.qz.websocket && window.qz.websocket.isActive()) {
      try {
        const config = window.qz.configs.create('Receipt_Printer_80mm');
        const currency = saleData.currencySymbol || 'ج.س';

        const escPosData = [
          '\x1B\x40', // تهيئة الطابعة (Initialize)
          '\x1B\x61\x01', // محاذاة في المنتصف (Center)
          `${saleData.companyName || getActiveCompanyBrand().displayName || 'MadarCore'}\n`,
          `${saleData.branchName}\n`,
          `Invoice: ${saleData.invoiceNumber}\n`,
          '--------------------------------\n',
          '\x1B\x61\x00',
        ];

        saleData.items.forEach((item) => {
          escPosData.push(`${item.tradeName}\n`);
          escPosData.push(`  ${item.quantity} x ${item.unitPrice} = ${item.totalPrice}\n`);
        });

        if (saleData.showCustomerBalance) {
          const balance = saleData.customerBalance;
          escPosData.push(`Customer: ${saleData.customerName || ''}\n`);
          if (balance && [balance.previousDebt, balance.creditAmount, balance.debtAfter].every(value => value !== '' && Number.isFinite(Number(value)))) {
            escPosData.push(`Previous balance: ${balance.previousDebt} ${currency}\n`, `Invoice credit: ${balance.creditAmount} ${currency}\n`, `Balance after sale: ${balance.debtAfter} ${currency}\n`);
          } else escPosData.push('Historical balance unavailable\n');
        }
        escPosData.push(
          '--------------------------------\n',
          '\x1B\x61\x02',
          `Total: ${saleData.grandTotal} ${currency}\n`,
          `Paid: ${saleData.paidAmount} ${currency}\n`,
          `Change: ${saleData.changeAmount} ${currency}\n`,
          '\x1B\x61\x01',
          `${saleData.footerMessage || 'Thank You!'}\n\n\n`,
          '\x1D\x56\x41\x10', // أمر قطع الورق التلقائي (Cut Paper)
          '\x1B\x70\x00\x19\xFA', // نبضة كهربائية لفتح درج النقد (Kick Cash Drawer)
        );

        await window.qz.print(config, escPosData);
        return;
      } catch (error) {
        console.warn('فشل اتصال QZ Tray، سيتم التحويل للطباعة الحرارية القياسية:', error);
      }
    }

    // 2. طباعة حرارية فورية مضبوطة بـ @page 80mm بدون هوامش عبر إطار مخفي (Zero-Popup Print)
    ThermalPrinterService.printThermalHtml(saleData);
  }

  /**
   * توليد كود HTML كامل للفاتورة الحرارية 80mm / 58mm
   */
  static buildReceiptHtml(saleData: ThermalReceiptPayload): string {
    const paperWidth = saleData.paperWidth || '80mm';
    const contentWidth = paperWidth === '58mm' ? '52mm' : '72mm';
    const currency = saleData.currencySymbol || 'ج.س';
    const dateStr = saleData.createdAt
      ? new Date(saleData.createdAt).toLocaleString('ar-EG', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
      : new Date().toLocaleString('ar-EG', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });

    const grandTotalNum = Number(saleData.grandTotal || 0);
    const discountTotalNum = Number(saleData.discountTotal || 0);
    const subTotalNum =
      saleData.subTotal !== undefined
        ? Number(saleData.subTotal)
        : grandTotalNum + discountTotalNum;
    const paidAmountNum = Number(saleData.paidAmount || 0);
    const changeAmountNum = Number(saleData.changeAmount || 0);
    const remainingDebtNum = Number(saleData.remainingDebt || 0);
    const balance = saleData.customerBalance;
    const validBalance = balance && [balance.previousDebt, balance.creditAmount, balance.debtAfter].every(value => value !== '' && Number.isFinite(Number(value)));
    const balanceLine = (label: string, value: string) => `<div class="total-line"><span>${label}</span><span class="meta-val">${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}</span></div>`;

    const paymentLabel =
      PAYMENT_METHOD_LABELS[saleData.paymentMethod || ''] ||
      'غير محددة';

    const barcodeSvg = generateCode128Svg(saleData.invoiceNumber, {
      height: 30,
      barWidth: 1.2,
      showText: true,
      fontSize: 9,
    });

    const rowsHtml = saleData.items
      .map((item, idx) => {
        const uPrice = Number(item.unitPrice || 0);
        const tPrice = Number(item.totalPrice || item.quantity * uPrice);
        const disc = Number(item.discountAmount || 0);
        return `
          <tr class="item-row">
            <td class="col-name">
              <div class="med-title">${idx + 1}. ${escapeHtml(item.tradeName)}</div>
              ${
                item.unitLabel || disc > 0
                  ? `<div class="med-meta">${item.unitLabel ? `الوحدة: ${item.unitLabel}` : ''}${
                      disc > 0 ? ` | خصم: -${disc.toFixed(2)}` : ''
                    }</div>`
                  : ''
              }
            </td>
            <td class="col-qty">${item.quantity}</td>
            <td class="col-price">${uPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td class="col-total">${tPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
        `;
      })
      .join('');

    return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>فاتورة رقم ${saleData.invoiceNumber}</title>
  <style>
    @page {
      size: ${paperWidth} auto;
      margin: 0mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      width: ${contentWidth};
      max-width: ${contentWidth};
      margin: 0 auto;
      padding: 3mm 2mm 6mm 2mm;
      font-family: 'Cairo', 'Tahoma', 'Arial', sans-serif;
      font-size: 11px;
      line-height: 1.35;
      color: #000000;
      background: #ffffff;
    }
    .header {
      text-align: center;
      border-bottom: 1.5px dashed #000;
      padding-bottom: 6px;
      margin-bottom: 6px;
    }
    .brand-badge {
      display: inline-block;
      font-size: 15px;
      font-weight: 900;
      letter-spacing: 0.3px;
      margin-bottom: 2px;
    }
    .branch-name {
      font-size: 11px;
      font-weight: 700;
    }
    .branch-info {
      font-size: 9.5px;
      color: #222;
    }
    .invoice-type-pill {
      display: inline-block;
      margin-top: 4px;
      padding: 2px 8px;
      border: 1px solid #000;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 800;
    }
    .meta-grid {
      width: 100%;
      margin-bottom: 6px;
      padding-bottom: 6px;
      border-bottom: 1px dashed #000;
      font-size: 10px;
    }
    .meta-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 2px;
    }
    .meta-label {
      font-weight: 600;
    }
    .meta-val {
      font-weight: 800;
      font-family: 'Courier New', Tahoma, monospace;
    }
    table.items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 6px;
    }
    table.items-table thead th {
      border-top: 1px solid #000;
      border-bottom: 1.5px solid #000;
      padding: 3px 2px;
      font-size: 9.5px;
      font-weight: 800;
      text-align: right;
    }
    table.items-table thead th.col-qty,
    table.items-table thead th.col-price {
      text-align: center;
    }
    table.items-table thead th.col-total {
      text-align: left;
    }
    .item-row td {
      padding: 3.5px 2px;
      border-bottom: 0.5px dotted #555;
      vertical-align: top;
      font-size: 10px;
    }
    .med-title {
      font-weight: 700;
      word-break: break-word;
    }
    .med-meta {
      font-size: 8.5px;
      color: #333;
    }
    .col-qty {
      text-align: center;
      font-family: monospace;
      font-weight: 700;
      width: 12%;
    }
    .col-price {
      text-align: center;
      font-family: monospace;
      width: 22%;
    }
    .col-total {
      text-align: left;
      font-family: monospace;
      font-weight: 800;
      width: 24%;
    }
    .totals-box {
      border-top: 1.5px dashed #000;
      padding-top: 5px;
      margin-bottom: 6px;
    }
    .total-line {
      display: flex;
      justify-content: space-between;
      font-size: 10.5px;
      margin-bottom: 2px;
    }
    .grand-total-line {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-top: 1.5px solid #000;
      border-bottom: 1.5px solid #000;
      padding: 4px 2px;
      margin: 4px 0;
      font-size: 13px;
      font-weight: 900;
    }
    .barcode-section {
      text-align: center;
      margin: 6px 0 4px 0;
      padding-top: 4px;
    }
    .footer {
      text-align: center;
      border-top: 1px dashed #000;
      padding-top: 5px;
      font-size: 9px;
      line-height: 1.4;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand-badge">${escapeHtml(saleData.companyName || getActiveCompanyBrand().displayNameAr || saleData.branchName || 'MadarCore')}</div>
  </div>

  <div class="meta-grid">
    <div class="meta-row">
      <span class="meta-label">رقم الفاتورة:</span>
      <span class="meta-val">${saleData.invoiceNumber}</span>
    </div>
    <div class="meta-row">
      <span class="meta-label">التاريخ والوقت:</span>
      <span class="meta-val">${dateStr}</span>
    </div>
    <div class="meta-row">
      <span class="meta-label">العميل:</span>
      <span><strong>${escapeHtml(saleData.customerName || (saleData.showCustomerBalance || saleData.paymentMethod === 'CREDIT' ? 'اسم العميل غير متاح' : 'عميل نقدي مباشر'))}</strong></span>
    </div>
    ${
      saleData.cashierName
        ? `<div class="meta-row"><span class="meta-label">الكاشير:</span><span>${escapeHtml(saleData.cashierName)}</span></div>`
        : ''
    }
    <div class="meta-row">
      <span class="meta-label">طريقة السداد:</span>
      <span><strong>${paymentLabel}</strong></span>
    </div>
    ${
      saleData.bankReference
        ? `<div class="meta-row"><span class="meta-label">مرجع العملية:</span><span class="meta-val">${saleData.bankReference}</span></div>`
        : ''
    }
  </div>

  <table class="items-table">
    <thead>
      <tr>
        <th>الصنف</th>
        <th class="col-qty">ك</th>
        <th class="col-price">السعر</th>
        <th class="col-total">الإجمالي</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div class="totals-box">
    <div class="total-line">
      <span>عدد الأصناف (${saleData.items.length}) | المجموع الفرعي:</span>
      <span class="meta-val">${subTotalNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}</span>
    </div>
    ${
      discountTotalNum > 0
        ? `<div class="total-line">
            <span>إجمالي الخصم الممنوح:</span>
            <span class="meta-val">-${discountTotalNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}</span>
          </div>`
        : ''
    }
    <div class="grand-total-line">
      <span>الصافي المطلوب:</span>
      <span class="meta-val">${grandTotalNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}</span>
    </div>
    <div class="total-line">
      <span>المبلغ المقبوض:</span>
      <span class="meta-val">${paidAmountNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}</span>
    </div>
    ${
      changeAmountNum > 0
        ? `<div class="total-line">
            <span>الباقي للعميل:</span>
            <span class="meta-val">${changeAmountNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}</span>
          </div>`
        : ''
    }
    ${
      remainingDebtNum > 0
        ? `<div class="total-line">
            <span><strong>متبقي هذه الفاتورة:</strong></span>
            <span class="meta-val"><strong>${remainingDebtNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}</strong></span>
          </div>`
        : ''
    }
  </div>

  ${saleData.showCustomerBalance ? `<div class="totals"><strong>رصيد العميل وقت الفاتورة</strong>${validBalance ? balanceLine('الرصيد السابق:', balance!.previousDebt) + balanceLine('الآجل المضاف بهذه الفاتورة:', balance!.creditAmount) + balanceLine('إجمالي الرصيد بعد البيع:', balance!.debtAfter) : '<div>الرصيد وقت المستند غير متاح</div>'}</div>` : ''}
  <div class="barcode-section">
    ${barcodeSvg}
  </div>

  <div class="footer">
    <div><strong>${saleData.footerMessage || 'شكراً لزيارتكم • نتمنى لكم دوام الصحة والعافية'}</strong></div>
    <div>يرجى الاحتفاظ بالإيصال في حال الاستبدال أو الاسترجاع خلال 3 أيام</div>
    <div style="margin-top:2px;font-size:8px;">Powered by MadarCore ERP</div>
  </div>
</body>
</html>`;
  }

  /**
   * طباعة HTML داخل Iframe مخفي لمنع حظر النوافذ المنبثقة (Pop-up Blockers) في المتصفح
   */
  static buildCustomerPaymentHtml(voucher: { customerName: string; receiptNumber: string; previousDebt: string | number; amount: string | number; remainingDebt: string | number; companyName?: string; createdAt?: string; paymentMethod?: string; referenceNo?: string }): string {
    const money = (value: string | number) => value !== '' && Number.isFinite(Number(value)) ? Number(value).toFixed(2) : 'غير متاح';
    const methods: Record<string, string> = { CASH: 'نقداً', CARD: 'بطاقة بنكية', TRANSFER: 'تحويل بنكي', CHECK: 'شيك' };
    return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>@page{size:80mm auto;margin:3mm}body{font-family:Tahoma,Arial;font-size:12px;width:72mm}h2{text-align:center;font-size:15px}p{overflow-wrap:anywhere}strong{display:block}</style></head><body><h2>${escapeHtml(voucher.companyName || getActiveCompanyBrand().displayNameAr || 'MadarCore')}</h2><h2>سند قبض</h2><p>رقم السند: ${escapeHtml(voucher.receiptNumber)}</p><p>التاريخ: ${escapeHtml(voucher.createdAt ? new Date(voucher.createdAt).toLocaleString('ar-EG') : '')}</p><p>العميل: ${escapeHtml(voucher.customerName)}</p><p>الرصيد السابق: ${money(voucher.previousDebt)} ج.س</p><p>المبلغ المقبوض: ${money(voucher.amount)} ج.س</p><strong>الرصيد بعد السداد: ${money(voucher.remainingDebt)} ج.س</strong><p>طريقة الدفع: ${escapeHtml(methods[voucher.paymentMethod || ''] || voucher.paymentMethod || '')}</p><p>المرجع: ${escapeHtml(voucher.referenceNo || '—')}</p></body></html>`;
  }

  static printHtmlDocument(htmlContent: string) {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      return;
    }

    doc.open();
    doc.write(htmlContent);
    doc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } finally {
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        }, 1500);
      }
    }, 250);
  }

  static printThermalHtml(saleData: ThermalReceiptPayload) {
    const html = ThermalPrinterService.buildReceiptHtml(saleData);
    ThermalPrinterService.printHtmlDocument(html);
  }

  /**
   * توليد وطباعة ملصقات الباركود الحرارية للأدوية والدفعات (Zebra / Xprinter / TSC)
   * يدعم المقاسات القياسية للصيدليات: 38x25mm، 50x25mm، 40x30mm
   */
  static buildBarcodeLabelsHtml(payload: BarcodeLabelPayload): string {
    const size = payload.labelSize || '38x25';
    const copies = Math.max(1, Math.min(200, Number(payload.copies || 1)));
    const currency = payload.currencySymbol || 'ج.س';
    const showPrice = payload.showPrice ?? true;
    const showExpiry = payload.showExpiry ?? true;
    const showPharmacyName = payload.showPharmacyName ?? true;

    const dimensions: Record<BarcodeLabelSize, { w: string; h: string; barH: number; font: string }> = {
      '38x25': { w: '38mm', h: '25mm', barH: 22, font: '7.5px' },
      '50x25': { w: '50mm', h: '25mm', barH: 24, font: '8.5px' },
      '40x30': { w: '40mm', h: '30mm', barH: 28, font: '8px' },
    };

    const dim = dimensions[size];
    const barcodeSvg = generateCode128Svg(payload.barcode || '00000000', {
      height: dim.barH,
      barWidth: size === '50x25' ? 1.25 : 1.05,
      showText: true,
      fontSize: 8,
    });

    const formattedPrice = Number(payload.price || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    const singleLabelHtml = `
      <div class="label-sheet">
        ${
          showPharmacyName
            ? `<div class="pharmacy-header">${escapeHtml(payload.pharmacyName || getActiveCompanyBrand().displayNameAr || 'MadarCore')}</div>`
            : ''
        }
        <div class="med-name">${payload.tradeName}</div>
        <div class="barcode-wrap">${barcodeSvg}</div>
        <div class="label-footer">
          ${
            showPrice
              ? `<span class="price-tag">${formattedPrice} ${currency}${
                  payload.unitLabel ? ` / ${payload.unitLabel}` : ''
                }</span>`
              : '<span></span>'
          }
          ${
            showExpiry && (payload.expiryDate || payload.batchNumber)
              ? `<span class="exp-tag">${payload.expiryDate ? `EXP:${payload.expiryDate}` : ''}${
                  payload.batchNumber ? ` B:${payload.batchNumber}` : ''
                }</span>`
              : ''
          }
        </div>
      </div>
    `;

    const allLabels = Array.from({ length: copies })
      .map(() => singleLabelHtml)
      .join('');

    return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>ملصقات باركود - ${payload.tradeName}</title>
  <style>
    @page {
      size: ${dim.w} ${dim.h};
      margin: 0mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: 'Cairo', 'Tahoma', 'Arial', sans-serif;
      background: #fff;
      color: #000;
    }
    .label-sheet {
      width: ${dim.w};
      height: ${dim.h};
      padding: 1.2mm 1.8mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      align-items: center;
      text-align: center;
      page-break-after: always;
      break-after: page;
      overflow: hidden;
    }
    .label-sheet:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .pharmacy-header {
      font-size: 7px;
      font-weight: 800;
      border-bottom: 0.4px solid #000;
      width: 100%;
      padding-bottom: 0.5px;
      line-height: 1.1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .med-name {
      font-size: ${dim.font};
      font-weight: 900;
      line-height: 1.15;
      max-width: 100%;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin: 0.5mm 0;
    }
    .barcode-wrap {
      width: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      overflow: hidden;
    }
    .label-footer {
      width: 100%;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 7px;
      font-weight: 800;
      border-top: 0.4px dashed #000;
      padding-top: 0.5px;
      font-family: 'Courier New', Tahoma, monospace;
    }
    .price-tag {
      font-weight: 900;
    }
    .exp-tag {
      font-size: 6.5px;
      direction: ltr;
    }
  </style>
</head>
<body>
  ${allLabels}
</body>
</html>`;
  }

  static printBarcodeLabels(payload: BarcodeLabelPayload) {
    const html = ThermalPrinterService.buildBarcodeLabelsHtml(payload);
    ThermalPrinterService.printHtmlDocument(html);
  }
  /**
   * 📊 طباعة تقرير إغلاق الوردية الحراري (Z-Report) 80mm
   */
  static printShiftReport(report: ShiftReportPayload) {
    const html = ThermalPrinterService.buildShiftReportHtml(report);
    ThermalPrinterService.printHtmlDocument(html);
  }

  static buildShiftReportHtml(report: ShiftReportPayload): string {
    const companyName = escapeHtml(report.companyName || getActiveCompanyBrand().displayNameAr || 'MadarCore');
    const branchName = escapeHtml(report.branchName || 'الفرع الرئيسي');
    const cashierName = escapeHtml(report.cashierName || 'الكاشير');
    const approvedBy = escapeHtml(report.approvedBy || '');
    const notes = escapeHtml(report.notes || '');
    const openedStr = new Date(report.openedAt).toLocaleString('ar-SD', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    const closedStr = report.closedAt
      ? new Date(report.closedAt).toLocaleString('ar-SD', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
      : 'قيد التشغيل';

    const diff = Number(report.cashDifference || 0);
    let diffLabel = 'مطابق تماماً (متوازن) ✅';
    let diffColor = '#000';
    if (diff < -0.01) {
      diffLabel = `عجز نقدي: ${Math.abs(diff).toLocaleString()} ج.س ❌`;
      diffColor = '#000';
    } else if (diff > 0.01) {
      diffLabel = `فائض نقدي: +${diff.toLocaleString()} ج.س ⚠️`;
      diffColor = '#000';
    }

    return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <style>
    @page {
      size: 80mm auto;
      margin: 0;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
    }
    body {
      font-family: 'Courier New', Courier, monospace, Tahoma, sans-serif;
      font-size: 13px;
      line-height: 1.3;
      color: #000;
      background: #fff;
      width: 80mm;
      max-width: 80mm;
      padding: 4mm 5mm;
      margin: 0 auto;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .text-left { text-align: left; }
    .font-bold { font-weight: 900; }
    .font-mono { font-family: 'Courier New', monospace; }
    .divider-bold {
      border-top: 2px solid #000;
      margin: 6px 0;
    }
    .divider-dashed {
      border-top: 1px dashed #000;
      margin: 5px 0;
    }
    .header-title {
      font-size: 17px;
      font-weight: 900;
      margin-bottom: 2px;
    }
    .sub-title {
      font-size: 12px;
      font-weight: 800;
      background: #000;
      color: #fff;
      padding: 3px 6px;
      border-radius: 4px;
      display: inline-block;
      margin: 4px 0;
    }
    .meta-row {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      margin: 2px 0;
    }
    .summary-table {
      width: 100%;
      border-collapse: collapse;
      margin: 6px 0;
    }
    .summary-table td {
      padding: 3px 0;
      font-size: 12px;
    }
    .summary-table td.amount {
      text-align: left;
      font-family: 'Courier New', monospace;
      font-weight: 900;
      font-size: 13px;
    }
    .box-reconcile {
      border: 2px solid #000;
      border-radius: 6px;
      padding: 6px;
      margin: 8px 0;
      background: #fafafa;
    }
    .signatures {
      display: flex;
      justify-content: space-between;
      margin-top: 20px;
      padding-top: 10px;
      font-size: 11px;
      font-weight: 800;
    }
    .sig-block {
      width: 45%;
      text-align: center;
      border-top: 1px dashed #000;
      padding-top: 4px;
    }
  </style>
</head>
<body>
  <div class="text-center">
    <div class="header-title">${companyName}</div>
    <div style="font-size: 12px; font-weight: 700;">${branchName}</div>
    <div class="sub-title">تقرير إغلاق الوردية (Z-REPORT)</div>
  </div>

  <div class="divider-bold"></div>

  <div class="meta-row">
    <span><strong>رقم الوردية:</strong> #${report.shiftNumber}</span>
    <span><strong>الكاشير:</strong> ${cashierName}</span>
  </div>
  <div class="meta-row">
    <span><strong>وقت الفتح:</strong> ${openedStr}</span>
  </div>
  <div class="meta-row">
    <span><strong>وقت الإغلاق:</strong> ${closedStr}</span>
  </div>
  ${report.approvedBy ? `<div class="meta-row"><span><strong>المشرف المعتمد:</strong> ${approvedBy}</span></div>` : ''}

  <div class="divider-bold"></div>

  <table class="summary-table">
    <tr>
      <td>العهدة النقدية الافتتاحية:</td>
      <td class="amount">${Number(report.openingBalance || 0).toLocaleString()} ج.س</td>
    </tr>
    <tr>
      <td>+ مبيعات الصندوق النقدية (Cash):</td>
      <td class="amount">${Number(report.totalSalesCash || 0).toLocaleString()} ج.س</td>
    </tr>
    <tr>
      <td>+ إيداعات نقدية بالدرج (Cash In):</td>
      <td class="amount">${Number(report.totalCashIn || 0).toLocaleString()} ج.س</td>
    </tr>
    <tr>
      <td>− مصروفات ومسحوبات (Cash Out):</td>
      <td class="amount">−${Number(report.totalCashOut || 0).toLocaleString()} ج.س</td>
    </tr>
    <tr style="border-top: 1px solid #000; font-weight: 900;">
      <td>المبيعات الإلكترونية (بنكك/بطاقة):</td>
      <td class="amount">${Number(report.totalSalesBank || 0).toLocaleString()} ج.س</td>
    </tr>
    <tr>
      <td>المبيعات الآجلة (ذمم عملاء):</td>
      <td class="amount">${Number(report.totalSalesCredit || 0).toLocaleString()} ج.س</td>
    </tr>
    <tr style="border-top: 1px solid #000; font-weight: 900;">
      <td>إجمالي مبيعات الوردية العام:</td>
      <td class="amount" style="font-size: 14px;">${Number(report.totalSales || 0).toLocaleString()} ج.س</td>
    </tr>
    ${report.invoicesCount !== undefined ? `<tr><td>عدد الفواتير المنفذة:</td><td class="amount">${report.invoicesCount} فاتورة</td></tr>` : ''}
  </table>

  <div class="box-reconcile">
    <div class="meta-row" style="font-size: 13px;">
      <span><strong>النقد المتوقع بالدرج:</strong></span>
      <span class="font-mono font-bold">${Number(report.expectedCash || 0).toLocaleString()} ج.س</span>
    </div>
    <div class="meta-row" style="font-size: 13px; margin-top: 4px;">
      <span><strong>النقد الفعلي المعدود:</strong></span>
      <span class="font-mono font-bold" style="font-size: 15px;">${Number(report.actualCash || 0).toLocaleString()} ج.س</span>
    </div>
    <div class="divider-dashed"></div>
    <div class="meta-row" style="font-size: 13px; font-weight: 900;">
      <span>نتيجة المطابقة:</span>
      <span style="color: ${diffColor};">${diffLabel}</span>
    </div>
  </div>

  ${report.notes ? `<div style="font-size: 11px; margin: 4px 0;"><strong>ملاحظات:</strong> ${notes}</div>` : ''}

  <div class="signatures">
    <div class="sig-block">
      توقيع الكاشير المسلم
    </div>
    <div class="sig-block">
      توقيع المشرف / الإدارة
    </div>
  </div>

  <div class="divider-dashed" style="margin-top: 15px;"></div>
  <div class="text-center" style="font-size: 10px; color: #444; margin-top: 4px;">
    منصة MadarCore ERP • تم إصدار التقرير آلياً
  </div>
</body>
</html>`;
  }
}

export interface ShiftReportPayload {
  companyName?: string;
  branchName: string;
  shiftNumber: number;
  cashierName: string;
  openedAt: string | Date;
  closedAt?: string | Date;
  approvedBy?: string;
  openingBalance: number;
  totalSalesCash: number;
  totalSalesBank: number;
  totalSalesCredit: number;
  totalSales: number;
  totalCashIn?: number;
  totalCashOut?: number;
  expectedCash: number;
  actualCash: number;
  cashDifference: number;
  invoicesCount?: number;
  notes?: string;
}
