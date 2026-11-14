import { Global, Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ReportMetaBuilder } from './services/report-meta.builder';
import { PdfExporter } from './exporters/pdf.exporter';
import { ExcelExporter } from './exporters/excel.exporter';

/**
 * ReportKitModule
 * ───────────────
 * يجمع كل مزوّدي report-kit في مكان واحد.
 *
 * @Global() — يعني لا تحتاج لاستيرادها في كل module،
 * فقط في AppModule مرة واحدة.
 *
 * ما تصدّره:
 *   - ReportMetaBuilder  (يبني meta التقارير)
 *   - PdfExporter        (يولّد PDF)
 *   - ExcelExporter      (يولّد Excel)
 *
 * ملاحظة:
 *   BaseReportService هو abstract class — لا يُسجَّل هنا.
 *   كل تقرير يُسجَّل في module الخاص به ويورثه.
 */
@Global()
@Module({
  providers: [PrismaService, ReportMetaBuilder, PdfExporter, ExcelExporter],
  exports: [ReportMetaBuilder, PdfExporter, ExcelExporter],
})
export class ReportKitModule {}
