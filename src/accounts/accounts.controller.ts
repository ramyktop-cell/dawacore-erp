import { Permission, Public } from '../auth/security.policy';
import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

@ApiTags('Accounts')
@Controller('accounts')
export class AccountsController {
  constructor(private readonly service: AccountsService) {}

  @Post()
  @Permission('accounts:write')
  @ApiOperation({ summary: 'إنشاء حساب جديد مع فحص المستوى والتسلسل الهرمي' })
  create(@Body() dto: CreateAccountDto, @Req() req: any) {
    return this.service.create(dto, req.user.companyId, req.user.branchId);
  }

  @Get('tree')
  @Permission('accounts:read')
  @ApiOperation({ summary: 'جلب شجرة الحسابات الهرمية مع تجميع الأرصدة التراكمية' })
  getTree(
    @Query('companyId') companyId: string,
    @Query('branchId') branchId?: string,
    @Req() req?: any,
  ) {
    return this.service.getTree(req.user.companyId, req.user.branchId || branchId);
  }

  @Get()
  @Permission('accounts:read')
  @ApiOperation({ summary: 'جلب قائمة الحسابات للقوائم والبحث' })
  findAll(
    @Query('companyId') companyId: string,
    @Query('isLeaf') isLeaf?: string,
    @Query('type') type?: string,
    @Query('level') level?: string,
    @Req() req?: any,
  ) {
    const isLeafBool = isLeaf !== undefined ? isLeaf === 'true' : undefined;
    const levelNum = level ? parseInt(level, 10) : undefined;
    return this.service.findAll(req.user.companyId, { isLeaf: isLeafBool, type, level: levelNum });
  }

  @Get(':id')
  @Permission('accounts:read')
  @ApiOperation({ summary: 'جلب تفاصيل حساب واحد مع أبنائه' })
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.service.findOneWithChildren(id, req.user.companyId);
  }

  @Put(':id')
  @Permission('accounts:write')
  @ApiOperation({ summary: 'تحديث بيانات الحساب' })
  update(@Param('id') id: string, @Body() dto: UpdateAccountDto, @Req() req: any) {
    return this.service.update(id, dto, req.user.companyId);
  }

  @Delete(':id')
  @Permission('accounts:write')
  @ApiOperation({ summary: 'حذف حساب غير مرتبط بحركات أو أبناء' })
  remove(@Param('id') id: string, @Req() req: any) {
    return this.service.remove(id, req.user.companyId);
  }
}
