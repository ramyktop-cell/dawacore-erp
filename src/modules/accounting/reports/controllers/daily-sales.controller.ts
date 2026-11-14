import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { DailySalesService } from '../services/daily-sales.service';
import { DailySalesFilterDto } from '../dto/daily-sales-filter.dto';
import { PdfExportService } from '../services/pdf-export.service';
import { ExcelExportService } from '../services/excel-export.service';
import { Permission } from '../../../../auth/security.policy';

@ApiTags('Daily Sales Report')
@Controller(['accounting/reports/daily-sales', 'reports/daily-sales'])
export class DailySalesController {
  constructor(
    private readonly dailySalesService: DailySalesService,
    private readonly pdfService: PdfExportService,
    private readonly excelService: ExcelExportService,
  ) {}

  /**
   * تقرير المبيعات اليومية والشاملة
   */
  @Get()
  @Permission('reports:read')
  @ApiOperation({ summary: 'تقرير المبيعات اليومية والشاملة' })
  async getDailySalesReport(
    @Query() filters: DailySalesFilterDto,
    @Req() req: any,
  ) {
    const companyId = req.user?.companyId || '11111111-0000-0000-0000-000000000001';
    const userId = req.user?.id || 'admin-system';
    return this.dailySalesService.generateReport(filters, companyId, userId);
  }

  /**
   * تصدير Excel
   */
  @Get('excel')
  @Permission('reports:read')
  @ApiOperation({ summary: 'تصدير تقرير المبيعات اليومية إلى Excel' })
  async exportExcel(
    @Query() filters: DailySalesFilterDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const companyId = req.user?.companyId || '11111111-0000-0000-0000-000000000001';
    const userId = req.user?.id || 'admin-system';

    const report = await this.dailySalesService.generateReport(
      filters,
      companyId,
      userId,
    );

    const buffer = await this.excelService.generateDailySalesExcel(report);
    const filename = `daily-sales-${new Date().toISOString().slice(0, 10)}.xlsx`;

    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length.toString(),
    });
    res.end(buffer);
  }

  /**
   * تصدير PDF
   */
  @Get('pdf')
  @Permission('reports:read')
  @ApiOperation({ summary: 'تصدير تقرير المبيعات اليومية إلى PDF' })
  async exportPdf(
    @Query() filters: DailySalesFilterDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const companyId = req.user?.companyId || '11111111-0000-0000-0000-000000000001';
    const userId = req.user?.id || 'admin-system';

    const report = await this.dailySalesService.generateReport(
      filters,
      companyId,
      userId,
    );

    const pdfBuffer = await this.pdfService.generateDailySalesPdf(report);
    const filename = `daily-sales-${new Date().toISOString().slice(0, 10)}.pdf`;

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': pdfBuffer.length.toString(),
    });
    res.end(pdfBuffer);
  }
}
