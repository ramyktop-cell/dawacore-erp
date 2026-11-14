import { validateScaleSettings } from '../../../shared/scale-core';
import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Permission } from '../../../auth/security.policy';
import { SettingsService } from '../services/settings.service';
import { UpdateSettingsDto, SingleSettingDto } from '../dto/settings.dto';

@ApiTags('Settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  private cid(req: any): string {
    const id = req.user?.companyId;
    if (!id) throw new UnauthorizedException('جلسة غير صالحة');
    return id;
  }

  @Get()
  @Permission('accounting:read')
  @ApiOperation({ summary: 'جلب جميع إعدادات الشركة' })
  async getAll(@Req() req: any) {
    return this.service.getAll(this.cid(req));
  }

  @Get('scale-barcode')
  @Permission('medicines:read')
  async scaleConfig(@Req() req: any) {
    const raw = await this.service.getValue(this.cid(req), 'scaleBarcodeConfig');
    return validateScaleSettings(raw ? JSON.parse(raw) : {});
  }

  @Get('by-category')
  @Permission('accounting:read')
  @ApiOperation({ summary: 'جلب الإعدادات مصنفة حسب الفئة' })
  async getByCategory(@Req() req: any) {
    return this.service.getByCategory(this.cid(req));
  }

  @Get(':key')
  @Permission('accounting:read')
  @ApiOperation({ summary: 'جلب قيمة إعداد محدد عبر المفتاح' })
  async getOne(@Param('key') key: string, @Req() req: any) {
    return this.service.getValue(this.cid(req), key);
  }

  @Put()
  @Permission('accounting:write')
  @ApiOperation({ summary: 'تحديث مجمع لمجموعة إعدادات' })
  async bulkUpdate(@Body() dto: UpdateSettingsDto, @Req() req: any) {
    return this.service.bulkUpdate(this.cid(req), dto);
  }

  @Put(':key')
  @Permission('accounting:write')
  @ApiOperation({ summary: 'تحديث قيمة إعداد فردي' })
  async updateOne(
    @Param('key') key: string,
    @Body() dto: SingleSettingDto,
    @Req() req: any,
  ) {
    return this.service.updateOne(this.cid(req), key, dto.value);
  }

  @Post('seed-defaults')
  @Permission('accounting:write')
  @ApiOperation({ summary: 'تهيئة الإعدادات الافتراضية للشركة' })
  async seedDefaults(@Req() req: any) {
    return { created: await this.service.seedDefaults(this.cid(req)) };
  }

  @Post('reset-defaults')
  @Permission('accounting:write')
  @ApiOperation({ summary: 'إعادة ضبط كافة الإعدادات إلى القيم الافتراضية' })
  async resetDefaults(@Req() req: any) {
    return this.service.resetDefaults(this.cid(req));
  }
}
