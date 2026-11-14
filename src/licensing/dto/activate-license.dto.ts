import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ActivateLicenseDto {
  @ApiProperty({
    description: 'مفتاح الترخيص المشفر المقدم من المطور',
    example: 'eyJ...==.A1B2C3D4E5F6',
  })
  @IsString({ message: 'مفتاح الترخيص يجب أن يكون نصاً صالحاً' })
  @IsNotEmpty({ message: 'يرجى إدخال مفتاح الترخيص' })
  licenseKey: string;
}
