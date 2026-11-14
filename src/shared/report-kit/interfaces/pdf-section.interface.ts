/**
 * بطاقة KPI تُعرض في أعلى قسم PDF
 */
export interface PdfKpiCard {
  /** التسمية (مثال: "إجمالي المبيعات") */
  label: string;

  /** القيمة (نص أو رقم — يُنسّق تلقائياً) */
  value: string | number;

  /** تلميح صغير تحت القيمة — اختياري */
  hint?: string;

  /** لون البطاقة */
  color?: 'primary' | 'success' | 'danger' | 'warning' | 'info';
}

/**
 * تعريف عمود في جدول PDF
 */
export interface PdfTableColumn {
  /** المفتاح في كائن الصف */
  key: string;

  /** العنوان المعروض في الرأس */
  label: string;

  /** عرض العمود (CSS width — مثال: "20%", "120px") */
  width?: string;

  /** محاذاة المحتوى */
  align?: 'left' | 'right' | 'center';

  /** نوع التنسيق */
  format?: 'currency' | 'number' | 'date' | 'text';
}

/**
 * جدول في تقرير PDF
 */
export interface PdfTable {
  /** عنوان الجدول — اختياري */
  title?: string;

  /** الأعمدة */
  columns: PdfTableColumn[];

  /** الصفوف (كائنات بمفاتيح تطابق columns[].key) */
  rows: Record<string, any>[];

  /** صف الإجماليات — اختياري */
  totals?: Record<string, number>;
}

/**
 * قسم كامل في PDF (يحتوي على KPI cards + جداول + ملاحظة)
 */
export interface PdfSection {
  /** عنوان القسم — اختياري */
  heading?: string;

  /** بطاقات KPI — اختياري */
  kpis?: PdfKpiCard[];

  /** جداول — اختياري */
  tables?: PdfTable[];

  /** ملاحظة أسفل القسم — اختياري */
  note?: string;
}
