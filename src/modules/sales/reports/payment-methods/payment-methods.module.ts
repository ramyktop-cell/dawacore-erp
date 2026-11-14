import { Module } from '@nestjs/common';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { PaymentMethodsService } from './services/payment-methods.service';
import { PaymentMethodsExportService } from './services/payment-methods-export.service';
import { PaymentMethodsController } from './controllers/payment-methods.controller';

/**
 * PaymentMethodsModule
 * ────────────────────
 * يجمع كل مكونات تقرير طرق الدفع والتحصيل.
 */
@Module({
  controllers: [PaymentMethodsController],
  providers: [
    PrismaService,
    PaymentMethodsService,
    PaymentMethodsExportService,
  ],
  exports: [PaymentMethodsService, PaymentMethodsExportService],
})
export class PaymentMethodsModule {}
