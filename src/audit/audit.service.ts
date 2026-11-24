// src/audit/audit.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Service responsible for writing and reading audit log entries.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Write an audit entry. Failures are silently logged to avoid breaking business logic.
   */
  async log(params: {
    companyId: string;
    branchId?: string;
    userId: string;
    action: string;
    entityType: string;
    entityId: string;
    changes?: any;
    ipAddress?: string;
    userAgent?: string;
  }) {
    const { companyId, branchId, userId, action, entityType, entityId, changes, ipAddress, userAgent } = params;
    try {
      await this.prisma.auditLog.create({
        data: {
          companyId,
          branchId: branchId ?? null,
          userId,
          action,
          entityType,
          entityId,
          changes: changes ?? undefined,
          ipAddress: ipAddress ?? null,
          userAgent: userAgent ?? null,
        },
      });
    } catch (err) {
      console.error('[AuditService] Failed to write audit log:', err);
    }
  }

  /**
   * Query audit logs with pagination and optional filters.
   */
  async findAll(params: {
    page?: number;
    limit?: number;
    action?: string;
    entityType?: string;
    userId?: string;
    companyId?: string;
  }) {
    const { page = 1, limit = 20, action, entityType, userId, companyId } = params;
    const where: any = {};
    if (action) where.action = action;
    if (entityType) where.entityType = entityType;
    if (userId) where.userId = userId;
    if (companyId) where.companyId = companyId;

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
