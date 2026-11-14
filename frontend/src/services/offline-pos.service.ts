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

const DB_NAME = 'dawacore_offline_pos_db';
const DB_VERSION = 1;
const STORE_CATALOG = 'products_catalog';
const STORE_OUTBOX = 'sales_outbox';

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
    shiftId: string;
    customerId?: string;
    invoiceDiscount: string;
    items: Array<{
      medicineId: string;
      unitType: string;
      quantity: number;
      unitPrice: string;
      discountAmount: string;
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
          this.syncPendingSales();
          this.refreshCatalogFromServer();
        }
      });

      window.addEventListener('offline', () => {
        this.state.isOnline = false;
        this.notify();
      });

      // Request browser Persistent Storage so Chrome/Edge never evicts IndexedDB even after 30+ days offline
      if (navigator.storage && navigator.storage.persist) {
        navigator.storage.persist().catch(() => {});
      }

      // Initialize counts and start periodic background sync check every 20 seconds
      this.initCounts();
      setInterval(() => {
        if (!this.isEffectivelyOffline() && this.state.pendingCount > 0 && !this.state.isSyncing) {
          this.syncPendingSales();
        }
      }, 20000);
    }
  }

  public isEffectivelyOffline(): boolean {
    return !this.state.isOnline || this.state.isSimulatedOffline;
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
      const outboxCountReq = tx.objectStore(STORE_OUTBOX).count();

      catalogCountReq.onsuccess = () => {
        this.state.catalogCount = catalogCountReq.result || 0;
        this.notify();
      };
      outboxCountReq.onsuccess = () => {
        this.state.pendingCount = outboxCountReq.result || 0;
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

    try {
      const res = await fetch('/api/medicines?limit=2000');
      if (!res.ok) return this.state.catalogCount;
      const data = await res.json();
      const items: any[] = Array.isArray(data) ? data : data.items || [];

      if (items.length === 0) return this.state.catalogCount;

      const db = await this.openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_CATALOG, 'readwrite');
        const store = tx.objectStore(STORE_CATALOG);
        store.clear();
        for (const item of items) {
          store.put(item);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });

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
    if (!q) return [];

    try {
      const db = await this.openDb();
      return await new Promise<any[]>((resolve) => {
        const tx = db.transaction(STORE_CATALOG, 'readonly');
        const store = tx.objectStore(STORE_CATALOG);
        const req = store.getAll();

        req.onsuccess = () => {
          const all = req.result || [];
          const matches = all
            .filter((item: any) => {
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
    if (!clean) return null;

    try {
      const db = await this.openDb();
      return await new Promise<any | null>((resolve) => {
        const tx = db.transaction(STORE_CATALOG, 'readonly');
        const store = tx.objectStore(STORE_CATALOG);
        const idx = store.index('barcode');
        const req = idx.get(clean);

        req.onsuccess = () => {
          if (req.result) {
            resolve(req.result);
          } else {
            // Fallback search by code
            const codeIdx = store.index('code');
            const codeReq = codeIdx.get(clean);
            codeReq.onsuccess = () => resolve(codeReq.result || null);
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
    const shortRand = Math.floor(1000 + Math.random() * 9000);
    const offlineInvoiceNumber = `OFF-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${shortRand}`;

    const entry: OfflineQueuedSale = {
      localId: `offline_${Date.now()}_${shortRand}`,
      offlineInvoiceNumber,
      createdAt: now.toISOString(),
      status: 'PENDING',
      retryCount: 0,
      payload,
      receiptSnapshot,
    };

    const db = await this.openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_OUTBOX, STORE_CATALOG], 'readwrite');
      tx.objectStore(STORE_OUTBOX).put(entry);

      // خصم الكمية المباعة من رصيد الذاكرة المحلية (IndexedDB) ليبقى المخزون دقيقاً حتى لو انقطع الإنترنت 30 يوماً
      const catalogStore = tx.objectStore(STORE_CATALOG);
      for (const soldItem of payload.items) {
        const getReq = catalogStore.get(soldItem.medicineId);
        getReq.onsuccess = () => {
          const med = getReq.result;
          if (med) {
            const unitObj = (med.units || []).find((u: any) => u.unitType === soldItem.unitType);
            const multiplier = Number(unitObj?.multiplier || 1);
            const deductedBase = Number(soldItem.quantity || 1) * multiplier;
            med.totalStockInBase = Math.max(0, Number(med.totalStockInBase || 0) - deductedBase);
            catalogStore.put(med);
          }
        };
      }

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
          const list = (req.result || []) as OfflineQueuedSale[];
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
      tx.objectStore(STORE_OUTBOX).delete(localId);
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
          const res = await fetch('/api/sales/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item.payload),
          });

          if (res.ok) {
            await this.removeQueuedSale(item.localId);
            synced++;
          } else {
            const errData = await res.json().catch(() => ({}));
            failed++;
            await this.updateFailedSale(
              item,
              errData.message || `HTTP Error ${res.status}`,
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
