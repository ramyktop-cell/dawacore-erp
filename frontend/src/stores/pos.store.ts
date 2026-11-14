// frontend/src/stores/pos.store.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { securePosStorage } from '../utils/pos-security';

export type UnitType = 'UNIT' | 'STRIP' | 'BOX';

export interface CartItem {
  isWeighed?: boolean;
  id: string;
  medicineId: string;
  tradeName: string;
  barcode: string;
  unitType: UnitType;
  unitLabel?: string;
  availableUnits: { unitType: UnitType; label?: string; multiplier: number; price: number; minSalePrice?: number; barcode?: string; isDefault?: boolean }[];
  quantity: number;
  unitPrice: number;
  originalUnitPrice?: number;
  minSalePrice?: number;
  priceOverrideReason?: string;
  isPriceOverridden?: boolean;
  totalPrice: number;
  discountAmount?: number; // 🆕 خصم هذا البند (مبلغ ثابت)
  availableStockInBase?: number; // 🆕 الرصيد المتوفر بالمخزن بالوحدة الأساسية
}

interface PosState {
  activeShiftId: string | null;
  branchId: string | null;
  cashierId: string | null;
  items: CartItem[];
  discountTotal: number;
  customerId: string | null;
  customer: any | null;

  initSession: (branchId: string, cashierId: string, shiftId: string) => void;
  addItem: (product: {
    id?: string;
    medicineId?: string;
    tradeName: string;
    barcode: string;
    totalStockInBase?: number;
    availableStockInBase?: number;
    branchStockInBase?: number;
    scaleWeight?: number;
    isScaleScan?: boolean;
    isWeighed?: boolean;
    units: { unitType: UnitType; label?: string; multiplier: number; price: number; minSalePrice?: number; barcode?: string; isDefault?: boolean }[];
    defaultUnit?: UnitType;
  }, scannedBarcode?: string, customQuantity?: number) => void;
  updateQuantity: (itemId: string, delta: number) => void;
  setExactQuantity: (itemId: string, qty: number) => void;
  changeUnit: (itemId: string, newUnit: UnitType) => void;
  overrideItemPrice: (itemId: string, newPrice: number, reason: string) => boolean;
  resetItemPrice: (itemId: string) => void;
  removeItem: (itemId: string) => void;
  setDiscount: (amount: number) => void;
  setCustomer: (customerOrId: any | null) => void;
  clearCart: () => void;
  restoreCart: (items: CartItem[], discountTotal?: number, customerId?: string | null) => void;
  newInvoice: () => void;

  // 🆕 دوال الخصم على البنود
  setItemDiscount: (itemId: string, discountAmount: number) => void;
  setItemDiscountFromPercentage: (itemId: string, percentage: number) => void;
  clearItemDiscount: (itemId: string) => void;
  getItemsDiscountTotal: () => number;
  getSubTotalAfterItemDiscounts: () => number;

  getSubTotal: () => number;
  getGrandTotal: () => number;
  getTotalItemsCount: () => number;
}

