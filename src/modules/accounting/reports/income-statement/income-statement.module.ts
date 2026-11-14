import { Module } from '@nestjs/common';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { IncomeStatementService } from './services/income-statement.service';
import { IncomeStatementExportService } from './services/income-statement-export.service';
import { IncomeStatementController } from './controllers/income-statement.controller';

/**
 * IncomeStatementModule
 * ─────────────────────
 * يجمع كل مكونات تقرير قائمة الدخل.
 */
@Module({
  controllers: [IncomeStatementController],
  providers: [
    PrismaService,
    IncomeStatementService,
    IncomeStatementExportService,
  ],
  exports: [IncomeStatementService],
})
export class IncomeStatementModule {}
