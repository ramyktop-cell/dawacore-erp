import { Module } from '@nestjs/common';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { CashierPerformanceService } from './services/cashier-performance.service';
import { CashierPerformanceExportService } from './services/cashier-performance-export.service';
import { CashierPerformanceController } from './controllers/cashier-performance.controller';

/**
 * CashierPerformanceModule
 * ────────────────────────
 * يجمع كل مكونات تقرير أداء الكاشيرين.
 *
 * ملاحظة:
 *   - PrismaService: نُسجّله هنا (لا يوجد PrismaModule @Global)
 *   - ReportMetaBuilder + PdfExporter + ExcelExporter:
 *     مُصدَّرة من ReportKitModule (@Global) — لا حاجة لاستيرادها
 */
@Module({
  controllers: [CashierPerformanceController],
  providers: [
    PrismaService,
    CashierPerformanceService,
    CashierPerformanceExportService,
  ],
  exports: [CashierPerformanceService, CashierPerformanceExportService],
})
export class CashierPerformanceModule {}
