import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class GlobalAuditInterceptor implements NestInterceptor {
  private cachedCompanyId: string | null = null;

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const httpCtx = context.switchToHttp();
    const req = httpCtx.getRequest();
    if (!req) return next.handle();

    const method = String(req.method || 'GET').toUpperCase();
    const rawUrl = String(req.originalUrl || req.url || '');

    // نسجل فقط العمليات الفعلية (POST, PUT, PATCH, DELETE)
    // مع استثناء نقاط التتبع التي تسجل نفسها يدوياً لمنع التكرار المزدوج
    if (
      method === 'GET' ||
      method === 'OPTIONS' ||
      method === 'HEAD' ||
      rawUrl.includes('/dashboard/security-alerts') ||
      rawUrl.includes('/dashboard/audit-logs')
    ) {
      return next.handle();
    }

    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: (responseBody) => {
          this.recordAuditEntry(req, method, rawUrl, responseBody, Date.now() - startTime).catch(
            () => {
              // لا نعطل العملية الأساسية أبداً في حال حدوث خطأ غير متوقع في سجل التدقيق
            },
          );
        },
      }),
    );
  }

  private async getCompanyId(candidate?: string): Promise<string | null> {
    if (candidate) {
      const found = await this.prisma.company.findUnique({
        where: { id: candidate },
        select: { id: true },
      });
      if (found) return found.id;
    }
    if (this.cachedCompanyId) return this.cachedCompanyId;

    const first = await this.prisma.company.findFirst({ select: { id: true } });
    if (first) {
      this.cachedCompanyId = first.id;
      return first.id;
    }
    return null;
  }

  private async recordAuditEntry(
    req: any,
    method: string,
    rawUrl: string,
    responseBody: any,
    durationMs: number,
  ) {
    const headers = req.headers || {};
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    const decodeHeader = (val: any): string => {
      if (!val) return '';
      try {
        return decodeURIComponent(String(val));
      } catch {
        return String(val);
      }
    };

    const headerUserId = decodeHeader(headers['x-user-id']);
    const headerUserName = decodeHeader(headers['x-user-name']);
    const headerUserRole = decodeHeader(headers['x-user-role']);
    const headerBranchId = decodeHeader(headers['x-branch-id']);
    const headerCompanyId = decodeHeader(headers['x-company-id']);

    // في حالة تسجيل الدخول نستخرج اسم المستخدم من الاستجابة أو الطلب
    const isLogin = rawUrl.includes('/auth/login') || rawUrl.includes('/users/login');

    const userId =
      headerUserId ||
      body.userId ||
      body.cashierId ||
      body.createdBy ||
      responseBody?.user?.id ||
      body.username ||
      'system-user';

    const userName =
      headerUserName ||
      responseBody?.user?.name ||
      body.cashierName ||
      body.username ||
      headerUserId ||
      userId;

    const userRole =
      headerUserRole ||
      responseBody?.user?.role ||
      body.role ||
      'USER';

    const branchId =
      headerBranchId ||
      body.branchId ||
      responseBody?.user?.branchId ||
      null;

    const companyId = await this.getCompanyId(
      headerCompanyId || body.companyId || responseBody?.user?.companyId,
    );
    if (!companyId) return;

    const rawIp =
      headers['x-forwarded-for'] ||
      req.ip ||
      req.socket?.remoteAddress ||
      '127.0.0.1';
    const ipAddress = this.formatIpAddress(String(rawIp));
    const userAgent = String(headers['user-agent'] || 'Unknown Device');
    const deviceSummary = this.parseDeviceSummary(userAgent);

    const { action, actionLabel, entityType, summary } = this.classifyOperation(
      method,
      rawUrl,
      body,
      responseBody,
      isLogin,
    );

    const sanitizedPayload = this.sanitizeBody(body);
    const entityId =
      String(
        responseBody?.id ||
          responseBody?.invoiceNumber ||
          responseBody?.sale?.invoiceNumber ||
          req.params?.id ||
          body?.id ||
          body?.barcode ||
          body?.code ||
          '-',
      ).slice(0, 100);

    await this.prisma.auditLog.create({
      data: {
        companyId,
        branchId: branchId ? String(branchId) : null,
        userId: String(userId),
        action,
        entityType,
        entityId,
        ipAddress,
        userAgent,
        changes: {
          userName,
          userRole,
          actionLabel,
          summary,
          method,
          path: rawUrl,
          deviceSummary,
          durationMs,
          inputData: sanitizedPayload,
          resultSummary: this.extractResultSummary(responseBody),
        },
      },
    });
  }

  private formatIpAddress(ip: string): string {
    const clean = ip.split(',')[0].trim();
    if (clean === '::1' || clean === '127.0.0.1' || clean === '::ffff:127.0.0.1') {
      return '127.0.0.1 (الجهاز الرئيسي)';
    }
    return clean.replace('::ffff:', '');
  }

  private parseDeviceSummary(ua: string): string {
    let os = 'جهاز غير معروف';
    if (ua.includes('Windows NT 10.0')) os = 'Windows 10/11';
    else if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
    else if (ua.includes('Mac OS')) os = 'macOS';
    else if (ua.includes('Linux')) os = 'Linux';

    let browser = 'متصفح';
    if (ua.includes('Edg/')) browser = 'Microsoft Edge';
    else if (ua.includes('Chrome/')) browser = 'Google Chrome';
    else if (ua.includes('Firefox/')) browser = 'Firefox';
    else if (ua.includes('Safari/')) browser = 'Safari';

    return `${os} — ${browser}`;
  }

  private sanitizeBody(body: any): any {
    if (!body || typeof body !== 'object') return {};
    const clone: Record<string, any> = {};
    for (const [key, val] of Object.entries(body)) {
      if (
        key.toLowerCase().includes('password') ||
        key.toLowerCase().includes('secret') ||
        key.toLowerCase().includes('token')
      ) {
        clone[key] = '********';
      } else {
        clone[key] = val;
      }
    }
    return clone;
  }

  private extractResultSummary(res: any): any {
    if (!res || typeof res !== 'object') return null;
    const summary: Record<string, any> = {};
    const keys = [
      'id',
      'invoiceNumber',
      'returnNumber',
      'orderNumber',
      'expenseNumber',
      'countNumber',
      'tradeName',
      'name',
      'username',
      'grandTotal',
      'netAmount',
      'amount',
      'status',
    ];
    for (const k of keys) {
      if (res[k] !== undefined) summary[k] = res[k];
    }
    return Object.keys(summary).length > 0 ? summary : null;
  }

  private classifyOperation(
    method: string,
    url: string,
    body: any,
    res: any,
    isLogin: boolean,
  ): {
    action: string;
    actionLabel: string;
    entityType: string;
    summary: string;
  } {
    const cleanUrl = url.replace(/^\/api/, '').split('?')[0];

    if (isLogin) {
      return {
        action: 'USER_LOGIN',
        actionLabel: 'تسجيل دخول للنظام',
        entityType: 'المصادقة والدخول',
        summary: `تسجيل دخول المستخدم (${body?.username || res?.user?.username || ''}) إلى النظام`,
      };
    }

    // تحديد القسم / الشاشة
    let entityType = 'النظام العام';
    if (cleanUrl.startsWith('/medicines')) entityType = 'الأصناف والمنتجات';
    else if (cleanUrl.startsWith('/batches') || cleanUrl.startsWith('/inventory'))
      entityType = 'التشغيلات والمخزون';
    else if (cleanUrl.startsWith('/sales')) entityType = 'المبيعات ونقاط البيع';
    else if (cleanUrl.startsWith('/returns')) entityType = 'المرتجعات';
    else if (cleanUrl.startsWith('/purchasing')) entityType = 'المشتريات والتوريد';
    else if (cleanUrl.startsWith('/expenses')) entityType = 'المصروفات وسندات الصرف';
    else if (cleanUrl.startsWith('/shifts')) entityType = 'الورديات والصندوق';
    else if (cleanUrl.startsWith('/users')) entityType = 'المستخدمين والصلاحيات';
    else if (cleanUrl.startsWith('/customers')) entityType = 'العملاء والمديونيات';
    else if (cleanUrl.startsWith('/suppliers')) entityType = 'الموردين';
    else if (cleanUrl.startsWith('/accounts') || cleanUrl.startsWith('/accounting'))
      entityType = 'المحاسبة والقيود';
    else if (cleanUrl.startsWith('/settings')) entityType = 'إعدادات النظام';
    else if (cleanUrl.startsWith('/branches')) entityType = 'الفروع';
    else if (cleanUrl.startsWith('/companies')) entityType = 'الشركات';
    else if (cleanUrl.startsWith('/stock-count')) entityType = 'الجرد المخزني';
    else if (cleanUrl.startsWith('/opening-balance')) entityType = 'الأرصدة الافتتاحية';

    // تحديد نوع العملية والوصف العربي الواضح
    if (cleanUrl.includes('/sales/checkout') || cleanUrl.includes('/sales/invoices')) {
      const invNo = res?.invoiceNumber || res?.sale?.invoiceNumber || '';
      const total = res?.grandTotal ?? res?.netAmount ?? body?.grandTotal ?? '';
      return {
        action: 'POS_SALE',
        actionLabel: 'إصدار فاتورة مبيعات',
        entityType: 'المبيعات ونقاط البيع',
        summary: `إصدار فاتورة مبيعات ${invNo ? `رقم (${invNo})` : ''} بقيمة ${total} — عدد الأصناف: ${Array.isArray(body?.items) ? body.items.length : 1}`,
      };
    }

    if (cleanUrl.includes('/sales/hold')) {
      return {
        action: 'CREATE_RECORD',
        actionLabel: 'تعليق فاتورة مبيعات',
        entityType: 'المبيعات ونقاط البيع',
        summary: 'تعليق فاتورة مبيعات مؤقتاً في شاشة الكاشير',
      };
    }

    if (cleanUrl.includes('/shifts/open')) {
      return {
        action: 'CREATE_RECORD',
        actionLabel: 'فتح وردية كاشير',
        entityType: 'الورديات والصندوق',
        summary: `فتح وردية عمل جديدة بعهدة افتتاحية (${body?.openingCash ?? 0})`,
      };
    }

    if (cleanUrl.includes('/shifts') && cleanUrl.includes('close')) {
      return {
        action: 'UPDATE_RECORD',
        actionLabel: 'إغلاق وردية كاشير',
        entityType: 'الورديات والصندوق',
        summary: `إغلاق الوردية وتسليم النقدية الفعلية (${body?.closingCash ?? 0})`,
      };
    }

    if (method === 'POST') {
      const itemName =
        body?.tradeName ||
        body?.name ||
        body?.username ||
        body?.expenseType ||
        body?.description ||
        '';
      return {
        action: 'CREATE_RECORD',
        actionLabel: 'إضافة / إدخال بيانات',
        entityType,
        summary: `إدخال سجل جديد في «${entityType}»${itemName ? `: (${itemName})` : ''} [${cleanUrl}]`,
      };
    }

    if (method === 'PUT' || method === 'PATCH') {
      const targetName =
        body?.tradeName ||
        body?.name ||
        body?.username ||
        body?.key ||
        body?.price ||
        '';
      return {
        action: 'UPDATE_RECORD',
        actionLabel: 'تعديل بيانات',
        entityType,
        summary: `تعديل بيانات في «${entityType}»${targetName ? `: (${targetName})` : ''} [${cleanUrl}]`,
      };
    }

    if (method === 'DELETE') {
      return {
        action: 'DELETE_RECORD',
        actionLabel: 'حذف سجل',
        entityType,
        summary: `حذف سجل من «${entityType}» [${cleanUrl}]`,
      };
    }

    return {
      action: `${method}_OPERATION`,
      actionLabel: `عملية ${method}`,
      entityType,
      summary: `تنفيذ عملية في «${entityType}» [${cleanUrl}]`,
    };
  }
}
