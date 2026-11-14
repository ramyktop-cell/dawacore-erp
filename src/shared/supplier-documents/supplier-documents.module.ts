import { Module } from '@nestjs/common';
import { SupplierDocumentsPdfService } from './supplier-documents-pdf.service';

@Module({
  providers: [SupplierDocumentsPdfService],
  exports: [SupplierDocumentsPdfService],
})
export class SupplierDocumentsModule {}
