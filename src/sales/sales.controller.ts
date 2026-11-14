import { Permission, Public } from '../auth/security.policy';
import { Controller, Post, Get, Body, Param, Query, HttpCode, HttpStatus, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { SalesService } from './sales.service';
import { SalesInvoicesService } from './sales-invoices.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { HoldCartDto, ResumeCartDto, ResumeCartBodyDto } from './dto/hold-cart.dto';
import { CreateInvoiceDto, QueryInvoicesDto } from './dto/create-invoice.dto';
import { Res } from '@nestjs/common';
import { Response } from 'express';
import { PdfExportService } from '../modules/accounting/reports/services/pdf-export.service';

@ApiTags('Sales')
@Controller('sales')
export class SalesController {
  constructor(
    private readonly salesService: SalesService,
    private readonly invoicesService: SalesInvoicesService,
    private readonly pdfExportService: PdfExportService,
  ) {}

  // ==================== Sales Invoices ====================

  @Post('invoices')
  @Permission('sales:write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'إنشاء فاتورة مبيعات نظامية وربطها بالوردية والمخزون وحساب العميل' })
  async createInvoice(@Body() dto: CreateInvoiceDto, @Req() req: any) {
    return await this.invoicesService.createInvoice(dto, req.user);
  }

  @Get('invoices')
  @Permission('sales:read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'جلب قائمة فواتير المبيعات مع التصفية' })
  async findAllInvoices(@Query() query: QueryInvoicesDto, @Req() req: any) {
    return await this.invoicesService.findAll(query, req.user);
  }

  @Get('invoices/:id')
  @Permission('sales:read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'جلب تفاصيل فاتورة مبيعات محددة' })
  async findOneInvoice(@Param('id') id: string, @Req() req: any) {
    return await this.invoicesService.findOne(id, req.user);
  }

  @Get('invoices/:id/pdf')
  @Permission('sales:read')
  async invoicePdf(@Param('id') id: string, @Req() req: any, @Res() res: Response) {
    const invoice = await this.invoicesService.findOne(id, req.user);
    const buffer = await this.pdfExportService.generateSalesInvoicePdf(invoice);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="sales-invoice.pdf"' });
    res.end(buffer);
  }

  // ==================== Direct POS Sales ====================

  @Post()
  @Permission('sales:write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'إنشاء عملية بيع سريعة عبر POS مع التحقق من الوردية وسحب FEFO ذري' })
  @ApiResponse({ status: 201, description: 'تم إنشاء الفاتورة بنجاح وتحديث الأرصدة' })
  @ApiResponse({ status: 400, description: 'الوردية مغلقة أو المبلغ المدفوع غير كافٍ' })
  async createSale(@Body() dto: CreateSaleDto, @Req() req: any = {}) {
    return await this.salesService.createSale(dto, req.user);
  }

  @Post('create')
  @Permission('sales:write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'اسم بديل لإنشاء فاتورة بيع جديدة' })
  async createSaleAlias(@Body() dto: CreateSaleDto, @Req() req: any = {}) {
    return await this.salesService.createSale(dto, req.user);
  }

  @Get('held-carts')
  @Permission('sales:read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'جلب الفواتير المعلقة لكاشير معين أو الفرع' })
  @ApiQuery({ name: 'cashierId', required: false })
  async getHeldCarts(@Query('cashierId') cashierId?: string) {
    return await this.salesService.getHeldCarts(cashierId);
  }

  @Post('hold')
  @Permission('sales:write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'تعليق سلة المشتريات الحالية للكاشير' })
  @ApiResponse({ status: 201, description: 'تم تعليق السلة بنجاح' })
  async holdCart(@Body() dto: HoldCartDto) {
    return await this.salesService.holdCart(dto.cashierId, dto.branchId, dto.cartData);
  }

  @Post('resume')
  @Permission('sales:write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'استرجاع سلة مشتريات معلقة باستخدام holdId في جسم الطلب' })
  async resumeCartFromBody(@Body() body: ResumeCartBodyDto) {
    return await this.salesService.resumeCart(body.holdId, body.cashierId);
  }

  @Post('resume/:holdId')
  @Permission('sales:write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'استرجاع سلة مشتريات معلقة واستئناف عملية البيع' })
  @ApiResponse({ status: 200, description: 'تم استرجاع السلة بنجاح' })
  async resumeCart(@Param('holdId') holdId: string, @Body() dto: ResumeCartDto) {
    return await this.salesService.resumeCart(holdId, dto.cashierId);
  }
}
