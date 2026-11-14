import { Permission, Public } from '../auth/security.policy';
import { Controller, Post, Get, Patch, Body, Param, Query, HttpCode, HttpStatus, Req, Res } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PurchasingService } from './purchasing.service';
import { PurchaseDocumentsService } from './purchase-documents.service';
import { CreatePurchaseOrderDto, QueryPurchaseOrdersDto } from './dto/create-purchase.dto';

@ApiTags('Purchasing')
@Controller('purchasing')
export class PurchasingController {
  constructor(
    private readonly purchasingService: PurchasingService,
    private readonly documentsService: PurchaseDocumentsService,
  ) {}

  @Post('orders')
  @Permission('purchasing:write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'إنشاء مسودة أمر شراء جديد (PENDING)' })
  async createOrder(@Body() dto: CreatePurchaseOrderDto, @Req() req: any) {
    const userId = req.user.id;
    return await this.purchasingService.create(dto, userId, req.user);
  }

  @Post('receive')
  @Permission('purchasing:write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'توريد واستلام بضاعة مباشرة وتحديث الدفعات والمخزون' })
  async directReceive(@Body() dto: CreatePurchaseOrderDto, @Req() req: any) {
    const userId = req.user.id;
    return await this.purchasingService.directReceive(dto, userId, req.user);
  }

  @Post('orders/:id/receive')
  @Permission('purchasing:write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'استلام أمر شراء معلق وتحديث المخزون والدفعات والمديونية' })
  async receiveOrder(@Param('id') id: string, @Req() req: any) {
    const userId = req.user.id;
    return await this.purchasingService.receiveOrder(id, userId, req.user);
  }

  @Get('orders')
  @Permission('purchasing:read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'جلب قائمة أوامر الشراء مع التصفية والبحث' })
  async findAll(@Query() query: QueryPurchaseOrdersDto, @Req() req: any) {
    return await this.purchasingService.findAll(query, req.user);
  }

  @Get('orders/:id/invoice-pdf')
  @Permission('purchasing:read')
  @ApiOperation({ summary: 'تصدير فاتورة المشتريات / أمر الشراء PDF' })
  async exportInvoicePdf(
    @Param('id') id: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const { buffer, filename, unicodeFilename } = await this.documentsService.getPurchaseInvoicePdf(id, req.user);
    const encodedUnicode = encodeURIComponent(unicodeFilename);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"; filename*=UTF-8''${encodedUnicode}`,
      'Cache-Control': 'private, no-store',
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get('orders/:id/receiving-note-pdf')
  @Permission('purchasing:read')
  @ApiOperation({ summary: 'تصدير مستند الاستلام والتوريد PDF' })
  async exportReceivingNotePdf(
    @Param('id') id: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const { buffer, filename, unicodeFilename } = await this.documentsService.getReceivingNotePdf(id, req.user);
    const encodedUnicode = encodeURIComponent(unicodeFilename);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"; filename*=UTF-8''${encodedUnicode}`,
      'Cache-Control': 'private, no-store',
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get('orders/:id')
  @Permission('purchasing:read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'جلب تفاصيل أمر شراء محدد' })
  async findOne(@Param('id') id: string, @Req() req: any) {
    return await this.purchasingService.findOne(id, req.user);
  }

  @Patch('orders/:id/cancel')
  @Permission('purchasing:write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'إلغاء أمر شراء معلق' })
  async cancelOrder(@Param('id') id: string, @Req() req: any) {
    return await this.purchasingService.cancelOrder(id, req.user);
  }
}
