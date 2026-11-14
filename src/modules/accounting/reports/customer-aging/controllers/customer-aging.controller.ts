import {
  Controller,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';
import { ReportView, ReportExport } from 'src/shared/report-kit';
import { CustomerAgingService } from '../services/customer-aging.service';
import { CustomerAgingExportService } from '../services/customer-aging-export.service';
import { CustomerAgingFilterDto } from '../dto/customer-aging-filter.dto';
import { CustomerAgingDrillFilterDto } from '../dto/customer-aging-drill-filter.dto';

/**
 * CustomerAgingController
 * ───────────────────────
 * 4 endpoints:
 *   GET /reports/customer-aging                 → JSON
 *   GET /reports/customer-aging/drill           → JSON (Per-customer invoices drill-down)
 *   GET /reports/customer-aging/export/pdf      → PDF (Landscape)
 *   GET /reports/customer-aging/export/excel    → Excel (3 sheets)
 */
@Controller(['accounting/reports/customer-aging', 'reports/customer-aging', 'reports/aging/customers'])
export class CustomerAgingController {
  constructor(
    private readonly service: CustomerAgingService,
    private readonly exportService: CustomerAgingExportService,
  ) {}

  // ─────────────────────────────────────────────
  // JSON Report
  // ─────────────────────────────────────────────

  @ReportView({ permission: 'reports.accounting.customer-aging.view' })
  async getReport(
    @Query() filters: CustomerAgingFilterDto,
    @Req() req: any,
  ) {
    const { companyId, id: userId } = this.extractUser(req);
    return this.service.generate(filters, companyId, userId);
  }

  // ─────────────────────────────────────────────
  // Drill-Down (فواتير عميل محدد)
  // ─────────────────────────────────────────────

  @ReportView({
    permission: 'reports.accounting.customer-aging.view',
    path: 'drill',
  })
  async getCustomerInvoices(
    @Query() filters: CustomerAgingDrillFilterDto,
    @Req() req: any,
  ) {
    const { companyId } = this.extractUser(req);
    return this.service.drillDown(filters, companyId);
  }

  // ─────────────────────────────────────────────
  // PDF Export
  // ─────────────────────────────────────────────

  @ReportExport({
    permission: 'reports.accounting.customer-aging.export',
    path: ['export/pdf', 'pdf'],
  })
  async exportPdf(
    @Query() filters: CustomerAgingFilterDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const { companyId, id: userId } = this.extractUser(req);

    const buffer = await this.exportService.toPdf(filters, companyId, userId);
    const filename = `customer-aging-${this.todayStr()}.pdf`;

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
    permission: 'reports.accounting.customer-aging.export',
    path: ['export/excel', 'excel'],
  })
  async exportExcel(
    @Query() filters: CustomerAgingFilterDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const { companyId, id: userId } = this.extractUser(req);

    const buffer = await this.exportService.toExcel(filters, companyId, userId);
    const filename = `customer-aging-${this.todayStr()}.xlsx`;

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
