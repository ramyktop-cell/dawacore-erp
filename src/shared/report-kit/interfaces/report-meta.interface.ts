/**
 * بيانات وصفية موحدة لكل تقرير — تُعرض في رأس PDF/Excel وفي meta الـ API response.
 */
export interface ReportMeta {
  /** عنوان التقرير بالعربية */
  title: string;

  /** اسم الشركة */
  companyName: string;

  /** شعار الشركة (Base64 أو URL) — اختياري */
  companyLogo?: string;

  /** اسم الفرع — اختياري (لو التقرير مفلتر بفرع) */
  branchName?: string;

  /** تاريخ بداية الفترة (YYYY-MM-DD) */
  fromDate: string;

  /** تاريخ نهاية الفترة (YYYY-MM-DD) */
  toDate: string;

  /** المنطقة الزمنية للشركة (مثال: Africa/Cairo) */
  timezone: string;

  /** تاريخ ووقت إنشاء التقرير */
  generatedAt: Date;

  /** بيانات المستخدم اللي أنشأ التقرير */
  generatedBy: {
    id: string;
    name: string;
  };

  /** لقطة من الفلاتر المستخدمة (بدون companyId) */
  filters?: Record<string, unknown>;
}
