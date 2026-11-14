import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingService } from './accounting.service';
import { AccountingEventListener } from './accounting.listener';

@Injectable()
export class OutboxProcessorService {
  private readonly logger = new Logger(OutboxProcessorService.name);
  private readonly MAX_RETRIES = 3;

  constructor(
    private readonly prisma: PrismaService,
    private readonly accountingService: AccountingService,
    private readonly accountingEventListener: AccountingEventListener,
  ) {}

  /**
   * تشغيل كل دقيقة لمعالجة الأحداث المعلقة في صندوق الصادر المحاسبي
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async processOutbox() {
    // استعادة الأحداث التي بقيت PROCESSING بسبب توقف مفاجئ للخدمة.
    await this.prisma.accountingOutbox.updateMany({
      where: { status: 'PROCESSING', processedAt: { lt: new Date(Date.now() - 10 * 60 * 1000) } },
      data: { status: 'PENDING', processedAt: null, processedBy: null, error: 'Recovered after interrupted processing' },
    });
    const pendingEvents = await this.prisma.accountingOutbox.findMany({
      where: {
        status: 'PENDING',
        retryCount: { lt: this.MAX_RETRIES },
      },
      orderBy: { createdAt: 'asc' },
      take: 10, // معالجة 10 أحداث في كل دورة
    });

    if (pendingEvents.length === 0) {
      return;
    }

    this.logger.debug(`⏳ بدء معالجة ${pendingEvents.length} حدث في صندوق الصادر المحاسبي...`);

    for (const event of pendingEvents) {
      try {
        const claimed = await this.prisma.accountingOutbox.updateMany({
          where: { id: event.id, status: 'PENDING', retryCount: event.retryCount },
          data: { status: 'PROCESSING', processedAt: new Date(), processedBy: 'cron-worker' },
        });
        if (claimed.count !== 1) continue;
        this.logger.log(`🔄 معالجة الحدث: ${event.id} (${event.eventType})`);

        // توجيه الحدث إلى المعالج المناسب (دعم كامل لكافة أحداث صندوق الصادر المحاسبي H07)
        if (event.eventType === 'SALE_COMPLETED') {
          const payload = event.payload as any;
          await this.accountingEventListener.handleSaleCompleted(payload);
        } else if (event.eventType === 'SHIFT_CLOSED' || event.eventType === 'SHIFT_APPROVED') {
          const payload = event.payload as any;
          await this.accountingEventListener.handleShiftDifference(payload);
        } else if (event.eventType === 'SALE_RETURNED') {
          const payload = event.payload as any;
          await this.accountingEventListener.handleSaleReturned({ ...payload, outboxId: event.id });
        } else if (event.eventType === 'STOCK_COUNT_APPROVED') {
          const payload = event.payload as any;
          await this.accountingEventListener.handleStockCountApproved({ ...payload, outboxId: event.id });
        } else if (event.eventType === 'EXPENSE_CREATED') {
          const payload = event.payload as any;
          await this.accountingEventListener.handleExpenseCreated(payload);
        } else if (event.eventType === 'PURCHASE_RECEIVED') {
          const payload = event.payload as any;
          await this.accountingEventListener.handlePurchaseReceived(payload);
        } else if (event.eventType === 'CUSTOMER_PAYMENT_RECEIVED') {
          const payload = event.payload as any;
          await this.accountingEventListener.handleCustomerPaymentReceived({ ...payload, outboxId: event.id });
        } else if (event.eventType === 'RECEIPT_CREATED') {
          const payload = event.payload as any;
          await this.accountingEventListener.handleReceiptCreated(payload);
        } else if (event.eventType === 'RECEIPT_CANCELLED') {
          const payload = event.payload as any;
          await this.accountingEventListener.handleReceiptCancelled({ ...payload, outboxId: event.id });
        } else {
          this.logger.error(`⚠️ نوع الحدث غير معروف في صندوق الصادر المحاسبي: ${event.eventType}`);
          throw new Error(`نوع الحدث غير مدعوم في صندوق الصادر: ${event.eventType}`);
        }

        // تحديث حالة الحدث إلى معالج بشكل ذري وآمن (Idempotent Status Update)
        await this.prisma.accountingOutbox.updateMany({
          where: { id: event.id, status: { not: 'PROCESSED' } },
          data: {
            status: 'PROCESSED',
            processedAt: new Date(),
          },
        });

        this.logger.log(`✅ تم معالجة الحدث بنجاح: ${event.id}`);
      } catch (error: any) {
        const newRetryCount = event.retryCount + 1;
        const status = newRetryCount >= this.MAX_RETRIES ? 'FAILED' : 'PENDING';

        await this.prisma.accountingOutbox.updateMany({
          where: { id: event.id, status: { in: ['PROCESSING', 'PENDING'] } },
          data: {
            retryCount: newRetryCount,
            status: status,
            error: error.message,
            processedAt: status === 'FAILED' ? new Date() : null,
          },
        });

        if (status === 'FAILED') {
          this.logger.error(`❌ فشل الحدث ${event.id} بعد ${this.MAX_RETRIES} محاولات: ${error.message}`);
        } else {
          this.logger.warn(`⚠️ إعادة محاولة الحدث ${event.id} (${newRetryCount}/${this.MAX_RETRIES})`);
        }
      }
    }
  }
}
