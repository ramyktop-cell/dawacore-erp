import { Injectable, UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { ChangePasswordDto, LoginDto, VerifyPinDto } from './dto/auth.dto';
import { Role } from '@prisma/client';
import { credentialVersion } from './security.config';
import { AuthenticatedUser } from './security.policy';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async changePassword(dto: ChangePasswordDto) {
    if (Buffer.byteLength(dto.newPassword, 'utf8') > 72 || dto.newPassword.length < 12) {
      throw new BadRequestException('كلمة المرور الجديدة يجب أن تكون 12 حرفاً على الأقل وألا تتجاوز 72 بايت');
    }
    const user = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (!user?.isActive || !(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('اسم المستخدم أو كلمة المرور الحالية غير صحيحة أو الحساب معطل');
    }
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
    const user = await this.prisma.user.findUnique({
      where: { username: credentials.username },
      include: {
        company: true,
        branch: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة أو الحساب معطل');
    }

    const isMatch = await bcrypt.compare(credentials.password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }

    const payload = {
      sub: user.id,
      cv: credentialVersion(user.passwordHash),
      username: user.username,
      name: user.name,
      fullName: user.name,
      companyId: user.companyId,
      companyName: user.company?.name,
      branchId: user.branchId,
      branchName: user.branch?.name || null,
      role: user.role,
      roles: [user.role],
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        fullName: user.name,
        email: user.email,
        phone: user.phone,
        companyId: user.companyId,
        companyName: user.company?.name,
        branchId: user.branchId,
        branchName: user.branch?.name || null,
        role: user.role,
        roles: [user.role],
      },
    };
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
