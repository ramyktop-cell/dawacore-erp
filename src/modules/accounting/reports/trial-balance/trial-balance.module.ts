import { Module } from '@nestjs/common';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { TrialBalanceService } from './services/trial-balance.service';
import { TrialBalanceExportService } from './services/trial-balance-export.service';
import { TrialBalanceController } from './controllers/trial-balance.controller';

/**
 * TrialBalanceModule
 * ──────────────────
 * يجمع كل مكونات تقرير ميزان المراجعة.
 */
@Module({
  controllers: [TrialBalanceController],
  providers: [
    PrismaService,
    TrialBalanceService,
    TrialBalanceExportService,
  ],
  exports: [TrialBalanceService],
})
export class TrialBalanceModule {}
