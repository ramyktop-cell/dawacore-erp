import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_ROUTE, PERMISSION, POLICY } from './security.policy';
import { credentialVersion, JWT_AUDIENCE, JWT_ISSUER } from './security.config';

@Injectable()
export class SecurityGuard implements CanActivate {
 constructor(private readonly reflector: Reflector, private readonly jwt: JwtService, private readonly prisma: PrismaService) {}
 async canActivate(context: ExecutionContext): Promise<boolean> {
  if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [context.getHandler(), context.getClass()])) return true;
  const request = context.switchToHttp().getRequest();
  const authorization = request.headers.authorization;
  if (typeof authorization !== 'string' || !/^Bearer \S+$/i.test(authorization)) throw new UnauthorizedException('تسجيل الدخول مطلوب');
  let claims: { sub: string; cv: string };
  try {
   claims = await this.jwt.verifyAsync(authorization.slice(7), { algorithms: ['HS256'], issuer: JWT_ISSUER, audience: JWT_AUDIENCE });
   if (!claims || typeof claims.sub !== 'string' || typeof claims.cv !== 'string') throw new Error('Invalid claims');
  } catch { throw new UnauthorizedException('الجلسة غير صالحة أو انتهت؛ يرجى تسجيل الدخول'); }
  const user = await this.prisma.user.findUnique({ where: { id: claims.sub }, select: { id: true, role: true, companyId: true, branchId: true, isActive: true, passwordHash: true } });
  if (!user?.isActive || claims.cv !== credentialVersion(user.passwordHash)) throw new UnauthorizedException('الجلسة غير صالحة');
  request.user = { id: user.id, companyId: user.companyId, branchId: user.branchId, role: user.role, roles: [user.role] };
  const permission = this.reflector.getAllAndOverride<string>(PERMISSION, [context.getHandler(), context.getClass()]);
  // Even a super administrator cannot access an unclassified new endpoint.
  if (!permission || !POLICY[permission]?.includes(user.role)) throw new ForbiddenException('ليس لديك صلاحية لتنفيذ هذا الإجراء');
  return true;
 }
}
