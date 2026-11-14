import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.get<string[]>(PERMISSIONS_KEY, context.getHandler());
    if (!requiredPermissions) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.permissions) {
      throw new ForbiddenException('ليس لديك صلاحية لتنفيذ هذا الإجراء');
    }

    // المشرف العام يمتلك كل الصلاحيات
    if (user.roles?.includes('SUPER_ADMIN')) return true;

    const hasPermission = requiredPermissions.every((perm) => {
      const modulePrefix = perm.split(':')[0] + ':*';
      return user.permissions.includes(perm) || user.permissions.includes(modulePrefix);
    });

    if (!hasPermission) {
      throw new ForbiddenException('صلاحياتك الحالية لا تسمح بالوصول لهذا المورد');
    }

    return true;
  }
}
