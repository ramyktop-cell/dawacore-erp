import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly jwtSecret: string;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
  ) {
    this.jwtSecret =
      this.configService?.get<string>('JWT_SECRET') ||
      'dawacore_secure_jwt_secret_key_2026_pharmacy';
  }

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();
    const url = request.url || '';

    // مسارات Swagger والتوثيق والـ health عامة دائماً
    if (
      url.startsWith('/api/docs') ||
      url.startsWith('/api/swagger') ||
      url.startsWith('/api-json') ||
      url === '/health' ||
      url.startsWith('/health')
    ) {
      return true;
    }

    const authHeader = request.headers.authorization;
    let token: string | undefined;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (request.query?.token) {
      token = String(request.query.token);
    }

    if (isPublic) {
      if (token) {
        try {
          const payload = this.jwtService.verify(token, {
            secret: this.jwtSecret,
          });
          request.user = {
            ...payload,
            id: payload.sub || payload.id,
            permissions: payload.permissions || ['*'],
          };
        } catch {
          // المسار عام، لا نوقف الطلب إن كان الـ Token تالفاً
        }
      }
      return true;
    }

    if (!token) {
      throw new UnauthorizedException('يرجى تسجيل الدخول أولاً للوصول إلى هذا الإجراء');
    }

    try {
      const payload = this.jwtService.verify(token, {
        secret: this.jwtSecret,
      });

      // إرفاق بيانات المستخدم في كائن الطلب لاستخدامها في التحقق من الفروع والشركات
      request.user = {
        ...payload,
        id: payload.sub || payload.id,
        permissions: payload.permissions || ['*'],
      };

      return true;
    } catch (error) {
      throw new UnauthorizedException('جلسة الدخول منتهية أو غير صالحة، يرجى تسجيل الدخول مجدداً');
    }
  }
}
