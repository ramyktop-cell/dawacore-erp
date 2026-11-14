import {
  Controller,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';
import { ReportView, ReportExport } from 'src/shared/report-kit';
import { BalanceSheetService } from '../services/balance-sheet.service';
import { BalanceSheetExportService } from '../services/balance-sheet-export.service';
import { BalanceSheetFilterDto } from '../dto/balance-sheet-filter.dto';
import { BalanceSheetDrillFilterDto } from '../dto/drill-down-filter.dto';

/**
 * BalanceSheetController
 * ──────────────────────
 * 4 endpoints:
 *   GET /reports/balance-sheet                 → JSON
 *   GET /reports/balance-sheet/drill           → JSON (children of account)
 *   GET /reports/balance-sheet/export/pdf      → PDF (Landscape عند المقارنة)
 *   GET /reports/balance-sheet/export/excel    → Excel (4 sheets)
 */
@Controller(['accounting/reports/balance-sheet', 'reports/balance-sheet'])
export class BalanceSheetController {
  constructor(
    private readonly service: BalanceSheetService,
    private readonly exportService: BalanceSheetExportService,
  ) {}

  // ─────────────────────────────────────────────
  // JSON Report (Main)
  // ─────────────────────────────────────────────

  @ReportView({ permission: 'reports.accounting.balance-sheet.view' })
  async getReport(
    @Query() filters: BalanceSheetFilterDto,
    @Req() req: any,
  ) {
    const { companyId, id: userId } = this.extractUser(req);
    return this.service.generate(filters, companyId, userId);
  }

  // ─────────────────────────────────────────────
  // Drill-Down (Tree Navigation)
  // ─────────────────────────────────────────────

  @ReportView({
    permission: 'reports.accounting.balance-sheet.view',
    path: 'drill',
  })
  async drillDown(
    @Query() filters: BalanceSheetDrillFilterDto,
    @Req() req: any,
  ) {
    const { companyId } = this.extractUser(req);

    return this.service.drillDown(
      filters.parentAccountId,
      companyId,
      filters.asOfDate ?? new Date().toISOString().split('T')[0],
      undefined, // Service يستخدم Africa/Cairo كـ fallback
      filters.branchId,
    );
  }

  // ─────────────────────────────────────────────
  // PDF Export
  // ─────────────────────────────────────────────

  @ReportExport({
    permission: 'reports.accounting.balance-sheet.export',
    path: ['export/pdf', 'pdf'],
  })
  async exportPdf(
    @Query() filters: BalanceSheetFilterDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const { companyId, id: userId } = this.extractUser(req);

    const buffer = await this.exportService.toPdf(filters, companyId, userId);

    const filename = `balance-sheet-${this.todayStr()}.pdf`;

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
    permission: 'reports.accounting.balance-sheet.export',
    path: ['export/excel', 'excel'],
  })
  async exportExcel(
    @Query() filters: BalanceSheetFilterDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const { companyId, id: userId } = this.extractUser(req);

    const buffer = await this.exportService.toExcel(filters, companyId, userId);

    const filename = `balance-sheet-${this.todayStr()}.xlsx`;

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
    return new Date().toISOString().split('T')[0];
  }
}
