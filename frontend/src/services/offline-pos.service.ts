/// <reference types="vite/client" />
/**
 * DawaCore ERP - Offline-First POS & Auto-Sync Engine (IndexedDB + Network Monitor)
 *
 * Provides:
 * 1. Full Local Catalog Cache (Medicines / Supermarket Products) in IndexedDB (`products_catalog`)
 * 2. Instant Offline Search & Barcode Lookup (< 5ms latency)
 * 3. Persistent Offline Sales Outbox Queue (`sales_outbox`)
 * 4. Automatic Background Synchronization when Internet / Server connection returns
 * 5. Simulation Mode (Offline Toggle) so the user can test offline behavior anytime
 */

import { apiFetch } from '../api/http';
import { useAuthStore } from '../stores/auth.store';

const DB_NAME = 'dawacore_offline_pos_db';
const DB_VERSION = 1;
const STORE_CATALOG = 'products_catalog';
const STORE_OUTBOX = 'sales_outbox';
const OFFLINE_LIMIT_MS = 30 * 24 * 60 * 60 * 1000;
const LICENSE_CHECK_KEY = 'dawacore:pos-preview-license-check';
export const offlinePosPreviewEnabled = import.meta.env.PROD &&
  import.meta.env.VITE_POS_OFFLINE_PREVIEW === 'true';

type SavedShift = { id: string; branchId: string; shiftNumber?: string | number };
const shiftStorageKey = (scope: string, cashier: string) => `dawacore:pos-shift:${scope}:${cashier}`;

function currentCatalogScope() {
  const user = useAuthStore.getState().user;
  if (!user?.companyId || !user.branchId) return null;
  return { companyId: user.companyId, branchId: user.branchId, key: JSON.stringify([user.companyId, user.branchId]) };
}

function belongsToCurrentCashier(item: OfflineQueuedSale) {
  const user = useAuthStore.getState().user;
  return !!user && item.payload.companyId === user.companyId &&
    item.payload.cashierId === user.id && (!user.branchId || item.payload.branchId === user.branchId);
}

export interface OfflineQueuedSale {
  localId: string;
  offlineInvoiceNumber: string;
  createdAt: string;
  status: 'PENDING' | 'SYNCING' | 'FAILED';
  retryCount: number;
  lastError?: string;
  payload: {
    branchId: string;
    cashierId: string;
    companyId?: string;
    offlineSaleId?: string;
    shiftId: string;
    customerId?: string;
    invoiceDiscount?: string;
    discountTotal?: string;
    items: Array<{
      medicineId: string;
      unitType: string;
      quantity: number;
      unitPrice: string;
      discountAmount?: string;
    }>;
    payments: Array<{
      method: string;
      amount: string;
      referenceNo?: string;
    }>;
  };
  receiptSnapshot: {
    customerName: string;
    cashierName: string;
    paymentMethod: string;
    grandTotal: string;
    paidAmount: string;
    changeAmount: string;
    items: Array<{
      tradeName: string;
      unitLabel?: string;
      quantity: number;
      unitPrice: number;
      discountAmount?: number;
      totalPrice: number;
    }>;
  };
}

type SyncListener = (state: OfflineSyncSnapshot) => void;

export interface OfflineSyncSnapshot {
  isOnline: boolean;
  isSimulatedOffline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  catalogCount: number;
  lastCatalogSyncAt: string | null;
  lastOutboxSyncAt: string | null;
}

