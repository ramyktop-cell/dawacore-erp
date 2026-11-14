import {
  Controller,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';
import { ReportView, ReportExport } from 'src/shared/report-kit';
import { TrialBalanceService } from '../services/trial-balance.service';
import { TrialBalanceExportService } from '../services/trial-balance-export.service';
import { TrialBalanceFilterDto } from '../dto/trial-balance-filter.dto';

/**
 * TrialBalanceController
 * ──────────────────────
 * 3 endpoints:
 *   GET /reports/trial-balance                 → JSON
 *   GET /reports/trial-balance/export/pdf      → PDF (Landscape A4)
 *   GET /reports/trial-balance/export/excel    → Excel
 */
@Controller(['accounting/reports/trial-balance', 'reports/trial-balance'])
export class TrialBalanceController {
  constructor(
    private readonly service: TrialBalanceService,
    private readonly exportService: TrialBalanceExportService,
  ) {}

  // ─────────────────────────────────────────────
  // JSON Report
  // ─────────────────────────────────────────────

  @ReportView({ permission: 'reports.accounting.trial-balance.view' })
  async getReport(
    @Query() filters: TrialBalanceFilterDto,
    @Req() req: any,
  ) {
    const { companyId, id: userId } = this.extractUser(req);
    return this.service.generate(filters, companyId, userId);
  }

  // ─────────────────────────────────────────────
  // PDF Export
  // ─────────────────────────────────────────────

  @ReportExport({
    permission: 'reports.accounting.trial-balance.export',
    path: 'export/pdf',
  })
  async exportPdf(
    @Query() filters: TrialBalanceFilterDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const { companyId, id: userId } = this.extractUser(req);

    const buffer = await this.exportService.toPdf(filters, companyId, userId);

    const filename = `trial-balance-${this.todayStr()}.pdf`;

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
    permission: 'reports.accounting.trial-balance.export',
    path: 'export/excel',
  })
  async exportExcel(
    @Query() filters: TrialBalanceFilterDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const { companyId, id: userId } = this.extractUser(req);

    const buffer = await this.exportService.toExcel(filters, companyId, userId);

    const filename = `trial-balance-${this.todayStr()}.xlsx`;

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
