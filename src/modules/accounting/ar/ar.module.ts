import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { ArAllocationService } from './services/ar-allocation.service';

/**
 * ArModule
 * ────────
 * خدمات الحسابات المدينة (Accounts Receivable).
 *
 * يُصدَّر:
 *   - ArAllocationService (لتوزيع الدفعات على الفواتير بنظام FIFO)
 */
@Module({
  imports: [PrismaModule],
  providers: [ArAllocationService],
  exports: [ArAllocationService],
})
export class ArModule {}