export const usePosStore = create<PosState>()(
  persist(
    (set, get) => ({
      activeShiftId: null,
      branchId: null,
      cashierId: null,
      items: [],
      discountTotal: 0,
      customerId: null,
      customer: null,

      initSession: (branchId, cashierId, shiftId) =>
        set({ branchId, cashierId, activeShiftId: shiftId }),

      addItem: (product, scannedBarcode, customQuantity) => {
        const medId = product.medicineId || product.id || '';
        const stockInBase =
          product.totalStockInBase ??
          product.availableStockInBase ??
          product.branchStockInBase;

        const rawQty = Number(customQuantity ?? product.scaleWeight ?? 1);
        const qtyToAdd = rawQty > 0 ? Number(rawQty.toFixed(4)) : 1;

        const frozenUnits = product.units.map((u) =>
          Object.freeze({
            ...u,
            price: Number(u.price),
            minSalePrice: u.minSalePrice !== undefined ? Number(u.minSalePrice) : Number(u.price),
          }),
        );
        let selectedUnit = scannedBarcode
          ? frozenUnits.find((u) => u.barcode === scannedBarcode)
          : undefined;

        if (!selectedUnit) {
          selectedUnit = frozenUnits.find((u) => u.isDefault) || frozenUnits[0];
        }

        const itemId = `${medId}-${selectedUnit.unitType}`;
        const existingItem = get().items.find((item) => item.id === itemId);

        if (existingItem) {
          if (stockInBase !== undefined && existingItem.availableStockInBase !== stockInBase) {
            set((state) => ({
              items: state.items.map((it) =>
                it.id === itemId ? { ...it, availableStockInBase: stockInBase } : it,
              ),
            }));
          }
          get().updateQuantity(itemId, qtyToAdd);
          return;
        }

        const unitPrice = Number(selectedUnit.price);
        const minSalePrice = selectedUnit.minSalePrice !== undefined ? Number(selectedUnit.minSalePrice) : unitPrice;
        const newItem: CartItem = {
          isWeighed: product.isWeighed,
          id: itemId,
          medicineId: medId,
          tradeName: product.tradeName,
          barcode: selectedUnit.barcode || product.barcode,
          unitType: selectedUnit.unitType,
          unitLabel: selectedUnit.label,
          availableUnits: frozenUnits,
          quantity: qtyToAdd,
          unitPrice,
          originalUnitPrice: unitPrice,
          minSalePrice,
          priceOverrideReason: undefined,
          isPriceOverridden: false,
          totalPrice: Number((qtyToAdd * unitPrice).toFixed(2)),
          discountAmount: 0,
          availableStockInBase: stockInBase,
        };

        set((state) => ({ items: [newItem, ...state.items] }));
      },

      updateQuantity: (itemId, delta) => {
        set((state) => ({
          items: state.items
            .map((item) => {
              if (item.id === itemId) {
                const newQty = Number((item.quantity + delta).toFixed(4));
                if (newQty <= 0) return null;
                const newTotalPrice = Number((newQty * item.unitPrice).toFixed(2));
                const clampedDiscount = item.discountAmount
                  ? Math.min(item.discountAmount, newTotalPrice)
                  : 0;
                return {
                  ...item,
                  quantity: newQty,
                  totalPrice: newTotalPrice,
                  discountAmount: clampedDiscount,
                };
              }
              return item;
            })
            .filter(Boolean) as CartItem[],
        }));
      },

      setExactQuantity: (itemId, qty) => {
        const cleanQty = Number(Number(qty).toFixed(4));
        if (isNaN(cleanQty) || cleanQty <= 0) {
          get().removeItem(itemId);
          return;
        }
        set((state) => ({
          items: state.items.map((item) => {
            if (item.id === itemId) {
              const newTotalPrice = Number((cleanQty * item.unitPrice).toFixed(2));
              const clampedDiscount = item.discountAmount
                ? Math.min(item.discountAmount, newTotalPrice)
                : 0;
              return {
                ...item,
                quantity: cleanQty,
                totalPrice: newTotalPrice,
                discountAmount: clampedDiscount,
              };
            }
            return item;
          }),
        }));
      },

      changeUnit: (itemId, newUnit) => {
        set((state) => ({
          items: state.items.map((item) => {
            if (item.id === itemId) {
              const selectedUnit = item.availableUnits.find((u) => u.unitType === newUnit);
              if (!selectedUnit) return item;
              const unitPrice = Number(selectedUnit.price);
              const minSalePrice = selectedUnit.minSalePrice !== undefined ? Number(selectedUnit.minSalePrice) : unitPrice;
              const newTotalPrice = Number((item.quantity * unitPrice).toFixed(2));
              const clampedDiscount = item.discountAmount
                ? Math.min(item.discountAmount, newTotalPrice)
                : 0;
              return {
                ...item,
                id: `${item.medicineId}-${newUnit}`,
                unitType: newUnit,
                unitLabel: selectedUnit.label,
                unitPrice,
                originalUnitPrice: unitPrice,
                minSalePrice,
                priceOverrideReason: undefined,
                isPriceOverridden: false,
                totalPrice: newTotalPrice,
                discountAmount: clampedDiscount,
              };
            }
            return item;
          }),
        }));
      },

      overrideItemPrice: (itemId, newPrice, reason) => {
        const item = get().items.find((i) => i.id === itemId);
        if (!item || item.isWeighed) return false;
        const cleanPrice = Number(newPrice);
        const trimmedReason = typeof reason === 'string' ? reason.trim() : '';
        if (isNaN(cleanPrice) || cleanPrice < 0 || trimmedReason.length < 3 || trimmedReason.length > 500) {
          return false;
        }
        const minPrice = item.minSalePrice !== undefined ? item.minSalePrice : 0;
        if (cleanPrice < minPrice) {
          return false;
        }

        const origPrice = item.originalUnitPrice ?? item.unitPrice;
        const isOverridden = cleanPrice !== origPrice;

        set((state) => ({
          items: state.items.map((i) => {
            if (i.id !== itemId) return i;
            const newTotalPrice = Number((i.quantity * cleanPrice).toFixed(2));
            const clampedDiscount = i.discountAmount
              ? Math.min(i.discountAmount, newTotalPrice)
              : 0;
            return {
              ...i,
              unitPrice: cleanPrice,
              originalUnitPrice: origPrice,
              priceOverrideReason: isOverridden ? trimmedReason : undefined,
              isPriceOverridden: isOverridden,
              totalPrice: newTotalPrice,
              discountAmount: clampedDiscount,
            };
          }),
        }));
        return true;
      },

      resetItemPrice: (itemId) => {
        set((state) => ({
          items: state.items.map((i) => {
            if (i.id !== itemId) return i;
            const origPrice = i.originalUnitPrice ?? i.unitPrice;
            const newTotalPrice = Number((i.quantity * origPrice).toFixed(2));
            const clampedDiscount = i.discountAmount
              ? Math.min(i.discountAmount, newTotalPrice)
              : 0;
            return {
              ...i,
              unitPrice: origPrice,
              priceOverrideReason: undefined,
              isPriceOverridden: false,
              totalPrice: newTotalPrice,
              discountAmount: clampedDiscount,
            };
          }),
        }));
      },

      removeItem: (itemId) => {
        set((state) => ({ items: state.items.filter((item) => item.id !== itemId) }));
      },

      // ═══════════════════════════════════════════════════════════
      // 🆕 دوال الخصم على البنود
      // ═══════════════════════════════════════════════════════════

      setItemDiscount: (itemId, discountAmount) => {
        const item = get().items.find((i) => i.id === itemId);
        if (!item) return;

        // Validation: لا يتجاوز إجمالي سعر البند ولا يقل عن 0
        const maxAllowed = item.totalPrice;
        const clampedDiscount = Math.max(0, Math.min(Number(discountAmount || 0), maxAllowed));

        set((state) => ({
          items: state.items.map((i) =>
            i.id === itemId ? { ...i, discountAmount: Number(clampedDiscount.toFixed(2)) } : i,
          ),
        }));
      },

      setItemDiscountFromPercentage: (itemId, percentage) => {
        const item = get().items.find((i) => i.id === itemId);
        if (!item) return;

        const clampedPct = Math.max(0, Math.min(Number(percentage || 0), 100));
        const amount = Number(((item.totalPrice * clampedPct) / 100).toFixed(2));
        get().setItemDiscount(itemId, amount);
      },

      clearItemDiscount: (itemId) => {
        set((state) => ({
          items: state.items.map((i) =>
            i.id === itemId ? { ...i, discountAmount: 0 } : i,
          ),
        }));
      },

      getItemsDiscountTotal: () => {
        return Number(
          get()
            .items.reduce((sum, item) => sum + (item.discountAmount || 0), 0)
            .toFixed(2),
        );
      },

      getSubTotalAfterItemDiscounts: () => {
        return Number(
          get()
            .items.reduce(
              (sum, item) => sum + (item.totalPrice - (item.discountAmount || 0)),
              0,
            )
            .toFixed(2),
        );
      },

      setDiscount: (amount) => set({ discountTotal: Math.max(0, amount) }),
      setCustomer: (customerOrId) => {
        if (!customerOrId) {
          set({ customerId: null, customer: null });
        } else if (typeof customerOrId === 'string') {
          set({ customerId: customerOrId });
        } else {
          set({ customerId: customerOrId.id, customer: customerOrId });
        }
      },
      clearCart: () => set({ items: [], discountTotal: 0, customerId: null, customer: null }),
      restoreCart: (items, discountTotal = 0, customerId = null) =>
        set({
          items: Array.isArray(items) ? items : [],
          discountTotal: typeof discountTotal === 'number' ? discountTotal : 0,
          customerId: customerId || null,
        }),

      newInvoice: () => {
        set({ items: [], discountTotal: 0, customerId: null, customer: null });
      },

      getSubTotal: () => {
        return Number(
          get()
            .items.reduce((sum, item) => {
              const officialUnit = item.availableUnits?.find((u) => u.unitType === item.unitType);
              const safeUnitPrice = Number(officialUnit?.price ?? item.unitPrice ?? 0);
              return sum + item.quantity * safeUnitPrice;
            }, 0)
            .toFixed(2),
        );
      },

      getGrandTotal: () => {
        // grandTotal = subTotal − itemsDiscount − invoiceDiscount
        const total =
          get().getSubTotal() -
          get().getItemsDiscountTotal() -
          get().discountTotal;
        return Number(Math.max(0, total).toFixed(2));
      },

      getTotalItemsCount: () => {
        return get().items.reduce((sum, item) => sum + item.quantity, 0);
      },
    }),
    {
      name: 'dawacore-pos-active-cart',
      storage: createJSONStorage(() => securePosStorage),
    }
  )
);
