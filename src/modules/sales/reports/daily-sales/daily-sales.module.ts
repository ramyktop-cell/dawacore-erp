import { Module } from '@nestjs/common';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { DailySalesService } from './services/daily-sales.service';
import { DailySalesExportService } from './services/daily-sales-export.service';
import { DailySalesController } from './controllers/daily-sales.controller';

/**
 * DailySalesModule
 * ────────────────
 * يجمع كل مكونات تقرير المبيعات اليومية.
 *
 * ملاحظة:
 *   - PrismaService: نُسجّله هنا (لا يوجد PrismaModule @Global حتى الآن)
 *   - ReportMetaBuilder + PdfExporter + ExcelExporter:
 *     مُصدَّرة من ReportKitModule (@Global) — لا حاجة لاستيرادها
 */
@Module({
  controllers: [DailySalesController],
  providers: [
    PrismaService,
    DailySalesService,
    DailySalesExportService,
  ],
  exports: [DailySalesService],
})
export class DailySalesModule {}
