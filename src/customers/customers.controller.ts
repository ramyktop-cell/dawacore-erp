import { Controller, Get, Post, Put, Delete, Body, Param, Query, Res, Req } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerPaymentDto } from './dto/customer-payment.dto';
import { PdfExportService } from '../modules/accounting/reports/services/pdf-export.service';
import { Permission } from '../auth/security.policy';

@ApiTags('Customers')
@Controller('customers')
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly pdfExportService: PdfExportService,
  ) {}

  @Post()
  @Permission('customers:write')
  @ApiOperation({ summary: 'إضافة عميل جديد وتسجيل الرصيد الافتتاحي في سجل الحركات' })
  @ApiResponse({ status: 201, description: 'تم إنشاء العميل بنجاح' })
  create(@Body() dto: CreateCustomerDto, @Req() req: any) {
    return this.customersService.create(dto, req.user);
  }

  @Get()
  @Permission('customers:read')
  @ApiOperation({ summary: 'استعراض قائمة العملاء مع التصفية والبحث والترقيم' })
  @ApiQuery({ name: 'companyId', required: false })
  @ApiQuery({ name: 'branchId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'hasDebt', required: false, type: Boolean })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Query('companyId') companyId?: string,
    @Query('branchId') branchId?: string,
    @Query('search') search?: string,
    @Query('hasDebt') hasDebt?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Req() req?: any,
  ) {
    return this.customersService.findAll({
      companyId,
      branchId,
      search,
      hasDebt: hasDebt === 'true',
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    }, req.user);
  }

  @Get(':id')
  @Permission('customers:read')
  @ApiOperation({ summary: 'استعراض تفاصيل العميل والفرع والشركة' })
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.customersService.findOne(id, req.user);
  }

  @Get(':id/ledger')
  @Permission('customers:read')
  @ApiOperation({ summary: 'استخراج كشف حساب تفصيلي للعميل (Ledger Statement)' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  getLedger(
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Req() req?: any,
  ) {
    return this.customersService.getLedger(id, from, to, req.user);
  }

  @Get(':id/ledger/pdf')
  @Permission('customers:read')
  @ApiOperation({ summary: 'تصدير كشف حساب العميل بصيغة PDF' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async exportLedgerPdf(
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Res() res?: Response,
    @Req() req?: any,
  ) {
    const ledger = await this.customersService.getLedger(id, from, to, req.user);
    const pdfBuffer = await this.pdfExportService.generateCustomerLedgerPdf(ledger);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="customer-ledger-${id}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);
  }

  @Post(':id/payments')
  @Permission('customers:write')
  @ApiOperation({ summary: 'إصدار سند قبض وتحصيل مديونية من العميل' })
  @ApiResponse({ status: 201, description: 'تم إنشاء سند القبض وتحديث مديونية العميل وقيد اليومية بنجاح' })
  recordPayment(
    @Param('id') id: string,
    @Body() dto: CustomerPaymentDto,
    @Req() req: any,
  ) {
    return this.customersService.recordPayment(id, dto, req.user);
  }

  @Get('receipts/:receiptNumber/pdf')
  @Permission('customers:read')
  @ApiOperation({ summary: 'تصدير سند القبض بصيغة PDF رسمي' })
  async exportReceiptVoucherPdf(
    @Param('receiptNumber') receiptNumber: string,
    @Res() res?: Response,
    @Req() req?: any,
  ) {
    const voucher = await this.customersService.getReceiptVoucher(receiptNumber, req.user);
    const pdfBuffer = await this.pdfExportService.generateReceiptVoucherPdf(voucher);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="receipt-voucher-${receiptNumber}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);
  }

  @Post(':id/validate-credit')
  @Permission('customers:read')
  @ApiOperation({ summary: 'التحقق من سقف الائتمان قبل إتمام عملية البيع الآجل في POS' })
  validateCredit(
    @Param('id') id: string,
    @Body('amount') amount: number,
    @Req() req: any,
  ) {
    return this.customersService.validateCredit(id, Number(amount) || 0, req.user);
  }

  @Put(':id')
  @Permission('customers:write')
  @ApiOperation({ summary: 'تعديل بيانات العميل وسقف الائتمان' })
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto, @Req() req: any) {
    return this.customersService.update(id, dto, req.user);
  }

  @Delete(':id')
  @Permission('customers:delete')
  @ApiOperation({ summary: 'حذف عميل (غير مسموح إذا كان عليه مديونية قائمة)' })
  remove(@Param('id') id: string, @Req() req: any) {
    return this.customersService.remove(id, req.user);
  }
}
