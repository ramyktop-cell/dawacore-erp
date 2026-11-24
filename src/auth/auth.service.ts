import { Injectable, UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import * as bcrypt from 'bcryptjs';
import { ChangePasswordDto, LoginDto, VerifyPinDto } from './dto/auth.dto';
import { Role } from '@prisma/client';
import { credentialVersion } from './security.config';
import { AuthenticatedUser } from './security.policy';

export const ALLOWED_BUSINESS_TYPES = [
  'PHARMACY',
  'SUPERMARKET',
  'TRADING',
  'CLOTHING',
] as const;

export type SupportedBusinessType = (typeof ALLOWED_BUSINESS_TYPES)[number];

export function normalizeBusinessType(raw?: string | null): SupportedBusinessType {
  const normalized = (raw || '').trim().toUpperCase();
  if ((ALLOWED_BUSINESS_TYPES as readonly string[]).includes(normalized)) {
    return normalized as SupportedBusinessType;
  }
  return 'PHARMACY';
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService,
  ) {}

  private async matchingUsers(username: string, password: string, companyId?: string) {
    const candidates = await this.prisma.user.findMany({
      where: {
        username: username.trim(),
        isActive: true,
        ...(companyId ? { companyId } : {}),
      },
      include: { company: true, branch: true },
    });
    const matches = [];
    for (const candidate of candidates) {
      if (await bcrypt.compare(password, candidate.passwordHash)) matches.push(candidate);
    }
    return matches;
  }

  private companySelection(users: Array<{ companyId: string; company: { name: string } | null }>) {
    return {
      requiresCompanySelection: true as const,
      companies: users.map((user) => ({ id: user.companyId, name: user.company?.name || 'الشركة' })),
    };
  }

  async changePassword(dto: ChangePasswordDto) {
    if (Buffer.byteLength(dto.newPassword, 'utf8') > 72 || dto.newPassword.length < 12) {
      throw new BadRequestException('كلمة المرور الجديدة يجب أن تكون 12 حرفاً على الأقل وألا تتجاوز 72 بايت');
    }
    const matches = await this.matchingUsers(dto.username, dto.currentPassword, dto.companyId);
    if (matches.length === 0) {
      throw new UnauthorizedException('اسم المستخدم أو كلمة المرور الحالية غير صحيحة أو الحساب معطل');
    }
    if (!dto.companyId && matches.length > 1) return this.companySelection(matches);
    const user = matches[0];
    if (await bcrypt.compare(dto.newPassword, user.passwordHash)) {
      throw new BadRequestException('اختر كلمة مرور جديدة تختلف عن الحالية');
    }
    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    const result = await this.prisma.user.updateMany({
      where: { id: user.id, passwordHash: user.passwordHash, isActive: true },
      data: { passwordHash },
    });
    if (result.count !== 1) throw new UnauthorizedException('تغيرت بيانات الحساب؛ أعد المحاولة بكلمة المرور الحالية');
    // Tokens contain a version derived from passwordHash: existing sessions become invalid.
    return { message: 'تم تغيير كلمة المرور. سجل الدخول بالكلمة الجديدة.' };
  }

  async login(credentials: LoginDto) {
    const matches = await this.matchingUsers(credentials.username, credentials.password, credentials.companyId);
    if (matches.length === 0) {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة أو الحساب معطل');
    }
    if (!credentials.companyId && matches.length > 1) return this.companySelection(matches);
    const user = matches[0];

    let rawBusinessType: string | null = null;
    if (user.companyId && this.prisma.companySetting) {
      const settings = await this.prisma.companySetting.findMany({
        where: {
          companyId: user.companyId,
          key: { in: ['businessType', 'BUSINESS_TYPE'] },
        },
        select: { key: true, value: true },
      });
      const exactMatch = settings.find((s) => s.key === 'businessType');
      const fallbackMatch = settings.find((s) => s.key === 'BUSINESS_TYPE');
      rawBusinessType = exactMatch?.value ?? fallbackMatch?.value ?? null;
    }

    const businessType = normalizeBusinessType(rawBusinessType);
    const companyName = user.company?.name || null;
    const companyLogoUrl = user.company?.logoUrl || null;

    const payload = {
      sub: user.id,
      cv: credentialVersion(user.passwordHash),
      username: user.username,
      name: user.name,
      fullName: user.name,
      companyId: user.companyId,
      companyName,
      companyLogoUrl,
      businessType,
      branchId: user.branchId,
      branchName: user.branch?.name || null,
      role: user.role,
      roles: [user.role],
    };

    const responseData = {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        fullName: user.name,
        email: user.email,
        phone: user.phone,
        companyId: user.companyId,
        companyName,
        companyLogoUrl,
        businessType,
        branchId: user.branchId,
        branchName: user.branch?.name || null,
        role: user.role,
        roles: [user.role],
      },
    };

    // تسجيل الدخول في سجل الرقابة
    await this.auditService.log({
      companyId: user.companyId,
      branchId: user.branchId ?? undefined,
      userId: user.id,
      action: 'USER_LOGIN',
      entityType: 'تسجيل الدخول',
      entityId: user.id,
      changes: {
        userName: user.name,
        userRole: user.role,
        actionLabel: 'تسجيل دخول',
        summary: `قام المستخدم (${user.name}) بتسجيل الدخول للنظام بنجاح`,
      },
    });

    return responseData;
  }

  /**
   * التحقق من كود PIN الخاص بالمدير
   */
  async verifyManagerPin(branchId: string, pin: string, actor: AuthenticatedUser): Promise<boolean> {
    if (!actor || (actor.branchId && actor.branchId !== branchId && actor.role !== Role.SUPER_ADMIN)) return false;
    const managers = await this.prisma.user.findMany({
      where: {
        branchId,
        companyId: actor.role === Role.SUPER_ADMIN ? undefined : actor.companyId,
        role: { in: [Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.BRANCH_MANAGER] },
        isActive: true,
      },
    });

    for (const manager of managers) {
      // Legacy manager credential check only; this result grants no API permission.
      if (await bcrypt.compare(pin, manager.passwordHash)) {
        return true;
      }
    }
    return false;
  }

  /**
   * تفعيل أو تعطيل حساب مستخدم
   */
  async toggleUserStatus(userId: string, isActive: boolean, actor: AuthenticatedUser) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('المستخدم غير موجود');
    if (!actor || (actor.role !== Role.SUPER_ADMIN && (user.companyId !== actor.companyId || user.role === Role.SUPER_ADMIN))) throw new NotFoundException('المستخدم غير موجود');

    return await this.prisma.user.update({
      where: { id: userId },
      data: { isActive },
      select: { id: true, isActive: true },
    });
  }
}
