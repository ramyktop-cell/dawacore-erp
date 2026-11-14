import { Module } from '@nestjs/common';
import { PurchasingService } from './purchasing.service';
import { PurchasingController } from './purchasing.controller';
import { PurchaseDocumentsService } from './purchase-documents.service';
import { SupplierDocumentsModule } from '../shared/supplier-documents/supplier-documents.module';

@Module({
  imports: [SupplierDocumentsModule],
  controllers: [PurchasingController],
  providers: [PurchasingService, PurchaseDocumentsService],
  exports: [PurchasingService, PurchaseDocumentsService],
})
export class PurchasingModule {}
