import { Prisma } from '@prisma/client';

export function customerLedgerAmount(type: string, amount: any): Prisma.Decimal {
  const value = new Prisma.Decimal(amount ?? 0);
  if (['PAYMENT', 'RETURN', 'SALE_RETURN'].includes(type)) return value.abs().negated();
  if (type === 'SALE') return value.abs();
  return value;
}
