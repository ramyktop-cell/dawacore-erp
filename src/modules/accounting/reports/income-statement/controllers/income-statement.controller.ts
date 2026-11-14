import {
  Controller,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';
import { ReportView, ReportExport } from 'src/shared/report-kit';
import { IncomeStatementService } from '../services/income-statement.service';
import { IncomeStatementExportService } from '../services/income-statement-export.service';
import { IncomeStatementFilterDto } from '../dto/income-statement-filter.dto';
import { DrillDownFilterDto } from '../dto/drill-down-filter.dto';
import {
  IncomeStatementResponse,
  DrillDownResult,
} from '../interfaces/income-statement.interface';

/**
 * IncomeStatementController
 * ─────────────────────────
 * 4 endpoints:
 *   GET /reports/income-statement                 → JSON
 *   GET /reports/income-statement/drill           → JSON (children of account)
 *   GET /reports/income-statement/export/pdf      → PDF (Landscape عند المقارنة)
 *   GET /reports/income-statement/export/excel    → Excel (3 sheets)
 */
@Controller(['accounting/reports/income-statement', 'reports/income-statement'])
export class IncomeStatementController {
  constructor(
    private readonly service: IncomeStatementService,
    private readonly exportService: IncomeStatementExportService,
  ) {}

  // ─────────────────────────────────────────────
  // JSON Report (Main)
  // ─────────────────────────────────────────────

  @ReportView({ permission: 'reports.accounting.income-statement.view' })
  async getReport(
    @Query() filters: IncomeStatementFilterDto,
    @Req() req: any,
  ): Promise<IncomeStatementResponse> {
    const { companyId, id: userId } = this.extractUser(req);
    return this.service.generate(filters, companyId, userId);
  }

  // ─────────────────────────────────────────────
  // Drill-Down (Tree Navigation)
  // ─────────────────────────────────────────────

  @ReportView({
    permission: 'reports.accounting.income-statement.view',
    path: 'drill',
  })
  async drillDown(
    @Query() filters: DrillDownFilterDto,
    @Req() req: any,
  ): Promise<DrillDownResult> {
    const { companyId } = this.extractUser(req);
    const tz = req.user?.timezone || 'Africa/Cairo';
    return this.service.drillDown(filters, companyId, tz);
  }

  // ─────────────────────────────────────────────
  // PDF Export
  // ─────────────────────────────────────────────

  @ReportExport({
    permission: 'reports.accounting.income-statement.export',
    path: 'export/pdf',
  })
  async exportPdf(
    @Query() filters: IncomeStatementFilterDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const { companyId, id: userId } = this.extractUser(req);

    const buffer = await this.exportService.toPdf(filters, companyId, userId);

    const filename = `income-statement-${this.todayStr()}.pdf`;

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
    permission: 'reports.accounting.income-statement.export',
    path: 'export/excel',
  })
  async exportExcel(
    @Query() filters: IncomeStatementFilterDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const { companyId, id: userId } = this.extractUser(req);

    const buffer = await this.exportService.toExcel(filters, companyId, userId);

    const filename = `income-statement-${this.todayStr()}.xlsx`;

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

  /**
   * تاريخ اليوم بصيغة YYYY-MM-DD — ISO يُرجع بتوقيت UTC،
   * لكن التاريخ فقط كافٍ لاسم الملف.
   */
  private todayStr(): string {
    return new Date().toISOString().split('T')[0];
  }
}
