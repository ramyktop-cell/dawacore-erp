import {
  Controller,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';
import { ReportView, ReportExport } from 'src/shared/report-kit';
import { PaymentMethodsService } from '../services/payment-methods.service';
import { PaymentMethodsExportService } from '../services/payment-methods-export.service';
import { PaymentMethodsFilterDto } from '../dto/payment-methods-filter.dto';

/**
 * PaymentMethodsController
 * ────────────────────────
 * 3 endpoints:
 *   GET /reports/payment-methods                 → JSON
 *   GET /reports/payment-methods/export/pdf      → PDF file
 *   GET /reports/payment-methods/export/excel    → Excel file
 *
 * كل endpoint محمي بـ:
 *   🔒 JwtAuthGuard + PermissionsGuard
 *   🎯 Permission محددة
 *   ⏱️ Throttling (30/دقيقة للعرض، 5/دقيقة للتصدير)
 */
@Controller('reports/payment-methods')
export class PaymentMethodsController {
  constructor(
    private readonly service: PaymentMethodsService,
    private readonly exportService: PaymentMethodsExportService,
  ) {}

  // ─────────────────────────────────────────────
  // JSON Report
  // ─────────────────────────────────────────────

  @ReportView({ permission: 'reports.sales.payment-methods.view' })
  async getReport(
    @Query() filters: PaymentMethodsFilterDto,
    @Req() req: any,
  ) {
    const { companyId, id: userId } = this.extractUser(req);
    return this.service.generate(filters, companyId, userId);
  }

  // ─────────────────────────────────────────────
  // PDF Export
  // ─────────────────────────────────────────────

  @ReportExport({
    permission: 'reports.sales.payment-methods.export',
    path: 'export/pdf',
  })
  async exportPdf(
    @Query() filters: PaymentMethodsFilterDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const { companyId, id: userId } = this.extractUser(req);

    const buffer = await this.exportService.toPdf(filters, companyId, userId);

    const filename = `payment-methods-${this.todayStr()}.pdf`;

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
    permission: 'reports.sales.payment-methods.export',
    path: 'export/excel',
  })
  async exportExcel(
    @Query() filters: PaymentMethodsFilterDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const { companyId, id: userId } = this.extractUser(req);

    const buffer = await this.exportService.toExcel(filters, companyId, userId);

    const filename = `payment-methods-${this.todayStr()}.xlsx`;

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
