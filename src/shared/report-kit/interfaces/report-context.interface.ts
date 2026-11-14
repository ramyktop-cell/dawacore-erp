import { ReportMeta } from './report-meta.interface';

/**
 * السياق اللي يُمرر لكل تقرير عند بنائه.
 * يجمع كل المعلومات اللي يحتاجها التقرير: بيانات الشركة، المستخدم، العملة، إلخ.
 */
export interface ReportContext {
  /** معرف الشركة (من JWT — لا يُمرر أبداً من الـ query) */
  companyId: string;

  /** معرف المستخدم اللي طلب التقرير */
  userId: string;

  /** المنطقة الزمنية للشركة */
  timezone: string;

  /** العملة الافتراضية للشركة (مثال: SDG, EGP, SAR) */
  currency: string;

  /** بيانات الـ meta جاهزة (يُبنى مرة واحدة في BaseReportService) */
  meta: ReportMeta;
}
