import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { AccountingReportsController } from './accounting-reports.controller';
import { PdfExportService } from './services/pdf-export.service';
import { ExcelExportService } from './services/excel-export.service';

@Module({
  imports: [PrismaModule],
  controllers: [
    AccountingReportsController,
  ],
  providers: [
    PdfExportService,
    ExcelExportService,
  ],
  exports: [
    PdfExportService,
    ExcelExportService,
  ],
})
export class AccountingReportsModule {}
