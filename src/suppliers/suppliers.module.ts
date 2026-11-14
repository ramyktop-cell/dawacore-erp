import { Module } from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { SuppliersController } from './suppliers.controller';
import { SupplierStatementsService } from './supplier-statements.service';
import { SupplierDocumentsModule } from '../shared/supplier-documents/supplier-documents.module';
import { SupplierPaymentsService } from './supplier-payments.service';

@Module({
  imports: [SupplierDocumentsModule],
  controllers: [SuppliersController],
  providers: [SuppliersService, SupplierStatementsService, SupplierPaymentsService],
  exports: [SuppliersService, SupplierStatementsService, SupplierPaymentsService],
})
export class SuppliersModule {}
