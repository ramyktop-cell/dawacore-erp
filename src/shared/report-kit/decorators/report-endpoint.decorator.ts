import { applyDecorators, Get, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../auth/guards/permissions.guard';
import { Permissions } from '../../../auth/decorators/permissions.decorator';

/**
 * خيارات decorator عرض التقرير.
 */
export interface ReportViewOptions {
  /** الصلاحية المطلوبة (مثال: 'reports.sales.daily.view') */
  permission: string;

  /** مسار الـ endpoint (افتراضي: '/') */
  path?: string;
}

/**
 * ReportView
 * ──────────
 * decorator موحّد لـ endpoints عرض التقارير.
 *
 * يوفّر:
 *   🔒 JwtAuthGuard + PermissionsGuard
 *   🎯 التحقق من الصلاحية
 *   ⏱️ Throttling معتدل (30 طلب/دقيقة)
 *
 * @example
 * @ReportView({ permission: 'reports.sales.daily.view' })
 * async getReport(...) { ... }
 */
export function ReportView(options: ReportViewOptions) {
  return applyDecorators(
    UseGuards(JwtAuthGuard, PermissionsGuard, ThrottlerGuard),
    Permissions(options.permission),
    Throttle({ default: { limit: 30, ttl: 60_000 } }),
    Get(options.path ?? '/'),
  );
}

/**
 * خيارات decorator تصدير التقرير.
 */
export interface ReportExportOptions {
  /** الصلاحية المطلوبة */
  permission: string;

  /** مسار الـ endpoint (إلزامي) */
  path: string | string[];
}

/**
 * ReportExport
 * ────────────
 * decorator موحّد لـ endpoints تصدير التقارير (PDF/Excel).
 *
 * يوفّر نفس الحماية لكن بـ Throttling مشدّد (5/دقيقة)
 * لأن التصدير مكلف (Puppeteer + ExcelJS).
 *
 * @example
 * @ReportExport({ permission: 'reports.sales.daily.export', path: 'export/pdf' })
 * async exportPdf(...) { ... }
 */
export function ReportExport(options: ReportExportOptions) {
  return applyDecorators(
    UseGuards(JwtAuthGuard, PermissionsGuard, ThrottlerGuard),
    Permissions(options.permission),
    Throttle({ default: { limit: 5, ttl: 60_000 } }),
    Get(options.path),
  );
}
