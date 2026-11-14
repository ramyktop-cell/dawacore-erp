import { Permission } from '../auth/security.policy';
import { Controller, Get, Post, Put, Delete, Body, Param, Query, HttpCode, HttpStatus, Req, Res } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SuppliersService } from './suppliers.service';
import { SupplierStatementsService } from './supplier-statements.service';
import { CreateSupplierDto, UpdateSupplierDto, QuerySuppliersDto } from './dto/create-supplier.dto';
import { SupplierStatementQueryDto, CreditorsReportQueryDto } from './dto/supplier-statement-query.dto';
import { SupplierPaymentsService } from './supplier-payments.service';
import { CreateSupplierPaymentDto, OutstandingSupplierInvoicesQueryDto } from './dto/supplier-payment.dto';

@ApiTags('Suppliers')
@Controller('suppliers')
export class SuppliersController {
  constructor(
    private readonly suppliersService: SuppliersService,
    private readonly statementService: SupplierStatementsService,
    private readonly paymentsService: SupplierPaymentsService,
  ) {}

  @Post()
  @Permission('suppliers:write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'إضافة مورد جديد' })
  async create(@Body() dto: CreateSupplierDto, @Req() req: any) {
    return await this.suppliersService.create(dto, req.user);
  }

  // ============================================
  // Creditors Report (قبل :id لمنع تداخل المسارات)
  // ============================================
  @Get('creditors')
  @Permission('reports:read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'تقرير أرصدة الدائنين والموردين (Creditors Report)' })
  async getCreditorsReport(@Query() query: CreditorsReportQueryDto, @Req() req: any) {
    return await this.statementService.getCreditorsReport(query, req.user);
  }

  @Get('creditors/pdf')
  @Permission('reports:read')
  @ApiOperation({ summary: 'تصدير تقرير الدائنين والموردين PDF' })
  async getCreditorsReportPdf(@Query() query: CreditorsReportQueryDto, @Req() req: any, @Res() res: Response) {
    const { buffer, filename, unicodeFilename } = await this.statementService.getCreditorsReportPdf(query, req.user);
    const encodedUnicode = encodeURIComponent(unicodeFilename);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"; filename*=UTF-8''${encodedUnicode}`,
      'Cache-Control': 'private, no-store',
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get()
  @Permission('suppliers:read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'عرض قائمة الموردين' })
  async findAll(@Query() query: QuerySuppliersDto, @Req() req: any) {
    return await this.suppliersService.findAll(query, req.user);
  }

  @Get('payments/:paymentId')
  @Permission('supplier-payments:read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'عرض سند سداد مورد' })
  async getSupplierPayment(@Param('paymentId') paymentId: string, @Req() req: any) {
    return this.paymentsService.getPayment(paymentId, req.user);
  }

  @Get('payments/:paymentId/pdf')
  @Permission('supplier-payments:read')
  @ApiOperation({ summary: 'تنزيل سند سداد المورد PDF' })
  async getSupplierPaymentPdf(
    @Param('paymentId') paymentId: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const { buffer, filename, unicodeFilename } = await this.paymentsService.getPaymentPdf(paymentId, req.user);
    const encodedUnicode = encodeURIComponent(unicodeFilename);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"; filename*=UTF-8''${encodedUnicode}`,
      'Cache-Control': 'private, no-store',
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  // ============================================
  // Supplier Account Statement
  // ============================================
  @Get(':id/statement')
  @Permission('reports:read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'كشف حساب مورد تفصيلي' })
  async getSupplierStatement(
    @Param('id') id: string,
    @Query() query: SupplierStatementQueryDto,
    @Req() req: any,
  ) {
    return await this.statementService.getSupplierStatement(id, query, req.user);
  }

  @Get(':id/statement/pdf')
  @Permission('reports:read')
  @ApiOperation({ summary: 'تصدير كشف حساب مورد PDF' })
  async getSupplierStatementPdf(
    @Param('id') id: string,
    @Query() query: SupplierStatementQueryDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const { buffer, filename, unicodeFilename } = await this.statementService.getSupplierStatementPdf(id, query, req.user);
    const encodedUnicode = encodeURIComponent(unicodeFilename);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"; filename*=UTF-8''${encodedUnicode}`,
      'Cache-Control': 'private, no-store',
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get(':id/outstanding-invoices')
  @Permission('supplier-payments:read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'فواتير المورد المستحقة المتاحة للسداد' })
  async getOutstandingInvoices(
    @Param('id') id: string,
    @Query() query: OutstandingSupplierInvoicesQueryDto,
    @Req() req: any,
  ) {
    return this.paymentsService.getOutstandingInvoices(id, query, req.user);
  }

  @Post(':id/payments')
  @Permission('supplier-payments:write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'إنشاء سند سداد للمورد وتوزيعه على الفواتير' })
  async createSupplierPayment(
    @Param('id') id: string,
    @Body() dto: CreateSupplierPaymentDto,
    @Req() req: any,
  ) {
    return this.paymentsService.createPayment(id, dto, req.user);
  }

  @Get(':id')
  @Permission('suppliers:read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'عرض تفاصيل مورد محدد' })
  async findOne(@Param('id') id: string, @Req() req: any) {
    return await this.suppliersService.findOne(id, req.user);
  }

  @Put(':id')
  @Permission('suppliers:write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'تعديل بيانات مورد' })
  async update(@Param('id') id: string, @Body() dto: UpdateSupplierDto, @Req() req: any) {
    return await this.suppliersService.update(id, dto, req.user);
  }

  @Delete(':id')
  @Permission('suppliers:write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'حذف مورد' })
  async remove(@Param('id') id: string, @Req() req: any) {
    return await this.suppliersService.remove(id, req.user);
  }
}
