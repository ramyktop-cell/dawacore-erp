import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/security.policy';
import { SupplierDocumentsPdfService } from '../shared/supplier-documents/supplier-documents-pdf.service';

@Injectable()
export class PurchaseDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: SupplierDocumentsPdfService,
  ) {}

  private validateUuid(id: string, fieldName = 'معرف أمر الشراء') {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!id || !uuidRegex.test(id)) {
      throw new BadRequestException(`${fieldName} غير صالح`);
    }
  }

  /**
   * جلب وتأمين بيانات أمر الشراء مع التحقق من نطاق الشركة والفرع
   */
  async getOrderData(id: string, actor: AuthenticatedUser) {
    this.validateUuid(id);

    const order = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        company: { select: { id: true, name: true, currency: true, timezone: true } },
        branch: { select: { id: true, name: true, code: true } },
        supplier: {
          select: {
            id: true,
            name: true,
            companyName: true,
            phone: true,
            taxNumber: true,
            address: true,
          },
        },
        items: {
          include: {
            medicine: { select: { id: true, tradeName: true } },
          },
        },
      },
    });

    if (!order || order.companyId !== actor.companyId || (actor.branchId && order.branchId !== actor.branchId)) {
      throw new NotFoundException('أمر الشراء غير موجود أو لا تملك صلاحية الوصول إليه');
    }

    let creatorName: string | undefined;
    if (order.createdBy) {
      const creator = await this.prisma.user.findFirst({
        where: { id: order.createdBy, companyId: actor.companyId },
        select: { name: true },
      });
      creatorName = creator?.name;
    }

    let receiverName: string | undefined;
    if (order.receivedBy) {
      const receiver = await this.prisma.user.findFirst({
        where: { id: order.receivedBy, companyId: actor.companyId },
        select: { name: true },
      });
      receiverName = receiver?.name;
    }

    return {
      ...order,
      creatorName,
      receiverName,
    };
  }

  /**
   * توليد فاتورة المشتريات / أمر الشراء PDF
   */
  async getPurchaseInvoicePdf(id: string, actor: AuthenticatedUser): Promise<{ buffer: Buffer; filename: string; unicodeFilename: string }> {
    const orderData = await this.getOrderData(id, actor);
    const buffer = await this.pdfService.generatePurchaseInvoicePdf(orderData);
    const cleanNumber = (orderData.orderNumber || id).replace(/[^a-zA-Z0-9_-]/g, '_');
    const prefix = orderData.status === 'RECEIVED' ? 'purchase-invoice' : 'purchase-order';
    const arabicPrefix = orderData.status === 'RECEIVED' ? 'فاتورة_مشتريات' : 'أمر_شراء';
    return {
      buffer,
      filename: `${prefix}-${cleanNumber}.pdf`,
      unicodeFilename: `${arabicPrefix}_${cleanNumber}.pdf`,
    };
  }

  /**
   * توليد مستند الاستلام والتوريد PDF
   * يرفض الطلب برسالة واضحة في حال غياب سجل الاستلام الموثق
   */
  async getReceivingNotePdf(id: string, actor: AuthenticatedUser): Promise<{ buffer: Buffer; filename: string; unicodeFilename: string }> {
    const orderData = await this.getOrderData(id, actor);

    if (orderData.status !== 'RECEIVED' || !orderData.receivedAt) {
      throw new BadRequestException('لا يمكن إصدار مستند استلام وتوريد لأمر شراء لم يتم استلامه وتوثيقه بعد');
    }

    const buffer = await this.pdfService.generateReceivingNotePdf(orderData);
    const cleanNumber = (orderData.orderNumber || id).replace(/[^a-zA-Z0-9_-]/g, '_');
    return {
      buffer,
      filename: `goods-receiving-note-${cleanNumber}.pdf`,
      unicodeFilename: `مستند_استلام_وتوريد_${cleanNumber}.pdf`,
    };
  }
}
