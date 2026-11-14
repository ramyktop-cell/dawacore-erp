import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Accounting Reports')
@Controller(['accounting/reports', 'reports'])
export class AccountingReportsController {}
