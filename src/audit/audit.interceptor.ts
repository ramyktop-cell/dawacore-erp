// src/audit/audit.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { AuditService } from './audit.service';
import { Request } from 'express';

/**
 * Maps HTTP method + route pattern → { action, entityType }
 */
function resolveAuditMeta(method: string, url: string): { action: string; entityType: string; entityId: string } {
  // Strip query string
  const path = url.split('?')[0];
  const segments = path.replace(/^\//, '').split('/');

  // Map URL segments → entity names (Arabic-friendly)
  const entityMap: Record<string, string> = {
    'auth': 'المصادقة والمستخدمين',
    'medicines': 'دليل الأدوية والأصناف',
    'sales': 'فواتير المبيعات',
    'purchases': 'فواتير المشتريات والتوريد',
    'purchase-orders': 'أوامر الشراء',
    'returns': 'مرتجع المبيعات',
    'inventory': 'المخزون وحركات المستودع',
    'shifts': 'الورديات والخزينة',
    'users': 'إدارة المستخدمين والصلاحيات',
    'branches': 'إدارة الفروع',
    'companies': 'الشركات والكيانات',
    'customers': 'حسابات العملاء',
    'suppliers': 'إدارة الموردين',
    'expenses': 'سندات الصرف والمصروفات',
    'receipts': 'سندات القبض والإيرادات',
    'accounts': 'شجرة الحسابات والقيود',
    'reports': 'التقارير المالية والمحاسبية',
    'audit-logs': 'سجل الرقابة',
    'stock-count': 'الجرد والتسويات',
    'opening-balance': 'الأرصدة الافتتاحية',
    'batches': 'التشغيلات والصلاحيات',
    'dashboard': 'لوحة التحكم',
    'branding': 'الهوية البصرية',
    'licensing': 'التراخيص والتفعيل',
  };

  const methodActionMap: Record<string, string> = {
    POST: 'CREATE_RECORD',
    PUT: 'UPDATE_RECORD',
    PATCH: 'UPDATE_RECORD',
    DELETE: 'DELETE_RECORD',
    GET: 'VIEW',
  };

  // Find first matching segment as the entity
  let entityType = 'Unknown';
  let entityId = '';
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (entityMap[seg]) {
      entityType = entityMap[seg];
      // The next segment (if UUID-like) is the entity ID
      const next = segments[i + 1];
      if (next && /^[a-f0-9-]{8,}$/i.test(next)) {
        entityId = next;
      }
      break;
    }
  }

  // Special sub-actions
  let action = methodActionMap[method] || method;
  const lastSeg = segments[segments.length - 1];
  if (lastSeg === 'login') action = 'USER_LOGIN';
  else if (lastSeg === 'logout') action = 'USER_LOGOUT';
  else if (lastSeg === 'page-view') action = 'SCREEN_VIEW';
  else if (lastSeg === 'bulk-import' || lastSeg === 'import') action = 'IMPORT';
  else if (lastSeg === 'approve') action = 'APPROVE';
  else if (lastSeg === 'reject') action = 'REJECT';
  else if (lastSeg === 'open') action = 'OPEN';
  else if (lastSeg === 'close') action = 'CLOSE';
  else if (lastSeg === 'void' || lastSeg === 'cancel') action = 'VOID';
  else if (lastSeg === 'change-password') action = 'CHANGE_PASSWORD';
  else if (lastSeg === 'toggle-status') action = 'TOGGLE_STATUS';
  else if (lastSeg === 'verify-pin') action = 'VERIFY_PIN';

  return { action, entityType, entityId };
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest<Request>();
    const method = req.method;
    const url = req.url;

    // Skip GET requests (too noisy; enable if needed) + skip audit-logs itself
    const skipGet = method === 'GET';
    const isAuditRoute = url.includes('/audit-logs');
    if (skipGet || isAuditRoute) {
      return next.handle();
    }

    const { action, entityType, entityId } = resolveAuditMeta(method, url);

    // Extract user from request (populated by JwtAuthGuard)
    const user: any = (req as any).user;
    if (!user?.companyId) {
      // Not authenticated (e.g., login route) — will log after response
      return next.handle().pipe(
        tap((res: any) => {
          // For login: response contains user info
          if (action === 'LOGIN' && res?.user) {
            const u = res.user;
            this.auditService.log({
              companyId: u.companyId,
              branchId: u.branchId,
              userId: u.id,
              action: 'LOGIN',
              entityType: 'Auth',
              entityId: u.id,
              changes: { username: u.username, role: u.role },
              ipAddress: req.ip,
              userAgent: req.headers['user-agent'],
            });
          }
        }),
      );
    }

    // Extract entity ID from body if not in URL
    const body: any = req.body;
    const resolvedEntityId = entityId
      || (body?.id as string)
      || (body?.medicineId as string)
      || (body?.saleId as string)
      || '';

    return next.handle().pipe(
      tap((res: any) => {
        // Use ID from response if still empty
        const finalEntityId = resolvedEntityId
          || (res?.id as string)
          || (res?.data?.id as string)
          || '';

        const auditChanges = action === 'SCREEN_VIEW'
          ? {
              screenName: body?.screenName,
              path: body?.path || url,
              userName: user?.name || user?.username,
              userRole: user?.role,
              actionLabel: 'دخول وتصفح شاشة',
              summary: `دخل المستخدم (${user?.name || user?.username}) إلى شاشة «${body?.screenName || body?.path || url}»`,
            }
          : {
              url,
              method,
              userName: user?.name || user?.username,
              userRole: user?.role,
              actionLabel:
                action === 'CREATE_RECORD' ? '➕ إدخال / إضافة جديدة' :
                action === 'UPDATE_RECORD' ? '✏️ تعديل بيانات' :
                action === 'DELETE_RECORD' ? '🗑️ حذف سجل' : action,
              summary:
                action === 'CREATE_RECORD' ? `قام المستخدم (${user?.name || user?.username}) بإضافة سجل جديد في (${entityType})` :
                action === 'UPDATE_RECORD' ? `قام المستخدم (${user?.name || user?.username}) بتعديل بيانات في (${entityType})` :
                action === 'DELETE_RECORD' ? `قام المستخدم (${user?.name || user?.username}) بحذف سجل من (${entityType})` :
                `${action} في (${entityType})`,
              bodyKeys: method !== 'DELETE' && body ? Object.keys(body).filter(k => !k.toLowerCase().includes('password')) : [],
            };

        this.auditService.log({
          companyId: user.companyId,
          branchId: user.branchId,
          userId: user.sub || user.id,
          action,
          entityType: action === 'SCREEN_VIEW' ? 'تصفح الشاشات' : entityType,
          entityId: action === 'SCREEN_VIEW' ? (body?.screenName || 'Unknown') : finalEntityId,
          changes: auditChanges,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });
      }),
      catchError((err: any) => {
        // Log failed attempts too
        this.auditService.log({
          companyId: user.companyId,
          branchId: user.branchId,
          userId: user.sub || user.id,
          action: `${action}_FAILED`,
          entityType,
          entityId: resolvedEntityId,
          changes: { error: err?.message, url },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });
        return throwError(() => err);
      }),
    );
  }
}
