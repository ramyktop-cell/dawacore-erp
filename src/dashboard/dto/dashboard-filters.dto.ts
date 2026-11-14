import { IsOptional, IsString } from 'class-validator';

export class DashboardFiltersDto {
  @IsString()
  @IsOptional()
  companyId?: string;

  @IsString()
  @IsOptional()
  branchId?: string;

  @IsString()
  @IsOptional()
  date?: string; // تاريخ محدد (افتراضي: اليوم)
}
