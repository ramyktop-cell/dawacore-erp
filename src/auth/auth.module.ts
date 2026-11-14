import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PermissionsGuard } from './guards/permissions.guard';
import { APP_GUARD } from '@nestjs/core';
import { SecurityGuard } from './security.guard';
import { LoginRateGuard } from './login-rate.guard';
import { requireJwtSecret, JWT_ISSUER, JWT_AUDIENCE } from './security.config';

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: requireJwtSecret(configService.get<string>('JWT_SECRET')),
        signOptions: { expiresIn: '8h', algorithm: 'HS256', issuer: JWT_ISSUER, audience: JWT_AUDIENCE },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, PermissionsGuard, LoginRateGuard, { provide: APP_GUARD, useClass: SecurityGuard }],
  exports: [AuthService, JwtModule, PermissionsGuard],
})
export class AuthModule {}
