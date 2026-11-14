import { Controller, Get, Post, Body, Param, Query, Req } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { DashboardFiltersDto } from './dto/dashboard-filters.dto';
import { Permission } from '../auth/security.policy';

@ApiTags('Dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get()
  @Permission('dashboard:read')
  @ApiOperation({ summary: 'جلب بيانات ومؤشرات لوحة تحكم المدير الفورية' })
  getDashboard(@Query() filters: DashboardFiltersDto, @Req() req: any) {
    return this.service.getDashboardData(filters, req.user);
  }

  @Get('overview')
  @Permission('dashboard:read')
  @ApiOperation({ summary: 'جلب نظرة عامة شاملة لمؤشرات الأداء والتنبيهات (Overview)' })
  getOverview(
    @Query('companyId') companyId: string,
    @Query('branchId') branchId?: string,
    @Req() req?: any,
  ) {
    return this.service.getOverview(companyId, branchId, req?.user);
  }

  @Get('dss-recommendations')
  @Permission('dashboard:read')
  @ApiOperation({ summary: 'محرك التوصيات الذكية لدعم اتخاذ القرارات الشرائية والمخزنية (DSS)' })
  getDssRecommendations(
    @Query('companyId') companyId: string,
    @Query('branchId') branchId?: string,
    @Req() req?: any,
  ) {
    return this.service.getDssRecommendations(companyId, branchId, req?.user);
  }

  @Post('security-alerts')
  @Permission('dashboard:read')
  @ApiOperation({ summary: 'تسجيل تنبيه أمني فوري للمدير عند فتح الكونسول أو محاولة التلاعب في نقاط البيع' })
  recordSecurityAlert(@Body() body: any, @Req() req: any) {
    const ipAddress =
      req?.headers?.['x-forwarded-for'] ||
      req?.socket?.remoteAddress ||
      '127.0.0.1';
    const userAgent = req?.headers?.['user-agent'] || 'Unknown Browser';
    return this.service.recordSecurityAlert({
      ...body,
      ipAddress: String(ipAddress),
      userAgent: String(userAgent),
    });
  }

  @Get('security-alerts')
  @Permission('dashboard:read')
  @ApiOperation({ summary: 'جلب التنبيهات الأمنية الخاصة بنقاط البيع للمدير' })
  getSecurityAlerts(
    @Query('companyId') companyId?: string,
    @Query('branchId') branchId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getSecurityAlerts(
      companyId,
      branchId,
      limit ? Number(limit) : 30,
    );
  }

  @Post('security-alerts/acknowledge-all')
  @Permission('dashboard:read')
  @ApiOperation({ summary: 'تأكيد قراءة جميع التنبيهات الأمنية من قبل المدير' })
  acknowledgeAllSecurityAlerts(@Body() body: { managerName?: string; companyId?: string }) {
    return this.service.acknowledgeAllSecurityAlerts(body?.companyId, body?.managerName);
  }

  @Post('security-alerts/:id/acknowledge')
  @Permission('dashboard:read')
  @ApiOperation({ summary: 'تأكيد قراءة ومراجعة تنبيه أمني محدد من قبل المدير' })
  acknowledgeSecurityAlert(
    @Param('id') id: string,
    @Body() body: { managerName?: string },
  ) {
    return this.service.acknowledgeSecurityAlert(id, body?.managerName);
  }

  @Get('audit-logs')
  @Permission('dashboard:read')
  @ApiOperation({ summary: 'جلب سجل الرقابة الشامل ومتابعة حركات المستخدمين والأجهزة وعناوين IP' })
  getAuditLogs(
    @Query('companyId') companyId?: string,
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
    @Query('search') search?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getAuditLogs({
      companyId,
      userId,
      action,
      entityType,
      search,
      dateFrom,
      dateTo,
      limit: limit ? Number(limit) : 120,
    });
  }

  @Post('audit-logs/track')
  @Permission('dashboard:read')
  @ApiOperation({ summary: 'تسجيل حركة تصفح شاشة أو حدث مستخدم مع بيانات الجهاز و IP' })
  trackUserActivity(@Body() body: any, @Req() req: any) {
    const ipAddress =
      req?.headers?.['x-forwarded-for'] ||
      req?.ip ||
      req?.socket?.remoteAddress ||
      '127.0.0.1';
    const userAgent = req?.headers?.['user-agent'] || 'Unknown Device';
    return this.service.trackUserActivity({
      ...body,
      ipAddress: String(ipAddress),
      userAgent: String(userAgent),
    });
  }
}



