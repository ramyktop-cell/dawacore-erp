import { ReportMeta } from './report-meta.interface';

/**
 * الشكل العام لأي تقرير يرجع من الـ API.
 * كل تقرير يحدد نوع البيانات الخاصة به في TData.
 */
export interface BaseReportResponse<TData> {
  /** بيانات وصفية موحدة */
  meta: ReportMeta;

  /** بيانات التقرير الفعلية (خاصة بكل تقرير) */
  data: TData;

  /** معلومات ترقيم الصفحات — اختياري (للتقارير اللي فيها قوائم طويلة) */
  pagination?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
