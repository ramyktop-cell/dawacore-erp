import {
  Controller,
  Query,
  Param,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';
import { ReportView, ReportExport } from 'src/shared/report-kit';
import { GeneralLedgerService } from '../services/general-ledger.service';
import { GeneralLedgerExportService } from '../services/general-ledger-export.service';
import { GeneralLedgerFilterDto } from '../dto/general-ledger-filter.dto';

/**
 * GeneralLedgerController
 * ───────────────────────
 * endpoints:
 *   GET /reports/general-ledger                 → JSON
 *   GET /reports/general-ledger/:accountId      → JSON
 *   GET /reports/general-ledger/export/pdf      → PDF (Landscape A4)
 *   GET /reports/general-ledger/export/excel    → Excel
 */
@Controller(['accounting/reports/general-ledger', 'reports/general-ledger'])
export class GeneralLedgerController {
  constructor(
    private readonly service: GeneralLedgerService,
    private readonly exportService: GeneralLedgerExportService,
  ) {}

  // ─────────────────────────────────────────────
  // JSON Report
  // ─────────────────────────────────────────────

  @ReportView({ permission: 'reports.accounting.general-ledger.view' })
  async getReport(
    @Query() filters: GeneralLedgerFilterDto,
    @Req() req: any,
  ) {
    const { companyId, id: userId } = this.extractUser(req);
    return this.service.generate(filters, companyId, userId);
  }

  @ReportView({
    permission: 'reports.accounting.general-ledger.view',
    path: ':accountId',
  })
  async getReportByAccountId(
    @Param('accountId') accountId: string,
    @Query() filters: GeneralLedgerFilterDto,
    @Req() req: any,
  ) {
    const { companyId, id: userId } = this.extractUser(req);
    return this.service.generate({ ...filters, accountId }, companyId, userId);
  }

  // ─────────────────────────────────────────────
  // PDF Export
  // ─────────────────────────────────────────────

  @ReportExport({
    permission: 'reports.accounting.general-ledger.export',
    path: 'export/pdf',
  })
  async exportPdf(
    @Query() filters: GeneralLedgerFilterDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const { companyId, id: userId } = this.extractUser(req);

    const buffer = await this.exportService.toPdf(filters, companyId, userId);

    const filename = `general-ledger-${this.todayStr()}.pdf`;

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
    permission: 'reports.accounting.general-ledger.export',
    path: 'export/excel',
  })
  async exportExcel(
    @Query() filters: GeneralLedgerFilterDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const { companyId, id: userId } = this.extractUser(req);

    const buffer = await this.exportService.toExcel(filters, companyId, userId);

    const filename = `general-ledger-${this.todayStr()}.xlsx`;

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
