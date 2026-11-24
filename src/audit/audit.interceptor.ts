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
    'auth': 'Auth',
    'medicines': 'Medicine',
    'sales': 'Sale',
    'purchases': 'Purchase',
    'purchase-orders': 'PurchaseOrder',
    'returns': 'Return',
    'inventory': 'Inventory',
    'shifts': 'Shift',
    'users': 'User',
    'branches': 'Branch',
    'companies': 'Company',
    'customers': 'Customer',
    'suppliers': 'Supplier',
    'expenses': 'Expense',
    'receipts': 'Receipt',
    'accounts': 'Account',
    'reports': 'Report',
    'audit-logs': 'AuditLog',
    'stock-count': 'StockCount',
    'opening-balance': 'OpeningBalance',
    'batches': 'Batch',
    'dashboard': 'Dashboard',
    'branding': 'Branding',
    'licensing': 'Licensing',
  };

  const methodActionMap: Record<string, string> = {
    POST: 'CREATE',
    PUT: 'UPDATE',
    PATCH: 'UPDATE',
    DELETE: 'DELETE',
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
  if (lastSeg === 'login') action = 'LOGIN';
  else if (lastSeg === 'logout') action = 'LOGOUT';
  else if (lastSeg === 'page-view') action = 'NAVIGATE_SCREEN';
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

        const auditChanges = action === 'NAVIGATE_SCREEN'
          ? { screen: body?.screenName, path: body?.path || url }
          : method !== 'DELETE'
          ? { url, method, bodyKeys: body ? Object.keys(body).filter(k => !k.toLowerCase().includes('password')) : [] }
          : { url, method };

        this.auditService.log({
          companyId: user.companyId,
          branchId: user.branchId,
          userId: user.sub || user.id,
          action,
          entityType: action === 'NAVIGATE_SCREEN' ? 'Screen' : entityType,
          entityId: action === 'NAVIGATE_SCREEN' ? (body?.screenName || 'Unknown') : finalEntityId,
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
