import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AccountingService } from './accounting.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AccountingEventListener {
  private readonly logger = new Logger(AccountingEventListener.name);

  constructor(
    private readonly accountingService: AccountingService,
    private readonly prisma: PrismaService,
  ) {}


  // ------------------- 1. قيد استلام المشتريات -------------------
  // ------------------- 1. قيد استلام المشتريات -------------------
  @OnEvent('purchase.received')
  async handlePurchaseReceived(payload: {
    purchaseOrderId: string;
    orderNumber?: string;
    companyId: string;
    branchId: string;
    supplierId: string;
    totalCost: number;
    paidAmount: number;
    remainingDebt: number;
    additionalExpenses?: number;
    expenseAllocationMethod?: 'LANDED_COST' | 'PERIOD_EXPENSE';
    expenseNotes?: string;
    createdBy?: string;
  }) {
    try {
      const additionalExp = Number(payload.additionalExpenses || 0);
      const isLandedCost = (payload.expenseAllocationMethod || 'LANDED_COST') === 'LANDED_COST';
      const lines: Array<{ accountCode: string; debit: number; credit: number; notes?: string }> = [];

      // 1. طرف المدين
      if (additionalExp > 0) {
        if (isLandedCost) {
          // الخيار الأساسي (Landed Cost): تحميل المخزون بكامل التكلفة المنزلة
          lines.push({
            accountCode: '1104',
            debit: payload.totalCost,
            credit: 0,
            notes: 'توريد مخزون أدوية (سعر الشراء الأساسي)',
          });
          lines.push({
            accountCode: '1104',
            debit: additionalExp,
            credit: 0,
            notes: `تكاليف إضافية ورسملة مخزون (نولون/عتالة/رسوم) - ${payload.expenseNotes || 'شحن وتفريغ'}`,
          });
        } else {
          // الخيار الأول (Period Expense): المخزون بالقيمة الأصلية + إثبات المصروف في قائمة الدخل
          lines.push({
            accountCode: '1104',
            debit: payload.totalCost,
            credit: 0,
            notes: 'توريد مخزون أدوية',
          });
          lines.push({
            accountCode: '5204', // مصاريف نقل ومشتريات وعتالة تشغيلية
            debit: additionalExp,
            credit: 0,
            notes: `مصاريف نقل وعتالة ورسوم مشتريات (تشغيلية) - ${payload.expenseNotes || 'نولون ورسوم'}`,
          });
        }
      } else {
        lines.push({
          accountCode: '1104',
          debit: payload.totalCost,
          credit: 0,
          notes: 'توريد مخزون أدوية',
        });
      }

      // 2. طرف الدائن للمورد
      if (payload.paidAmount > 0) {
        lines.push({
          accountCode: '1101',
          debit: 0,
          credit: payload.paidAmount,
          notes: 'سداد نقدي من الصندوق للمورد',
        });
      }
      if (payload.remainingDebt > 0) {
        lines.push({
          accountCode: '2101',
          debit: 0,
          credit: payload.remainingDebt,
          notes: 'استحقاق آجل في ذمة المورد',
        });
      }

      // 3. سداد المصاريف الإضافية (نولون/عتالة) نقداً من الصندوق
      if (additionalExp > 0) {
        lines.push({
          accountCode: '1101',
          debit: 0,
          credit: additionalExp,
          notes: `سداد نقدي لمصاريف الشحن والنولون والعتالة (${payload.expenseNotes || 'نولون/عتالة'})`,
        });
      }

      const orderRef = payload.orderNumber || payload.purchaseOrderId.slice(-6);
      await this.accountingService.createAutoEntry({
        companyId: payload.companyId,
        branchId: payload.branchId,
        description: `قيد استلام فاتورة شراء #${orderRef}${additionalExp > 0 ? ` (مع مصاريف إضافية: ${additionalExp} ج.س)` : ''}`,
        source: 'PURCHASE',
        referenceId: payload.purchaseOrderId,
        createdBy: payload.createdBy,
        lines,
      });

      console.log(`✅ [Accounting] تم إنشاء قيد المشتريات لأمر الشراء: ${payload.purchaseOrderId} بنجاح`);
    } catch (err: any) {
      console.error('❌ [Accounting] خطأ في قيد المشتريات:', err.message);
      throw err;
    }
  }

  // ------------------- 2. قيد المبيعات (الإيرادات + تكلفة البضاعة) -------------------
  @OnEvent('sale.completed')
  async handleSaleCompleted(payload: {
    saleId: string;
    invoiceNumber: string;
    companyId: string;
    branchId: string;
    grandTotal: number;
    totalCost?: number;
    payments: Array<{ method: string; amount: number }>;
    cashierId?: string;
    customerId?: string;
  }) {
    try {
      let effectiveCompanyId = payload.companyId;
      if (!effectiveCompanyId && payload.branchId) {
        const br = await this.prisma.branch.findUnique({ where: { id: payload.branchId } });
        if (br) effectiveCompanyId = br.companyId;
      }

      const lines: Array<{ accountCode: string; debit: number; credit: number; notes?: string }> = [];

      // أ. قيد الإيرادات والمدفوعات (Debit: صندوق/بنك/عملاء، Credit: إيراد المبيعات)
      const grandTotalNum = Number(payload.grandTotal || 0);
      const payments = payload.payments || [];
      const totalPayments = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      let changeToDeduct = Math.max(0, totalPayments - grandTotalNum);

      if (payments.length > 0) {
        for (const p of payments) {
          let accountCode = '1101'; // افتراضي: الصندوق الرئيسي
          if (p.method === 'CARD' || p.method === 'TRANSFER' || p.method === 'BANK_TRANSFER') {
            accountCode = '1102'; // البنك / نقاط البيع
          } else if (p.method === 'CREDIT') {
            accountCode = '1105'; // العملاء (الذمم المدينة)
          }

          let amount = Number(p.amount || 0);
          if (accountCode === '1101' && changeToDeduct > 0) {
            const deduct = Math.min(amount, changeToDeduct);
            amount -= deduct;
            changeToDeduct -= deduct;
          }

          if (amount > 0) {
            lines.push({
              accountCode,
              debit: amount,
              credit: 0,
              notes: `سداد فاتورة ${payload.invoiceNumber} - ${p.method}`,
            });
          }
        }

        // إذا تبقى أي مبلغ فكة متبقٍ بعد خصم الكاش، يتم تقييده كصرف فكة من الصندوق لموازنة القيد
        if (changeToDeduct > 0) {
          lines.push({
            accountCode: '1101',
            debit: 0,
            credit: changeToDeduct,
            notes: `صرف فكة نقداً لفاتورة ${payload.invoiceNumber}`,
          });
        }
      } else if (grandTotalNum > 0) {
        lines.push({
          accountCode: '1101',
          debit: grandTotalNum,
          credit: 0,
          notes: `سداد فاتورة ${payload.invoiceNumber} - نقداً`,
        });
      }

      lines.push({
        accountCode: '4101', // إيرادات مبيعات الأدوية
        debit: 0,
        credit: grandTotalNum,
        notes: `إيراد فاتورة مبيعات ${payload.invoiceNumber}`,
      });

      // ب. قيد التكلفة (COGS) - إذا كانت التكلفة > 0
      let totalCost = Number(payload.totalCost || 0);
      if (totalCost === 0 && Array.isArray((payload as any).items)) {
        totalCost = (payload as any).items.reduce((sum: number, item: any) => {
          return sum + (Number(item.totalBaseQty || item.quantity || 0) * Number(item.costPrice || 0));
        }, 0);
      }

      if (totalCost > 0) {
        lines.push({
          accountCode: '5101', // تكلفة البضاعة المباعة (COGS)
          debit: totalCost,
          credit: 0,
          notes: `تكلفة مبيعات فاتورة ${payload.invoiceNumber}`,
        });
        lines.push({
          accountCode: '1104', // مخزون الأدوية
          debit: 0,
          credit: totalCost,
          notes: `خروج مخزون لفاتورة ${payload.invoiceNumber}`,
        });
      }

      await this.accountingService.createAutoEntry({
        companyId: effectiveCompanyId,
        branchId: payload.branchId,
        description: `قيد مبيعات فاتورة ${payload.invoiceNumber}`,
        source: 'SALE',
        referenceId: payload.invoiceNumber || payload.saleId,
        createdBy: payload.cashierId || 'system',
        lines,
      });

      console.log(`✅ [Accounting] تم إنشاء قيد مبيعات الفاتورة: ${payload.invoiceNumber}`);
    } catch (err: any) {
      console.error('❌ [Accounting] خطأ في قيد المبيعات:', err.message);
      throw err;
    }
  }

  // ------------------- 3. قيد تسوية فروقات الوردية (بعد اعتماد المدير) -------------------
  @OnEvent('shift.approved')
  async handleShiftDifference(payload: {
    shiftId: string;
    companyId: string;
    branchId: string;
    cashDifference?: number | string;
    difference?: number | string;
    approvedBy?: string;
  }) {
    try {
      const rawDiff = payload.difference !== undefined ? payload.difference : payload.cashDifference;
      const diff = Number(rawDiff || 0);
      if (Math.abs(diff) < 0.01) return;

      const amount = Math.abs(diff);
      const isDeficit = diff < 0;

      const lines = isDeficit
        ? [
            { accountCode: '5102', debit: amount, credit: 0, notes: 'عجز الصندوق' },
            { accountCode: '1101', debit: 0, credit: amount, notes: 'تسوية عجز الصندوق نقداً' },
          ]
        : [
            { accountCode: '1101', debit: amount, credit: 0, notes: 'تسوية فائض الصندوق نقداً' },
            { accountCode: '4201', debit: 0, credit: amount, notes: 'أرباح فروق الصندوق' },
          ];

      await this.accountingService.createAutoEntry({
        companyId: payload.companyId,
        branchId: payload.branchId,
        description: `تسوية فروقات وردية #${payload.shiftId.slice(-4)}`,
        source: 'SHIFT_DIFFERENCE',
        referenceId: payload.shiftId,
        createdBy: payload.approvedBy || 'supervisor',
        lines,
      });

      console.log(`✅ [Accounting] تم إنشاء قيد تسوية فروقات الوردية: ${payload.shiftId}`);
    } catch (err: any) {
      console.error('❌ [Accounting] خطأ في قيد فروقات الوردية:', err.message);
      throw err;
    }
  }

  // ------------------- 4. قيد سندات الصرف والمصروفات العمومية -------------------
  @OnEvent('expense.created')
  async handleExpenseCreated(payload: {
    expenseId: string;
    companyId: string;
    branchId: string;
    expenseNumber: string;
    amount: number;
    accountCode: string;
    accountId: string;
    paidFrom: string;
    description: string;
    createdBy?: string;
  }) {
    try {
      const creditAccountCode = payload.paidFrom === 'BANK' ? '1102' : '1101';
      const creditNotes = payload.paidFrom === 'BANK' ? 'صرف من الحساب البنكي' : 'صرف نقدي من الصندوق/الوردية';

      const lines = [
        {
          accountCode: payload.accountCode,
          debit: Number(payload.amount),
          credit: 0,
          notes: `سند صرف #${payload.expenseNumber}: ${payload.description}`,
        },
        {
          accountCode: creditAccountCode,
          debit: 0,
          credit: Number(payload.amount),
          notes: creditNotes,
        },
      ];

      await this.accountingService.createAutoEntry({
        companyId: payload.companyId,
        branchId: payload.branchId,
        description: `قيد سند صرف #${payload.expenseNumber} - ${payload.description}`,
        source: 'EXPENSE',
        referenceId: payload.expenseId,
        createdBy: payload.createdBy,
        lines,
      });

      console.log(`✅ [Accounting] تم إنشاء القيد المزدوج لسند الصرف: ${payload.expenseNumber}`);
    } catch (err: any) {
      console.error('❌ [Accounting] خطأ في إنشاء قيد سند الصرف:', err.message);
      throw err;
    }
  }

  // ------------------- 4.1. قيد سندات القبض والإيرادات المتنوعة (خارج المبيعات) -------------------
  @OnEvent('receipt.created')
  async handleReceiptCreated(payload: {
    receiptId: string;
    companyId: string;
    branchId: string;
    receiptNumber: string;
    amount: number;
    accountCode: string;
    accountId: string;
    receivedTo: string;
    description: string;
    createdBy?: string;
  }) {
    try {
      const debitAccountCode = payload.receivedTo === 'BANK' ? '1102' : '1101';
      const debitNotes = payload.receivedTo === 'BANK' ? 'إيداع في الحساب البنكي' : 'قبض نقدي في الخزينة/الصندوق';

      const lines = [
        {
          accountCode: debitAccountCode,
          debit: Number(payload.amount),
          credit: 0,
          notes: debitNotes,
        },
        {
          accountCode: payload.accountCode,
          debit: 0,
          credit: Number(payload.amount),
          notes: `سند قبض #${payload.receiptNumber}: ${payload.description}`,
        },
      ];

      await this.accountingService.createAutoEntry({
        companyId: payload.companyId,
        branchId: payload.branchId,
        description: `قيد سند قبض إيراد #${payload.receiptNumber} - ${payload.description}`,
        source: 'RECEIPT',
        referenceId: payload.receiptId,
        createdBy: payload.createdBy,
        lines,
      });

      console.log(`✅ [Accounting] تم إنشاء القيد المزدوج لسند القبض: ${payload.receiptNumber}`);
    } catch (err: any) {
      console.error('❌ [Accounting] خطأ في إنشاء قيد سند القبض:', err.message);
      throw err;
    }
  }

  // ------------------- 5. قيد مرتجع المبيعات (مع دعم Outbox Idempotency) -------------------
  @OnEvent('sale.returned')
  async handleSaleReturned(payload: {
    returnId: string;
    returnNumber: string;
    saleId: string;
    companyId: string;
    branchId: string;
    totalRefund: number;
    totalRestockedCost: number;
    totalDamagedCost: number;
    refundMethod: string;
    userId?: string;
    outboxId?: string;
  }) {
    try {
      const lines: Array<{ accountCode: string; debit: number; credit: number; notes?: string }> = [];

      // أ. قيد الإيرادات ورد المبلغ (Debit: مردودات المبيعات 4102 / 4101، Credit: الصندوق 1101 أو البنك 1102 أو العملاء 1105)
      let refundAccountCode = '1101'; // نقداً افتراضياً
      if (payload.refundMethod === 'CARD' || payload.refundMethod === 'BANK_TRANSFER' || payload.refundMethod === 'TRANSFER') {
        refundAccountCode = '1102'; // البنك
      } else if (payload.refundMethod === 'CREDIT') {
        refundAccountCode = '1105'; // العملاء (تخفيض المديونية)
      }

      if (payload.totalRefund > 0) {
        lines.push({
          accountCode: '4101', // إيرادات ومردودات المبيعات (مدين = تخفيض الإيراد)
          debit: Number(payload.totalRefund),
          credit: 0,
          notes: `مردودات مبيعات مرتجع #${payload.returnNumber}`,
        });

        lines.push({
          accountCode: refundAccountCode,
          debit: 0,
          credit: Number(payload.totalRefund),
          notes: `رد القيمة للعميل عبر ${payload.refundMethod}`,
        });
      }

      // ب. قيد البضاعة السليمة المرتجعة للمخزون (Debit: مخزون 1104، Credit: تكلفة البضاعة المباعة COGS 5101)
      if (payload.totalRestockedCost > 0) {
        lines.push({
          accountCode: '1104', // مخزون الأدوية (إعادة للمخزن بالتكلفة التاريخية)
          debit: Number(payload.totalRestockedCost),
          credit: 0,
          notes: `إعادة مخزون سليم لمرتجع #${payload.returnNumber}`,
        });

        lines.push({
          accountCode: '5101', // تكلفة المبيعات (تخفيض التكلفة)
          debit: 0,
          credit: Number(payload.totalRestockedCost),
          notes: `تخفيض تكلفة البضاعة المباعة لمرتجع #${payload.returnNumber}`,
        });
      }

      // ج. قيد البضاعة التالفة (Debit: خسائر بضاعة تالفة 5103 / 5102، Credit: تكلفة مبيعات 5101)
      if (payload.totalDamagedCost > 0) {
        lines.push({
          accountCode: '5102', // خسائر تلف مرتجعات
          debit: Number(payload.totalDamagedCost),
          credit: 0,
          notes: `إثبات خسارة بضاعة تالفة لمرتجع #${payload.returnNumber}`,
        });

        lines.push({
          accountCode: '5101', // تخفيض تكلفة مبيعات الصنف الأصلية
          debit: 0,
          credit: Number(payload.totalDamagedCost),
          notes: `تحويل من تكلفة مبيعات إلى خسائر تلف #${payload.returnNumber}`,
        });
      }

      if (lines.length > 0) {
        await this.accountingService.createAutoEntry({
          companyId: payload.companyId,
          branchId: payload.branchId,
          description: `قيد مرتجع مبيعات #${payload.returnNumber}`,
          source: 'SALE_RETURN',
          referenceId: payload.returnId || payload.returnNumber,
          createdBy: payload.userId || 'system',
          lines,
        });

        console.log(`✅ [Accounting] تم إنشاء القيد المزدوج لمرتجع المبيعات: ${payload.returnNumber}`);
      }

      // تحديث حالة الـ Outbox إلى PROCESSED عند نجاح القيد
      if (payload.outboxId) {
        await this.prisma.accountingOutbox.update({
          where: { id: payload.outboxId },
          data: {
            status: 'PROCESSED',
            processedAt: new Date(),
            processedBy: 'instant-emit',
          },
        });
      }
    } catch (error: any) {
      console.error(`❌ [Accounting] خطأ في قيد مرتجع المبيعات #${payload.returnNumber}:`, error.message);
      // عند الفشل، نرجع الحالة إلى PENDING ليتولى الـ Cron إعادة المحاولة
      if (payload.outboxId) {
        await this.prisma.accountingOutbox.update({
          where: { id: payload.outboxId },
          data: {
            status: 'PENDING',
            error: error.message,
          },
        });
      }
      throw error;
    }
  }

  // ------------------- 5. قيد اعتماد وتسوية الجرد المخزني -------------------
  async handleCustomerPaymentReceived(payload: {
    companyId: string;
    branchId: string;
    receiptNumber: string;
    customerName: string;
    amount: number;
    method: string;
    methodArabic: string;
    userId: string;
    outboxId?: string;
  }) {
    try {
      const cashOrBankCode = payload.method === 'CASH' ? '1101' : '1102';
      await this.accountingService.createAutoEntry({
        companyId: payload.companyId,
        branchId: payload.branchId,
        description: `سند قبض من العميل ${payload.customerName} #${payload.receiptNumber}`,
        source: 'RECEIPT_VOUCHER',
        referenceId: payload.receiptNumber,
        createdBy: payload.userId,
        lines: [
          { accountCode: cashOrBankCode, debit: Number(payload.amount), credit: 0, notes: `تحصيل سند قبض من ${payload.customerName} (${payload.methodArabic})` },
          { accountCode: '1105', debit: 0, credit: Number(payload.amount), notes: `تخفيض مديونية العميل ${payload.customerName} - سند #${payload.receiptNumber}` },
        ],
      });
      await this.markOutboxAsProcessed(payload.outboxId);
    } catch (error: any) {
      await this.markOutboxAsFailed(payload.outboxId, error.message);
      throw error;
    }
  }

  async handleReceiptCancelled(payload: {
    companyId: string;
    branchId: string;
    receiptNumber: string;
    amount: number;
    accountCode: string;
    receivedTo: string;
    createdBy: string;
    outboxId?: string;
  }) {
    try {
      const cashOrBank = payload.receivedTo === 'BANK' ? '1102' : '1101';
      await this.accountingService.createAutoEntry({
        companyId: payload.companyId,
        branchId: payload.branchId,
        description: `عكس سند قبض ملغي #${payload.receiptNumber}`,
        source: 'RECEIPT_CANCEL',
        referenceId: `CANCEL-${payload.receiptNumber}`,
        createdBy: payload.createdBy,
        lines: [
          { accountCode: payload.accountCode, debit: Number(payload.amount), credit: 0, notes: `عكس إيراد السند ${payload.receiptNumber}` },
          { accountCode: cashOrBank, debit: 0, credit: Number(payload.amount), notes: `عكس إيداع السند ${payload.receiptNumber}` },
        ],
      });
      await this.markOutboxAsProcessed(payload.outboxId);
    } catch (error: any) {
      await this.markOutboxAsFailed(payload.outboxId, error.message);
      throw error;
    }
  }

  // ------------------- 5. قيد اعتماد وتسوية الجرد المخزني -------------------
  @OnEvent('stock.count.approved')
  async handleStockCountApproved(payload: {
    stockCountId: string;
    countNumber: string;
    companyId: string;
    branchId: string;
    totalShortage: number;
    totalSurplus: number;
    userId: string;
    outboxId?: string;
  }) {
    this.logger.log(`📊 معالجة اعتماد الجرد ${payload.countNumber}`);

    try {
      const lines: Array<{ accountCode: string; debit: number; credit: number; notes?: string }> = [];

      // قيد العجز
      if (payload.totalShortage > 0) {
        lines.push({
          accountCode: '5103',
          debit: payload.totalShortage,
          credit: 0,
          notes: `عجز جردي - ${payload.countNumber}`,
        });
        lines.push({
          accountCode: '1104',
          debit: 0,
          credit: payload.totalShortage,
          notes: `تخفيض المخزون - ${payload.countNumber}`,
        });
      }

      // قيد الفائض
      if (payload.totalSurplus > 0) {
        lines.push({
          accountCode: '1104',
          debit: payload.totalSurplus,
          credit: 0,
          notes: `زيادة المخزون - ${payload.countNumber}`,
        });
        lines.push({
          accountCode: '4201',
          debit: 0,
          credit: payload.totalSurplus,
          notes: `أرباح تسوية جردية - ${payload.countNumber}`,
        });
      }

      if (lines.length === 0) {
        await this.markOutboxAsProcessed(payload.outboxId);
        return;
      }

      const entry = await this.accountingService.createAutoEntry({
        companyId: payload.companyId,
        branchId: payload.branchId,
        description: `قيد تسوية فروقات الجرد - ${payload.countNumber}`,
        source: 'STOCK_COUNT',
        referenceId: payload.stockCountId,
        createdBy: payload.userId,
        lines,
      });

      this.logger.log(`✅ تم إنشاء القيد ${entry.entryNumber}`);
      await this.markOutboxAsProcessed(payload.outboxId);
    } catch (error: any) {
      this.logger.error(`❌ فشل ترحيل قيد الجرد: ${error.message}`, error.stack);
      await this.markOutboxAsFailed(payload.outboxId, error.message);
      throw error;
    }
  }

  private async markOutboxAsProcessed(outboxId?: string) {
    if (!outboxId) return;
    try {
      await this.prisma.accountingOutbox.update({
        where: { id: outboxId },
        data: { status: 'PROCESSED', processedAt: new Date(), processedBy: 'accounting-listener' },
      });
    } catch (error) {
      this.logger.warn(`فشل تحديث Outbox ${outboxId}`);
    }
  }

  private async markOutboxAsFailed(outboxId?: string, errorMessage?: string) {
    if (!outboxId) return;
    try {
      await this.prisma.accountingOutbox.update({
        where: { id: outboxId },
        data: { status: 'PENDING', error: errorMessage, retryCount: { increment: 1 } },
      });
    } catch (error) {
      this.logger.warn(`فشل تحديث Outbox ${outboxId}`);
    }
  }
}


