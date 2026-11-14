import { Controller, Get, Query, Res, BadRequestException } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { PdfExportService } from '../modules/accounting/reports/services/pdf-export.service';
import { Permission } from '../auth/security.policy';

@ApiTags('Reports')
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly pdfExportService: PdfExportService,
  ) {}

  @Get('customer-statement')
  @Permission('customer-reports:read')
  @ApiOperation({ summary: 'تقرير كشف حساب العميل التفصيلي (CSTDTLST)' })
  @ApiQuery({ name: 'customerId', required: true, description: 'معرف العميل UUID' })
  @ApiQuery({ name: 'from', required: true, description: 'من تاريخ YYYY-MM-DD' })
  @ApiQuery({ name: 'to', required: true, description: 'إلى تاريخ YYYY-MM-DD' })
  @ApiResponse({ status: 200, description: 'بيانات كشف الحساب التفصيلي مع الرصيد التراكمي' })
  async getCustomerStatement(
    @Query('customerId') customerId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    if (!customerId) throw new BadRequestException('customerId مطلوب');
    if (!from || !to) throw new BadRequestException('يجب تحديد نطاق التاريخ (from, to)');
    return await this.reportsService.getCustomerStatement(customerId, from, to);
  }

  @Get('customer-statement/pdf')
  @Permission('customer-reports:read')
  @ApiOperation({ summary: 'تصدير كشف حساب العميل التفصيلي بصيغة PDF' })
  @ApiQuery({ name: 'customerId', required: true, description: 'معرف العميل UUID' })
  @ApiQuery({ name: 'from', required: true, description: 'من تاريخ YYYY-MM-DD' })
  @ApiQuery({ name: 'to', required: true, description: 'إلى تاريخ YYYY-MM-DD' })
  async exportCustomerStatementPdf(
    @Query('customerId') customerId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Res() res: Response,
  ) {
    if (!customerId) throw new BadRequestException('customerId مطلوب');
    if (!from || !to) throw new BadRequestException('يجب تحديد نطاق التاريخ (from, to)');

    const report = await this.reportsService.getCustomerStatement(customerId, from, to);
    const pdfBuffer = await this.pdfExportService.generateCustomerStatementPdf(report);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="customer-statement-${customerId}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);
  }

  @Get('customer-balances')
  @Permission('customer-reports:read')
  @ApiOperation({ summary: 'تقرير الأرصدة التجميعية للمدينين (CUSTBAL)' })
  @ApiQuery({ name: 'branchId', required: false, description: 'معرف الفرع' })
  @ApiQuery({ name: 'asOfDate', required: false, description: 'حتى تاريخ YYYY-MM-DD' })
  @ApiResponse({ status: 200, description: 'ملخص أرصدة العملاء والمديونيات' })
  async getCustomerBalances(
    @Query('branchId') branchId?: string,
    @Query('asOfDate') asOfDate?: string,
  ) {
    return await this.reportsService.getCustomerBalancesSummary(branchId, asOfDate);
  }

  @Get('customers')
  @Permission('customer-reports:read')
  @ApiOperation({ summary: 'استعلام وبحث عن قائمة العملاء' })
  @ApiQuery({ name: 'q', required: false, description: 'بحث بالاسم أو الكود أو الهاتف' })
  @ApiResponse({ status: 200, description: 'قائمة العملاء المطابقين للبحث' })
  async getCustomers(@Query('q') q?: string) {
    return await this.reportsService.getCustomers(q);
  }
}
