/**
 * DawaCore — Report Kit
 * ─────────────────────
 * الحزمة الموحدة لكل التقارير.
 *
 * كل تقرير جديد يحتاج فقط:
 *   import {
 *     BaseReportService,
 *     ReportMetaBuilder,
 *     PdfExporter,
 *     ExcelExporter,
 *     ReportContext,
 *     ReportMeta,
 *     PdfSection,
 *     ExcelSheet,
 *     ReportView,
 *     ReportExport,
 *     DateTzUtil,
 *     arabicHourLabel,
 *     round2,
 *     CACHE_SERVICE,
 *     ICacheService,
 *   } from 'src/shared/report-kit';
 */

// ─── DTOs
export * from './dto';

// ─── Interfaces
export * from './interfaces';

// ─── Utils
export * from './utils';

// ─── Cache
export * from './cache';

// ─── Services
export * from './services';

// ─── Exporters
export * from './exporters';

// ─── Decorators
export * from './decorators';

// ─── Aging (Shared Domain)
export * from './aging';

// ─── Module
export * from './report-kit.module';
