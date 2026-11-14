import {
  Controller,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';
import { ReportView, ReportExport } from 'src/shared/report-kit';
import { DailySalesService } from '../services/daily-sales.service';
import { DailySalesExportService } from '../services/daily-sales-export.service';
import { DailySalesFilterDto } from '../dto/daily-sales-filter.dto';

/**
 * DailySalesController
 * ────────────────────
 * 3 endpoints:
 *   GET /reports/daily-sales                 → JSON
 *   GET /reports/daily-sales/export/pdf      → PDF file
 *   GET /reports/daily-sales/export/excel    → Excel file
 *
 * كل endpoint محمي بـ:
 *   🔒 JwtAuthGuard + PermissionsGuard
 *   🎯 Permission محددة
 *   ⏱️ Throttling (30/دقيقة للعرض، 5/دقيقة للتصدير)
 */
@Controller('reports/daily-sales')
export class DailySalesController {
  constructor(
    private readonly service: DailySalesService,
    private readonly exportService: DailySalesExportService,
  ) {}

  // ─────────────────────────────────────────────
  // JSON Report
  // ─────────────────────────────────────────────

  @ReportView({ permission: 'reports.sales.daily.view' })
  async getReport(
    @Query() filters: DailySalesFilterDto,
    @Req() req: any,
  ) {
    const { companyId, id: userId } = this.extractUser(req);
    return this.service.generate(filters, companyId, userId);
  }

  // ─────────────────────────────────────────────
  // PDF Export
  // ─────────────────────────────────────────────

  @ReportExport({
    permission: 'reports.sales.daily.export',
    path: 'export/pdf',
  })
  async exportPdf(
    @Query() filters: DailySalesFilterDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const { companyId, id: userId } = this.extractUser(req);

    const buffer = await this.exportService.toPdf(filters, companyId, userId);

    const filename = `daily-sales-${this.todayStr()}.pdf`;

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length.toString(),
      'Cache-Control': 'no-store',
    });

    res.end(buffer);
  }

  // ─────────────────────────────────────────────
  // Excel Export
  // ─────────────────────────────────────────────

  @ReportExport({
    permission: 'reports.sales.daily.export',
    path: 'export/excel',
  })
  async exportExcel(
    @Query() filters: DailySalesFilterDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const { companyId, id: userId } = this.extractUser(req);

    const buffer = await this.exportService.toExcel(filters, companyId, userId);

    const filename = `daily-sales-${this.todayStr()}.xlsx`;

    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length.toString(),
      'Cache-Control': 'no-store',
    });

    res.end(buffer);
  }

  // ─────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────

  private extractUser(req: any): { companyId: string; id: string } {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;

    if (!companyId) {
      throw new UnauthorizedException('جلسة غير صالحة');
    }
    if (!userId) {
      throw new UnauthorizedException('مستخدم غير معروف');
    }

    return { companyId, id: userId };
  }

  private todayStr(): string {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
}
