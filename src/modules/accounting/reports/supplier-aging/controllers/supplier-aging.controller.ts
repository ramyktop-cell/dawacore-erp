import {
  Controller,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';
import { ReportView, ReportExport } from 'src/shared/report-kit';
import { SupplierAgingService } from '../services/supplier-aging.service';
import { SupplierAgingExportService } from '../services/supplier-aging-export.service';
import { SupplierAgingFilterDto } from '../dto/supplier-aging-filter.dto';

/**
 * SupplierAgingController
 * ───────────────────────
 * 3 endpoints:
 *   GET /reports/supplier-aging                 → JSON
 *   GET /reports/supplier-aging/export/pdf      → PDF (Landscape)
 *   GET /reports/supplier-aging/export/excel    → Excel (3 sheets)
 */
@Controller(['accounting/reports/supplier-aging', 'reports/supplier-aging', 'reports/aging/suppliers'])
export class SupplierAgingController {
  constructor(
    private readonly service: SupplierAgingService,
    private readonly exportService: SupplierAgingExportService,
  ) {}

  // ─────────────────────────────────────────────
  // JSON Report
  // ─────────────────────────────────────────────

  @ReportView({ permission: 'reports.accounting.supplier-aging.view' })
  async getReport(
    @Query() filters: SupplierAgingFilterDto,
    @Req() req: any,
  ) {
    const { companyId, id: userId } = this.extractUser(req);
    return this.service.generate(filters, companyId, userId);
  }

  // ─────────────────────────────────────────────
  // PDF Export
  // ─────────────────────────────────────────────

  @ReportExport({
    permission: 'reports.accounting.supplier-aging.export',
    path: ['export/pdf', 'pdf'],
  })
  async exportPdf(
    @Query() filters: SupplierAgingFilterDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const { companyId, id: userId } = this.extractUser(req);

    const buffer = await this.exportService.toPdf(filters, companyId, userId);
    const filename = `supplier-aging-${this.todayStr()}.pdf`;

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
    permission: 'reports.accounting.supplier-aging.export',
    path: ['export/excel', 'excel'],
  })
  async exportExcel(
    @Query() filters: SupplierAgingFilterDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const { companyId, id: userId } = this.extractUser(req);

    const buffer = await this.exportService.toExcel(filters, companyId, userId);
    const filename = `supplier-aging-${this.todayStr()}.xlsx`;

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
