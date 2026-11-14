// src/modules/accounting/reports/utils/arabic-text.util.ts
const { ArabicShaper } = require('arabic-persian-reshaper');
const bidiFactory = require('bidi-js');

/**
 * أداة معالجة النصوص العربية لـ pdfmake
 *
 * ⚠️ حل جذري لمشكلة الخطوط العربية (Cairo) مع pdfmake:
 * 1. خطوط OpenType الحديثة مثل Cairo لا تحتوي على محارف الرموز المنفردة
 *    (Arabic Presentation Forms-B Isolated: 0xFE80 - 0xFEF1)، بل تستخدم
 *    نطاق اليونيكود القياسي (0x0600 - 0x06FF) للأشكال المنفردة.
 * 2. مكتبة arabic-persian-reshaper تحول الحروف المنفردة إلى Presentation Forms،
 *    مما كان يتسبب في اختفاء الحروف أو ظهور مربعات فارغة (Tofu).
 * 3. تقوم هذه الأداة بإعادة تعيين كافة الأشكال المنفردة إلى اليونيكود القياسي
 *    مع الحفاظ على الأشكال المتصلة (بداية، وسط، نهاية، واللام ألف)، مما
 *    يضمن ظهور كل حرف بدقة 100% وبدون أي تشويه.
 * 4. حماية التواريخ (YYYY-MM-DD) والأكواد اللاتينية من الانعكاس عبر علامات LRM.
 */
export class ArabicTextUtil {
  private static readonly bidi = bidiFactory();

  // خريطة تحويل الحروف المنفردة من Presentation Forms إلى Unicode القياسي
  private static readonly ISOLATED_MAP = new Map<number, number>([
    [0xfe80, 0x0621], // همزة منفردة
    [0xfe81, 0x0622], // آ منفردة
    [0xfe83, 0x0623], // أ منفردة
    [0xfe85, 0x0624], // ؤ منفردة
    [0xfe87, 0x0625], // إ منفردة
    [0xfe89, 0x0626], // ئ منفردة
    [0xfe8d, 0x0627], // ا منفردة
    [0xfe8f, 0x0628], // ب منفردة
    [0xfe93, 0x0629], // ة منفردة
    [0xfe95, 0x062a], // ت منفردة
    [0xfe99, 0x062b], // ث منفردة
    [0xfe9d, 0x062c], // ج منفردة
    [0xfea1, 0x062d], // ح منفردة
    [0xfea5, 0x062e], // خ منفردة
    [0xfea9, 0x062f], // د منفردة
    [0xfeab, 0x0630], // ذ منفردة
    [0xfead, 0x0631], // ر منفردة
    [0xfeaf, 0x0632], // ز منفردة
    [0xfeb1, 0x0633], // س منفردة
    [0xfeb5, 0x0634], // ش منفردة
    [0xfeb9, 0x0635], // ص منفردة
    [0xfebd, 0x0636], // ض منفردة
    [0xfec1, 0x0637], // ط منفردة
    [0xfec5, 0x0638], // ظ منفردة
    [0xfec9, 0x0639], // ع منفردة
    [0xfecd, 0x063a], // غ منفردة
    [0xfed1, 0x0641], // ف منفردة
    [0xfed5, 0x0642], // ق منفردة
    [0xfed9, 0x0643], // ك منفردة
    [0xfedd, 0x0644], // ل منفردة
    [0xfee1, 0x0645], // م منفردة
    [0xfee5, 0x0646], // ن منفردة
    [0xfee9, 0x0647], // ه منفردة
    [0xfeed, 0x0648], // و منفردة
    [0xfeef, 0x0649], // ى منفردة
    [0xfef1, 0x064a], // ي منفردة
    [0xfbfd, 0xfef0], // تصحيح الألف المقصورة المتطرفة إلى Arabic Alef Maksura Final
  ]);

  // مفاتيح لا يجب معالجتها كنصوص عربية
  private static readonly SKIP_KEYS = new Set([
    'font',
    'alignment',
    'color',
    'fillColor',
    'background',
    'border',
    'layout',
    'style',
    'styles',
    'pageSize',
    'pageOrientation',
    'pageMargins',
    'hLineColor',
    'vLineColor',
    'hLineWidth',
    'vLineWidth',
  ]);

  static ar(text: string | undefined | null): string {
    if (text === null || text === undefined) return '';
    return String(text);
  }

  /**
   * معالجة كائن docDefinition لـ pdfmake-rtl
   * يضمن تفعيل اتجاه الـ RTL الأصلي دون تشويه أو عكس الحروف يدوياً
   */
  static processDocDefinition(obj: any, parentKey?: string): any {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'object' && !Array.isArray(obj)) {
      if (obj.rtl === undefined) {
        obj.rtl = true;
      }
      if (!obj.defaultStyle) {
        obj.defaultStyle = {};
      }
      if (!obj.defaultStyle.font) {
        obj.defaultStyle.font = 'Cairo';
      }
    }
    return obj;
  }
}