class OfflinePosEngine {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private listeners: Set<SyncListener> = new Set();
  private state: OfflineSyncSnapshot = {
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isSimulatedOffline: localStorage.getItem('dawacore_simulate_offline') === 'true',
    isSyncing: false,
    pendingCount: 0,
    catalogCount: 0,
    lastCatalogSyncAt: localStorage.getItem('dawacore_last_catalog_sync'),
    lastOutboxSyncAt: localStorage.getItem('dawacore_last_outbox_sync'),
  };

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.state.isOnline = true;
        this.notify();
        if (!this.isEffectivelyOffline()) {
          void this.syncPendingSales().then(() => this.refreshCatalogFromServer());
        }
      });

      window.addEventListener('offline', () => {
        this.state.isOnline = false;
        this.notify();
      });

      // Request persistent storage. The browser can decline the request.
      if (navigator.storage && navigator.storage.persist) {
        navigator.storage.persist().catch(() => {});
      }

      // Initialize counts and start periodic background sync check every 20 seconds
      this.initCounts();
      useAuthStore.subscribe((state, previous) => {
        if (state.user?.id !== previous.user?.id || state.user?.companyId !== previous.user?.companyId ||
            state.user?.branchId !== previous.user?.branchId) {
          this.initCounts();
        }
      });
      setInterval(() => {
        if (offlinePosPreviewEnabled && navigator.onLine && !this.state.isOnline) {
          void this.recheckConnection();
          return;
        }
        if (!this.isEffectivelyOffline() && this.state.pendingCount > 0 && !this.state.isSyncing) {
          this.syncPendingSales();
        }
      }, 20000);
    }
  }

  public isEffectivelyOffline(): boolean {
    return !this.state.isOnline || this.state.isSimulatedOffline;
  }

  public markNetworkUnavailable() {
    if (!offlinePosPreviewEnabled || !this.state.isOnline) return;
    this.state.isOnline = false;
    this.notify();
  }

  private async recheckConnection() {
    try {
      const result = await fetch('/api/health', { cache: 'no-store', redirect: 'error' });
      const health = result.ok ? await result.json() : null;
      if (health?.status !== 'ok' || !navigator.onLine) return;
      this.state.isOnline = true;
      this.notify();
      if (!this.isEffectivelyOffline()) await this.syncPendingSales();
    } catch {}
  }

  public rememberLicenseCheck(status: { isActivated: boolean; expiresAt?: string }) {
    if (!offlinePosPreviewEnabled) return;
    try {
      if (!status.isActivated) {
        localStorage.removeItem(LICENSE_CHECK_KEY);
      } else {
        localStorage.setItem(LICENSE_CHECK_KEY, JSON.stringify({ checkedAt: Date.now(), expiresAt: status.expiresAt }));
      }
    } catch {}
  }

  public hasRecentLicenseCheck(): boolean {
    try {
      const data = localStorage.getItem(LICENSE_CHECK_KEY);
      if (!data) return false;
      const { checkedAt, expiresAt } = JSON.parse(data);
      const age = Date.now() - checkedAt;
      return Number.isFinite(age) && age >= 0 && age < OFFLINE_LIMIT_MS &&
        (!expiresAt || Date.parse(expiresAt) > Date.now());
    } catch {
      return false;
    }
  }

  public rememberVerifiedShift(cashier: string, branch: string, shift: SavedShift | null) {
    if (!offlinePosPreviewEnabled) return;
    const scope = currentCatalogScope();
    if (!scope || scope.branchId !== branch || useAuthStore.getState().user?.id !== cashier) return;
    const key = shiftStorageKey(scope.key, cashier);
    if (shift?.id && shift.branchId === branch) {
      localStorage.setItem(key, JSON.stringify({ shift, verifiedAt: Date.now() }));
    } else {
      localStorage.removeItem(key);
    }
  }

  public getOfflineShift(cashier: string, branch: string): SavedShift | null {
    if (!offlinePosPreviewEnabled) return null;
    const scope = currentCatalogScope();
    if (!scope || scope.branchId !== branch || useAuthStore.getState().user?.id !== cashier) return null;
    try {
      const stored = localStorage.getItem(shiftStorageKey(scope.key, cashier));
      if (!stored) return null;
      const { shift, verifiedAt } = JSON.parse(stored);
      const age = Date.now() - verifiedAt;
      if (!Number.isFinite(age) || age < 0 || age >= OFFLINE_LIMIT_MS || shift?.branchId !== branch || !shift.id) return null;
      return shift;
    } catch {
      return null;
    }
  }

  public setSimulatedOffline(enabled: boolean) {
    this.state.isSimulatedOffline = enabled;
    localStorage.setItem('dawacore_simulate_offline', enabled ? 'true' : 'false');
    this.notify();
    if (!enabled && this.state.isOnline) {
      this.syncPendingSales();
    }
  }

  public getSnapshot(): OfflineSyncSnapshot {
    return { ...this.state };
  }

  public subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const snap = this.getSnapshot();
    this.listeners.forEach((fn) => fn(snap));
  }

  private openDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_CATALOG)) {
          const catalogStore = db.createObjectStore(STORE_CATALOG, { keyPath: 'id' });
          catalogStore.createIndex('barcode', 'barcode', { unique: false });
          catalogStore.createIndex('code', 'code', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
          const outboxStore = db.createObjectStore(STORE_OUTBOX, { keyPath: 'localId' });
          outboxStore.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    return this.dbPromise;
  }

  public async initCounts() {
    try {
      const db = await this.openDb();
      const tx = db.transaction([STORE_CATALOG, STORE_OUTBOX], 'readonly');
      const catalogCountReq = tx.objectStore(STORE_CATALOG).count();
      const outboxCountReq = tx.objectStore(STORE_OUTBOX).getAll();

      catalogCountReq.onsuccess = () => {
        this.state.catalogCount = catalogCountReq.result || 0;
        this.notify();
      };
      outboxCountReq.onsuccess = () => {
        this.state.pendingCount = (outboxCountReq.result as OfflineQueuedSale[]).filter(belongsToCurrentCashier).length;
        this.notify();
      };
    } catch (e) {
      console.warn('IndexedDB initCounts warning:', e);
    }
  }

  /**
   * تحميل الأصناف من الخادم وتخزينها في IndexedDB للعمل أوفلاين بسرعة فائقة
   */
  public async refreshCatalogFromServer(): Promise<number> {
    if (this.isEffectivelyOffline()) return this.state.catalogCount;
    const scope = currentCatalogScope();
    if (!scope) return 0;

    try {
      if ((await this.getPendingSales()).length > 0) return this.state.catalogCount;
      const res = await apiFetch(`/api/medicines?limit=2000&branchId=${encodeURIComponent(scope.branchId)}`);
      if (!res.ok) return this.state.catalogCount;
      const data = await res.json();
      const items: any[] = Array.isArray(data) ? data : data.items || [];

      const db = await this.openDb();
      if (currentCatalogScope()?.key !== scope.key) return 0;
      if (this.isEffectivelyOffline()) return this.state.catalogCount;
      const stored = await new Promise<boolean>((resolve, reject) => {
        const tx = db.transaction([STORE_CATALOG, STORE_OUTBOX], 'readwrite');
        const store = tx.objectStore(STORE_CATALOG);
        const pending = tx.objectStore(STORE_OUTBOX).getAll();
        let updated = false;
        pending.onsuccess = () => {
          if (currentCatalogScope()?.key !== scope.key || this.isEffectivelyOffline() ||
              (pending.result as OfflineQueuedSale[]).some((sale) =>
                sale.payload.companyId === scope.companyId && sale.payload.branchId === scope.branchId)) return;
          store.clear();
          for (const item of items) store.put({ ...item, offlineScope: scope.key });
          updated = true;
        };
        tx.oncomplete = () => resolve(updated);
        tx.onerror = () => reject(tx.error);
      });
      if (!stored) return this.state.catalogCount;

      const nowIso = new Date().toISOString();
      this.state.catalogCount = items.length;
      this.state.lastCatalogSyncAt = nowIso;
      localStorage.setItem('dawacore_last_catalog_sync', nowIso);
      this.notify();
      return items.length;
    } catch (err) {
      console.warn('Catalog background cache skipped:', err);
      return this.state.catalogCount;
    }
  }

  /**
   * البحث المحلي في IndexedDB بالاسم التجاري أو العلمي أو الكود أو الباركود
   */
  public async searchCatalogOffline(query: string, limit = 15): Promise<any[]> {
    const q = query.trim().toLowerCase();
    const scope = currentCatalogScope();
    if (!scope) return [];

    try {
      const db = await this.openDb();
      return await new Promise<any[]>((resolve) => {
        const tx = db.transaction(STORE_CATALOG, 'readonly');
        const store = tx.objectStore(STORE_CATALOG);
        const req = store.getAll();

        req.onsuccess = () => {
          const all = currentCatalogScope()?.key === scope.key ? req.result || [] : [];
          const matches = all
            .filter((item: any) => {
              if (item.offlineScope !== scope.key) return false;
              const trade = (item.tradeName || '').toLowerCase();
              const sci = (item.scientificName || '').toLowerCase();
              const code = (item.code || '').toLowerCase();
              const barcode = (item.barcode || '').toLowerCase();
              return (
                trade.includes(q) ||
                sci.includes(q) ||
                code.includes(q) ||
                barcode === q
              );
            })
            .slice(0, limit);
          resolve(matches);
        };
        req.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  }

  /**
   * البحث بالباركود في IndexedDB (أوفلاين)
   */
  public async findByBarcodeOffline(barcode: string): Promise<any | null> {
    const clean = barcode.trim();
    const scope = currentCatalogScope();
    if (!clean || !scope) return null;

    try {
      const db = await this.openDb();
      return await new Promise<any | null>((resolve) => {
        const tx = db.transaction(STORE_CATALOG, 'readonly');
        const store = tx.objectStore(STORE_CATALOG);
        const idx = store.index('barcode');
        const req = idx.getAll(clean);

        req.onsuccess = () => {
          const matchesScope = (item: any) =>
            currentCatalogScope()?.key === scope.key && item.offlineScope === scope.key;
          const match = req.result.find(matchesScope);
          if (match) {
            resolve(match);
          } else {
            // Fallback search by code
            const codeIdx = store.index('code');
            const codeReq = codeIdx.getAll(clean);
            codeReq.onsuccess = () => resolve(codeReq.result.find(matchesScope) || null);
            codeReq.onerror = () => resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  /**
   * حفظ فاتورة بيع في طابور الأوفلاين (IndexedDB Outbox)
   */
  public async enqueueOfflineSale(
    payload: OfflineQueuedSale['payload'],
    receiptSnapshot: OfflineQueuedSale['receiptSnapshot'],
  ): Promise<OfflineQueuedSale> {
    const now = new Date();
    const user = useAuthStore.getState().user;
    const scope = currentCatalogScope();
    if (!user?.companyId || payload.cashierId !== user.id ||
        (user.branchId && user.branchId !== payload.branchId)) {
      throw new Error('البيع الأوفلاين يتطلب جلسة كاشير مطابقة للشركة والفرع');
    }
    if (!this.hasRecentLicenseCheck() || !scope || scope.branchId !== payload.branchId ||
        this.getOfflineShift(payload.cashierId, payload.branchId)?.id !== payload.shiftId) {
      throw new Error('انتهت صلاحية البيع الأوفلاين أو لم تُهيّأ الوردية أثناء الاتصال');
    }
    if (payload.customerId || payload.payments.length !== 1 || payload.payments[0].method !== 'CASH') {
      throw new Error('البيع الأوفلاين التجريبي يدعم الدفع النقدي فقط');
    }
    const worker = await navigator.serviceWorker?.getRegistration();
    if (!worker?.active || new URL(worker.active.scriptURL).pathname !== '/pos-offline-sw.js') {
      throw new Error('افتح نقطة البيع أثناء الاتصال حتى تكتمل تهيئة التشغيل الأوفلاين');
    }
    if (!await navigator.storage?.persisted()) {
      if (!await navigator.storage?.persist()) throw new Error('المتصفح لم يسمح بالتخزين الدائم للفواتير');
    }
    const offlineSaleId = crypto.randomUUID();
    const shortRand = offlineSaleId.slice(0, 8).toUpperCase();
    const offlineInvoiceNumber = `OFF-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${shortRand}`;

    const entry: OfflineQueuedSale = {
      localId: offlineSaleId,
      offlineInvoiceNumber,
      createdAt: now.toISOString(),
      status: 'PENDING',
      retryCount: 0,
      payload: { ...payload, companyId: user.companyId, offlineSaleId },
      receiptSnapshot,
    };

    const db = await this.openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_OUTBOX, STORE_CATALOG], 'readwrite');
      tx.objectStore(STORE_OUTBOX).add(entry);

      const catalogStore = tx.objectStore(STORE_CATALOG);
      const groups = new Map<string, OfflineQueuedSale['payload']['items']>();
      for (const item of payload.items) {
        const group = groups.get(item.medicineId) || [];
        group.push(item);
        groups.set(item.medicineId, group);
      }
      let stockError: Error | undefined;
      for (const [medicineId, items] of groups) {
        const getReq = catalogStore.get(medicineId);
        getReq.onsuccess = () => {
          const med = getReq.result;
          let deductedBase = 0;
          if (med?.offlineScope === scope.key) {
            for (const item of items) {
              const unit = (med.units || []).find((u: any) => u.unitType === item.unitType);
              const quantity = Number(item.quantity);
              const multiplier = Number(unit?.multiplier);
              if (!unit || !Number.isFinite(quantity) || quantity <= 0 ||
                  !Number.isFinite(multiplier) || multiplier <= 0 ||
                  Number(unit.price) !== Number(item.unitPrice)) {
                deductedBase = NaN;
                break;
              }
              deductedBase += quantity * multiplier;
            }
          }
          const left = Number(med?.totalStockInBase) - deductedBase;
          if (!med || med.offlineScope !== scope.key || !Number.isFinite(left) || left < -1e-9) {
            stockError = new Error('الكمية أو السعر غير متاح في نسخة مخزون الفرع المحفوظة');
            tx.abort();
          } else {
            med.totalStockInBase = Math.max(left, 0);
            med.branchStockInBase = med.totalStockInBase;
            catalogStore.put(med);
          }
        };
      }
      tx.onabort = () => reject(stockError || tx.error || new Error('تعذر حفظ الفاتورة الأوفلاين'));

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    await this.initCounts();
    return entry;
  }

  /**
   * تصدير كافة الفواتير الأوفلاين المعلقة إلى ملف JSON خارجي (حماية إضافية عند انقطاع الإنترنت لأسابيع طويلة)
   */
  public async exportPendingSalesToJson(): Promise<void> {
    const pending = await this.getPendingSales();
    const blob = new Blob([JSON.stringify(pending, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateTag = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `dawacore_offline_sales_backup_${dateTag}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * جلب جميع الفواتير المحفوظة في طابور الأوفلاين
   */
  public async getPendingSales(): Promise<OfflineQueuedSale[]> {
    try {
      const db = await this.openDb();
      return await new Promise<OfflineQueuedSale[]>((resolve) => {
        const tx = db.transaction(STORE_OUTBOX, 'readonly');
        const req = tx.objectStore(STORE_OUTBOX).getAll();
        req.onsuccess = () => {
          const list = ((req.result || []) as OfflineQueuedSale[]).filter(belongsToCurrentCashier);
          list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          resolve(list);
        };
        req.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  }

  /**
   * حذف فاتورة من طابور الأوفلاين
   */
  public async removeQueuedSale(localId: string): Promise<void> {
    const db = await this.openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_OUTBOX, 'readwrite');
      const store = tx.objectStore(STORE_OUTBOX);
      const request = store.get(localId);
      request.onsuccess = () => {
        if (request.result && belongsToCurrentCashier(request.result)) store.delete(localId);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    await this.initCounts();
  }

  /**
   * مزامنة جميع الفواتير المعلقة في الطابور ورفعها للخادم تلقائياً
   */
  public async syncPendingSales(): Promise<{ synced: number; failed: number }> {
    if (this.isEffectivelyOffline() || this.state.isSyncing) {
      return { synced: 0, failed: 0 };
    }

    const pending = await this.getPendingSales();
    if (pending.length === 0) return { synced: 0, failed: 0 };

    this.state.isSyncing = true;
    this.notify();

    let synced = 0;
    let failed = 0;

    try {
      for (const item of pending) {
        try {
          const { user, token } = useAuthStore.getState();
          if (!token || !user || !item.payload.offlineSaleId ||
              item.payload.companyId !== user.companyId || item.payload.cashierId !== user.id ||
              (user.branchId && item.payload.branchId !== user.branchId)) {
            continue;
          }
          const res = await apiFetch('/api/sales/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item.payload),
          });

          const response = await res.json().catch(() => null);
          if (res.ok && response?.success === true && typeof response.data?.saleId === 'string') {
            await this.removeQueuedSale(item.localId);
            synced++;
          } else {
            failed++;
            await this.updateFailedSale(
              item,
              response?.message || `HTTP Error ${res.status}`,
            );
          }
        } catch (netErr: any) {
          failed++;
          await this.updateFailedSale(item, netErr.message || 'فشل الاتصال بالخادم');
          break; // Stop loop if network dropped again
        }
      }

      if (synced > 0) {
        const nowIso = new Date().toISOString();
        this.state.lastOutboxSyncAt = nowIso;
        localStorage.setItem('dawacore_last_outbox_sync', nowIso);
      }
    } finally {
      this.state.isSyncing = false;
      await this.initCounts();
      this.notify();
    }

    return { synced, failed };
  }

  private async updateFailedSale(item: OfflineQueuedSale, errorMessage: string) {
    try {
      const db = await this.openDb();
      const updated: OfflineQueuedSale = {
        ...item,
        status: 'FAILED',
        retryCount: (item.retryCount || 0) + 1,
        lastError: errorMessage,
      };
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_OUTBOX, 'readwrite');
        tx.objectStore(STORE_OUTBOX).put(updated);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {}
  }
}

export const offlinePosEngine = new OfflinePosEngine();
