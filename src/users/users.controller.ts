import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permission } from '../auth/security.policy';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Post()
  @Permission('users:write')
  @ApiOperation({ summary: 'إضافة مستخدم جديد وتشفير كلمة المرور وتعيين الدور' })
  @ApiResponse({ status: 201, description: 'تم إنشاء المستخدم بنجاح' })
  create(@Body() dto: CreateUserDto, @CurrentUser() currentUser?: any) {
    return this.service.create(dto, currentUser);
  }

  @Get()
  @Permission('users:read')
  @ApiOperation({ summary: 'استعراض قائمة المستخدمين مع التصفية والبحث والترقيم' })
  @ApiQuery({ name: 'companyId', required: false })
  @ApiQuery({ name: 'branchId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'role', enum: Role, required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @CurrentUser() currentUser?: any,
    @Query('companyId') companyId?: string,
    @Query('branchId') branchId?: string,
    @Query('search') search?: string,
    @Query('role') role?: Role,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll(
      {
        companyId,
        branchId,
        search,
        role,
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 20,
      },
      currentUser,
    );
  }

  @Get(':id')
  @Permission('users:read')
  @ApiOperation({ summary: 'عرض تفاصيل مستخدم محدد' })
  findOne(@Param('id') id: string, @CurrentUser() currentUser?: any) {
    return this.service.findOne(id, currentUser);
  }

  @Put(':id')
  @Permission('users:write')
  @ApiOperation({ summary: 'تعديل بيانات المستخدم وكلمة المرور' })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() currentUser?: any) {
    return this.service.update(id, dto, currentUser);
  }

  @Delete(':id')
  @Permission('users:write')
  @ApiOperation({ summary: 'حذف مستخدم' })
  remove(@Param('id') id: string, @CurrentUser() currentUser?: any) {
    return this.service.remove(id, currentUser);
  }
}
