import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/security.policy';

@Injectable()
export class BranchStockReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private async scope(actor: AuthenticatedUser, requested?: string) {
    if (!actor?.companyId) throw new ForbiddenException('يجب تحديد شركة المستخدم');
    if (actor.branchId && requested && requested !== actor.branchId) throw new ForbiddenException('المخزن خارج نطاق المستخدم');
    const branches = await this.prisma.branch.findMany({
      where: { companyId: actor.companyId, ...(actor.branchId || requested ? { id: actor.branchId || requested } : {}) },
      select: { id: true, name: true, code: true }, orderBy: { name: 'asc' },
    });
    if ((requested || actor.branchId) && !branches.length) throw new ForbiddenException('المخزن غير متاح');
    return branches;
  }

  async valuation(actor: AuthenticatedUser, branchId?: string) {
    const branches = await this.scope(actor, branchId);
    if (!branches.length) return { branches: [], items: [], totals: this.totals([]), generatedAt: new Date() };
    const rows: any[] = await this.prisma.$queryRaw(Prisma.sql`
      WITH latest AS (
        SELECT DISTINCT ON (po."branchId", pi."medicineId")
          po."branchId", pi."medicineId", po."receivedAt", po."orderNumber",
          pi."costPrice" / GREATEST(COALESCE(pi.multiplier, 1), 1) AS "lastBasePurchasePrice"
        FROM "PurchaseItem" pi JOIN "PurchaseOrder" po ON po.id = pi."purchaseOrderId"
        WHERE po.status = 'RECEIVED' AND po."companyId" = ${actor.companyId}
          AND po."branchId" IN (${Prisma.join(branches.map(b => b.id))})
        ORDER BY po."branchId", pi."medicineId", COALESCE(po."receivedAt", po."createdAt") DESC, po.id DESC, pi.id DESC
      )
      SELECT b."branchId", br.name AS "branchName", m.id AS "medicineId", m.code, m."tradeName", m."isWeighed",
        CASE WHEN m."isWeighed" THEN 'كجم' ELSE 'وحدة أساسية' END AS unit,
        SUM(b."quantityInBase") / CASE WHEN m."isWeighed" THEN 1000.0 ELSE 1.0 END AS quantity,
        SUM(b."quantityInBase" * b."costPrice") AS "bookValue",
        SUM(b."quantityInBase" * b."salePrice" / CASE WHEN m."isWeighed" THEN 1000.0 ELSE 1.0 END) AS "saleValue",
        SUM(b."quantityInBase" * b."salePrice" / CASE WHEN m."isWeighed" THEN 1000.0 ELSE 1.0 END)
          / NULLIF(SUM(b."quantityInBase") / CASE WHEN m."isWeighed" THEN 1000.0 ELSE 1.0 END, 0) AS "saleUnitPrice",
        l."lastBasePurchasePrice" * CASE WHEN m."isWeighed" THEN 1000.0 ELSE 1.0 END AS "lastPurchasePrice",
        SUM(b."quantityInBase") * l."lastBasePurchasePrice" AS "marketValue",
        l."receivedAt" AS "lastReceivedAt", l."orderNumber" AS "lastPurchaseNumber"
      FROM "Batch" b JOIN "Branch" br ON br.id = b."branchId" JOIN "Medicine" m ON m.id = b."medicineId"
      LEFT JOIN latest l ON l."branchId" = b."branchId" AND l."medicineId" = b."medicineId"
      WHERE br."companyId" = ${actor.companyId} AND b."branchId" IN (${Prisma.join(branches.map(b => b.id))})
      GROUP BY b."branchId", br.name, m.id, l."lastBasePurchasePrice", l."receivedAt", l."orderNumber"
      HAVING SUM(b."quantityInBase") <> 0
      ORDER BY br.name, m."tradeName", m.id
    `);
    const items = rows.map(r => ({ ...r,
      quantity: Number(r.quantity), bookValue: this.money(r.bookValue), saleValue: this.money(r.saleValue),
      saleUnitPrice: r.saleUnitPrice == null ? null : String(r.saleUnitPrice),
      lastPurchasePrice: r.lastPurchasePrice == null ? null : String(r.lastPurchasePrice),
      marketValue: r.marketValue == null ? null : this.money(r.marketValue),
    }));
    return { generatedAt: new Date(), items, totals: this.totals(items),
      branches: branches.map(b => ({ ...b, totals: this.totals(items.filter(r => r.branchId === b.id)) })),
      basis: 'سعر بيع الدفعة؛ السوقي بآخر سعر شراء مستلم في نفس الفرع دون مصروفات الشراء. سعر البيع المعروض متوسط مرجح عند اختلاف أسعار الدفعات.',
    };
  }

  private money(value: any) { return new Prisma.Decimal(value || 0).toFixed(2); }
  async catalog(actor: AuthenticatedUser, branchId: string, search = '') {
    if (!branchId) throw new BadRequestException('اختر المخزن');
    const branches = await this.scope(actor, branchId);
    return this.prisma.medicine.findMany({where: {
      batches: {some: {branchId: branches[0].id}},
      ...(search ? {OR: [{tradeName: {contains: search.slice(0,100), mode: 'insensitive' as const}}, {code: {contains: search.slice(0,100)}}]} : {}),
    }, select: {id:true, code:true, tradeName:true}, orderBy: {tradeName:'asc'}, take:100});
  }
  private totals(items: any[]) {
    const sum = (key: string) => items.reduce((v, r) => v.plus(r[key] || 0), new Prisma.Decimal(0)).toFixed(2);
    return { bookValue: sum('bookValue'), saleValue: sum('saleValue'), marketValue: sum('marketValue'),
      missingMarketPrices: items.filter(r => r.marketValue == null).length, itemCount: items.length };
  }

  async ledger(actor: AuthenticatedUser, query: {branchId?: string; medicineId?: string; from?: string; to?: string; page?: string}) {
    if (!query.branchId || !query.medicineId) throw new BadRequestException('اختر المخزن والصنف لكشف الحركة');
    const branches = await this.scope(actor, query.branchId);
    const date = (s: string | undefined) => {
      if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new BadRequestException('التاريخ بصيغة YYYY-MM-DD');
      const d = new Date(s + 'T00:00:00.000Z');
      if (!Number.isFinite(+d) || d.toISOString().slice(0, 10) !== s) throw new BadRequestException('تاريخ غير صالح');
      return d;
    };
    // Use the company's timezone for the inclusive local calendar dates.
    const company = await this.prisma.company.findUnique({where: {id: actor.companyId}, select: {timezone: true}});
    date(query.from); date(query.to);
    const { DateTzUtil } = await import('../shared/report-kit/utils/date-tz.util');
    const { from, to } = DateTzUtil.range(query.from!, query.to!, company?.timezone || 'Africa/Cairo');
    if (+from > +to) throw new BadRequestException('تاريخ البداية بعد النهاية');
    const page = query.page == null ? 1 : Number(query.page);
    if (!Number.isInteger(page) || page < 1 || page > 1000000) throw new BadRequestException('رقم الصفحة غير صالح');
    const medicine = await this.prisma.medicine.findFirst({where: {id: query.medicineId, batches: {some: {branchId: branches[0].id}}}, select: {id: true, code: true, tradeName: true, isWeighed: true}});
    if (!medicine) throw new BadRequestException('الصنف ليس له مخزون في هذا الفرع');
    const divisor = medicine.isWeighed ? 1000 : 1;
    return this.prisma.$transaction(async tx => {
      const stats: any[] = await tx.$queryRaw(Prisma.sql`
        WITH batches AS (SELECT id, "quantityInBase" FROM "Batch" WHERE "branchId"=${branches[0].id} AND "medicineId"=${medicine.id}),
        movements AS (SELECT t.* FROM "InventoryTransaction" t JOIN batches b ON b.id=t."batchId" WHERE t."branchId"=${branches[0].id})
        SELECT
          (SELECT COALESCE(SUM("quantityInBase"),0) FROM batches) - COALESCE(SUM(quantity) FILTER (WHERE "createdAt">=${from}),0) AS opening,
          COALESCE(SUM(GREATEST(quantity,0)) FILTER (WHERE "createdAt">=${from} AND "createdAt"<=${to}),0) AS incoming,
          COALESCE(SUM(GREATEST(-quantity,0)) FILTER (WHERE "createdAt">=${from} AND "createdAt"<=${to}),0) AS outgoing,
          COUNT(*) FILTER (WHERE "createdAt">=${from} AND "createdAt"<=${to}) AS count,
          (SELECT COALESCE(SUM("quantityInBase"),0) FROM batches)-COALESCE(SUM(quantity),0) AS "unrecordedOpening"
        FROM movements
      `);
      const s=stats[0];
      const rows: any[] = await tx.$queryRaw(Prisma.sql`
        SELECT t.id, t."createdAt", t."transactionType", t."referenceId", t.notes, b."batchNumber",
          GREATEST(t.quantity,0) AS incoming, GREATEST(-t.quantity,0) AS outgoing,
          ${new Prisma.Decimal(s.opening.toString())} + SUM(t.quantity) OVER (ORDER BY t."createdAt", t.id ROWS UNBOUNDED PRECEDING) AS balance,
          COALESCE(c.name, ic.name, rc.name, sup.name, rsup.name) AS "partyName",
          CASE WHEN t."transactionType"='SALE' AND sale.id IS NOT NULL AND sale."customerId" IS NULL THEN 'عميل نقدي'
            WHEN t."transactionType"='SALE' AND inv.id IS NOT NULL AND inv."customerId" IS NULL THEN 'عميل نقدي'
            WHEN t."transactionType" IN ('SALE_RETURN','DAMAGED_RETURN') AND original.id IS NOT NULL AND original."customerId" IS NULL THEN 'عميل نقدي' ELSE NULL END AS "cashCustomer"
        FROM "InventoryTransaction" t JOIN "Batch" b ON b.id=t."batchId"
        LEFT JOIN "Sale" sale ON t."transactionType"='SALE' AND sale."branchId"=t."branchId" AND (sale.id=t."referenceId" OR sale."invoiceNumber"=t."referenceId")
        LEFT JOIN "Customer" c ON c.id=sale."customerId" AND c."companyId"=${actor.companyId}
        LEFT JOIN "SalesInvoice" inv ON t."transactionType"='SALE' AND inv."branchId"=t."branchId" AND inv."invoiceNumber"=t."referenceId"
        LEFT JOIN "Customer" ic ON ic.id=inv."customerId" AND ic."companyId"=${actor.companyId}
        LEFT JOIN "PurchaseOrder" po ON t."transactionType"='PURCHASE' AND po."branchId"=t."branchId" AND (po.id=t."referenceId" OR po."orderNumber"=t."referenceId")
        LEFT JOIN "Supplier" sup ON sup.id=po."supplierId" AND sup."companyId"=${actor.companyId}
        LEFT JOIN "SaleReturn" sr ON t."transactionType" IN ('SALE_RETURN','DAMAGED_RETURN') AND sr."branchId"=t."branchId" AND (sr.id=t."referenceId" OR sr."returnNumber"=t."referenceId")
        LEFT JOIN "Sale" original ON original.id=sr."originalSaleId"
        LEFT JOIN "Customer" rc ON rc.id=original."customerId" AND rc."companyId"=${actor.companyId}
        LEFT JOIN "PurchaseReturn" pr ON t."transactionType"='PURCHASE_RETURN' AND pr."branchId"=t."branchId" AND (pr.id=t."referenceId" OR pr."returnNumber"=t."referenceId")
        LEFT JOIN "Supplier" rsup ON rsup.id=pr."supplierId" AND rsup."companyId"=${actor.companyId}
        WHERE t."branchId"=${branches[0].id} AND b."branchId"=${branches[0].id} AND b."medicineId"=${medicine.id}
          AND t."createdAt">=${from} AND t."createdAt"<=${to}
        ORDER BY t."createdAt", t.id LIMIT 100 OFFSET ${(page-1)*100}
      `);
      const opening=Number(s.opening)/divisor, incoming=Number(s.incoming)/divisor, outgoing=Number(s.outgoing)/divisor;
      return { branch: branches[0], medicine, unit: medicine.isWeighed ? 'كجم' : 'وحدة أساسية', from: query.from, to: query.to, timezone: company?.timezone,
        opening, incoming, outgoing, closing: opening+incoming-outgoing, total: Number(s.count), page, pageSize: 100,
        openingReconstructed: Number(s.unrecordedOpening)!==0,
        items: rows.map(r => ({...r, incoming:Number(r.incoming)/divisor, outgoing:Number(r.outgoing)/divisor, balance:Number(r.balance)/divisor, partyName:r.partyName || r.cashCustomer || 'غير مرتبط / راجع المرجع'})),
      };
    }, {isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead});
  }
}
