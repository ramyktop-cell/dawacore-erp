/**
 * تعريف عمود في ورقة Excel
 */
export interface ExcelColumn {
  /** المفتاح في كائن الصف */
  key: string;

  /** العنوان المعروض في الرأس */
  header: string;

  /** عرض العمود بوحدات Excel */
  width?: number;

  /** نوع التنسيق */
  format?: 'currency' | 'number' | 'date' | 'text';

  /** محاذاة المحتوى */
  align?: 'left' | 'right' | 'center';
}

/**
 * ورقة كاملة في ملف Excel
 */
export interface ExcelSheet {
  /** اسم الورقة (يظهر في التاب أسفل الملف) */
  name: string;

  /** عنوان الورقة (يظهر في الصف الأول) — اختياري */
  title?: string;

  /** الأعمدة */
  columns: ExcelColumn[];

  /** الصفوف */
  rows: Record<string, any>[];

  /** صف الإجماليات — اختياري */
  totals?: Record<string, number>;

  /** بيانات meta إضافية تُعرض في الأعلى (مفتاح-قيمة) — اختياري */
  meta?: Record<string, string>;
}
