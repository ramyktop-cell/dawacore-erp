import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { LicensingService } from './licensing.service';

@Injectable()
export class LicensingGuard implements CanActivate {
  constructor(private readonly licensingService: LicensingService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const path = req.path || '';

    // السماح لمسارات فحص وترخيص النظام ووثائق Swagger بالمرور دائماً
    if (
      path.includes('/licensing') ||
      path.includes('/api/licensing') ||
      path === '/api' ||
      path === '/api/' ||
      path.startsWith('/api/swagger') ||
      path.startsWith('/favicon.ico')
    ) {
      return true;
    }

    const license = this.licensingService.getStatus();
    if (!license.isActivated) {
      throw new ForbiddenException({
        activated: false,
        message: 'النظام غير مفعل على هذا الجهاز. يرجى تفعيل مفتاح الترخيص أولاً.',
        hwid: license.hwid,
      });
    }

    return true;
  }
}
