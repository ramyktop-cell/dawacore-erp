import {
  IsOptional,
  IsDateString,
  IsUUID,
  IsInt,
  Min,
  Max,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * الفلتر الأساسي لكل التقارير.
 *
 * ⚠️ SECURITY NOTE:
 * لا يوجد `companyId` هنا — يُجلب حصراً من req.user.companyId (JWT).
 * أي محاولة لتمريره في الـ Query سيتم رفضها تلقائياً في main.ts
 * (forbidNonWhitelisted: true) وفي BaseReportService (defense in depth).
 *
 * كل تقرير يورث هذا الـ DTO ويضيف حقولاً خاصة به.
 */
export class ReportFilterDto {
  /**
   * تاريخ البداية (YYYY-MM-DD).
   * يُفسَّر في timezone الشركة.
   */
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  /**
   * تاريخ النهاية (YYYY-MM-DD).
   * يُفسَّر في timezone الشركة.
   */
  @IsOptional()
  @IsDateString()
  toDate?: string;

  /**
   * فلترة بفرع معين.
   * يُتحقق لاحقاً أن الفرع يتبع نفس الشركة (في BaseReportService).
   */
  @IsOptional()
  @IsUUID('4')
  branchId?: string;

  /**
   * رقم الصفحة (يبدأ من 1).
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  /**
   * عدد السجلات في الصفحة (1-500).
   * الحد الأقصى يمنع استنزاف الموارد.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number = 100;

  /**
   * علم داخلي لتجاوز الـ cache (مفيد بعد إدخال بيانات جديدة).
   * لا يُمرَّر عادة من الـ frontend — فقط للاختبار أو debugging.
   */
  @IsOptional()
  @IsIn(['true', 'false'])
  skipCache?: 'true' | 'false';
}

/**
 * DTO موسّع لطلبات التصدير (PDF/Excel).
 * يورث كل شيء من ReportFilterDto ويضيف خيارات التصدير.
 */
export class ReportExportFilterDto extends ReportFilterDto {
  /**
   * صيغة التصدير.
   */
  @IsOptional()
  @IsIn(['pdf', 'excel'])
  format?: 'pdf' | 'excel';

  /**
   * لغة التقرير.
   * افتراضي: 'ar' (العربية).
   */
  @IsOptional()
  @IsIn(['ar', 'en'])
  language?: 'ar' | 'en' = 'ar';
}
