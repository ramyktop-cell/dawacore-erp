import { getCurrentUser } from '../../utils/permissions';
import React, { useEffect, useState } from 'react';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Printer,
  CheckCircle2,
  AlertTriangle,
  Database,
  X,
} from 'lucide-react';
import {
  offlinePosEngine,
  OfflineQueuedSale,
  OfflineSyncSnapshot,
} from '../../services/offline-pos.service';
import { ThermalPrinterService } from '../../services/printer.service';

interface OfflineQueueModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OfflineQueueModal: React.FC<OfflineQueueModalProps> = ({ isOpen, onClose }) => {
  const [snapshot, setSnapshot] = useState<OfflineSyncSnapshot>(offlinePosEngine.getSnapshot());
  const [queuedSales, setQueuedSales] = useState<OfflineQueuedSale[]>([]);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const loadQueue = async () => {
    const list = await offlinePosEngine.getPendingSales();
    setQueuedSales(list);
  };

  useEffect(() => {
    const unsub = offlinePosEngine.subscribe((snap) => {
      setSnapshot(snap);
      loadQueue();
    });
    if (isOpen) {
      loadQueue();
      setSyncMessage(null);
    }
    return unsub;
  }, [isOpen]);

  if (!isOpen) return null;

  const isOffline = !snapshot.isOnline || snapshot.isSimulatedOffline;

  const handleManualSync = async () => {
    if (isOffline) {
      alert('النظام في وضع عدم الاتصال حالياً. قم بإلغاء محاكاة الأوفلاين أو تأكد من اتصال الإنترنت للمزامنة.');
      return;
    }
    setSyncMessage('جاري رفع الفواتير ومزامنتها مع الخادم...');
    const res = await offlinePosEngine.syncPendingSales();
    await loadQueue();
    if (res.synced > 0 && res.failed === 0) {
      setSyncMessage(`✅ تمت مزامنة وترحيل (${res.synced}) فاتورة إلى الخادم بنجاح!`);
    } else if (res.failed > 0) {
      setSyncMessage(`⚠️ تمت مزامنة (${res.synced}) فاتورة، وتعذر ترحيل (${res.failed}) فاتورة.`);
    } else {
      setSyncMessage('لا توجد فواتير معلقة للمزامنة.');
    }
  };

  const handleRefreshCatalog = async () => {
    if (isOffline) {
      alert('يجب أن تكون متصلاً بالإنترنت لتحديث ذاكرة الأصناف المحلية.');
      return;
    }
    setSyncMessage('جاري تحديث قاعدة بيانات الأصناف والباركود المحلية...');
    const count = await offlinePosEngine.refreshCatalogFromServer();
    setSyncMessage(`✅ تم حفظ (${count}) صنف وباركود في الذاكرة المحلية للعمل بدون إنترنت!`);
  };

  const handleReprintOfflineReceipt = (sale: OfflineQueuedSale) => {
    ThermalPrinterService.printInvoice({
      companyName: getCurrentUser()?.companyName || undefined,
      branchName: 'فرع نقطة البيع (نسخة أوفلاين)',
      invoiceNumber: sale.offlineInvoiceNumber,
      createdAt: sale.createdAt,
      cashierName: sale.receiptSnapshot.cashierName,
      customerName: sale.receiptSnapshot.customerName,
      paymentMethod: sale.receiptSnapshot.paymentMethod,
      items: sale.receiptSnapshot.items,
      grandTotal: sale.receiptSnapshot.grandTotal,
      paidAmount: sale.receiptSnapshot.paidAmount,
      changeAmount: sale.receiptSnapshot.changeAmount,
      footerMessage: 'فاتورة مصدرة بالوضع المحلي (Offline Mode) • شكراً لزيارتكم',
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
      dir="rtl"
    >
      <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl ${
                isOffline
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              {isOffline ? <WifiOff className="w-6 h-6" /> : <Wifi className="w-6 h-6" />}
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-base">
                مركز العمل بدون إنترنت والمزامنة التلقائية (Offline-First POS)
              </h3>
              <p className="text-xs text-slate-500">
                حفظ الفواتير محلياً في المتصفح (`IndexedDB`) عند انقطاع الشبكة ورفعها تلقائياً فور عودة الإنترنت
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status & Simulation Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
            <div>
              <span className="text-slate-400 block font-semibold">حالة الاتصال الحالية</span>
              <span
                className={`font-black text-sm mt-0.5 block ${
                  isOffline ? 'text-amber-600' : 'text-emerald-600'
                }`}
              >
                {isOffline ? '⚡ وضع أوفلاين نشط' : '🌐 متصل بالخادم (أونلاين)'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => offlinePosEngine.setSimulatedOffline(!snapshot.isSimulatedOffline)}
              className={`px-3 py-1.5 rounded-lg font-bold text-[11px] transition cursor-pointer border ${
                snapshot.isSimulatedOffline
                  ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                  : 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200'
              }`}
            >
              {snapshot.isSimulatedOffline ? 'إعادة الاتصال الآن' : 'تجربة وضع الأوفلاين'}
            </button>
          </div>

          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
            <div>
              <span className="text-slate-400 block font-semibold">الأصناف المحفوظة أوفلاين</span>
              <span className="font-mono font-black text-base text-slate-800 mt-0.5 block">
                {snapshot.catalogCount} صنف وباركود
              </span>
            </div>
            <button
              type="button"
              disabled={isOffline}
              onClick={handleRefreshCatalog}
              className="p-2 rounded-lg bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100 disabled:opacity-40 cursor-pointer"
              title="تحديث دليل الأصناف والباركود للعمل أوفلاين"
            >
              <Database className="w-4 h-4" />
            </button>
          </div>

          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
            <div>
              <span className="text-slate-400 block font-semibold">فواتير بانتظار الرفع</span>
              <span
                className={`font-mono font-black text-base mt-0.5 block ${
                  snapshot.pendingCount > 0 ? 'text-amber-600' : 'text-emerald-600'
                }`}
              >
                {snapshot.pendingCount} فاتورة معلقة
              </span>
            </div>
            <button
              type="button"
              disabled={isOffline || snapshot.pendingCount === 0 || snapshot.isSyncing}
              onClick={handleManualSync}
              className="px-3 py-1.5 rounded-lg bg-[#00A8A8] text-white font-bold hover:bg-[#008f8f] disabled:opacity-40 flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${snapshot.isSyncing ? 'animate-spin' : ''}`} />
              <span>رفع الآن</span>
            </button>
          </div>
        </div>

        {syncMessage && (
          <div className="p-3 rounded-xl bg-teal-50 border border-teal-200 text-teal-900 text-xs font-bold flex items-center justify-between">
            <span>{syncMessage}</span>
            <button onClick={() => setSyncMessage(null)} className="text-teal-600 hover:text-teal-800">
              ✕
            </button>
          </div>
        )}

        {/* Queued Invoices List */}
        <div className="flex-1 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
          {queuedSales.length === 0 ? (
            <div className="py-12 text-center space-y-2 text-slate-400">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <p className="text-sm font-bold text-slate-700">
                جميع الفواتير متزامنة ومرفوعة إلى الخادم بالكامل!
              </p>
              <p className="text-xs">
                لتجربة البيع أوفلاين: اضغط على زر «تجربة وضع الأوفلاين» بالأعلى، ثم قم ببيع أي صنف في شاشة الكاشير.
              </p>
            </div>
          ) : (
            queuedSales.map((sale) => (
              <div
                key={sale.localId}
                className="p-3.5 hover:bg-slate-50 transition flex items-center justify-between gap-4 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-sm text-[#582949]">
                      {sale.offlineInvoiceNumber}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        sale.status === 'FAILED'
                          ? 'bg-rose-100 text-rose-700 border border-rose-200'
                          : 'bg-amber-100 text-amber-800 border border-amber-200'
                      }`}
                    >
                      {sale.status === 'FAILED' ? 'تعذر الرفع (سيعاد تلقائياً)' : 'محفوظة محلياً بانتظار الإنترنت'}
                    </span>
                  </div>
                  <div className="text-slate-500">
                    التاريخ: {new Date(sale.createdAt).toLocaleString('ar-EG')} • العميل:{' '}
                    <strong>{sale.receiptSnapshot.customerName}</strong> • الأصناف:{' '}
                    <strong>{sale.receiptSnapshot.items.length}</strong>
                  </div>
                  {sale.lastError && (
                    <div className="text-rose-600 text-[11px] flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>السبب: {sale.lastError}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-left font-mono">
                    <div className="font-black text-sm text-teal-700">
                      {Number(sale.receiptSnapshot.grandTotal).toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                      })}{' '}
                      ج.س
                    </div>
                    <div className="text-[10px] text-slate-400">{sale.receiptSnapshot.paymentMethod}</div>
                  </div>

                  <button
                    onClick={() => handleReprintOfflineReceipt(sale)}
                    className="p-2 rounded-lg bg-slate-100 hover:bg-teal-50 text-slate-700 hover:text-teal-700 transition cursor-pointer"
                    title="إعادة طباعة الإيصال الحراري"
                  >
                    <Printer className="w-4 h-4" />
                  </button>

                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
          <span>
            آخر مزامنة للأصناف:{' '}
            {snapshot.lastCatalogSyncAt
              ? new Date(snapshot.lastCatalogSyncAt).toLocaleTimeString('ar-EG')
              : 'عند بدء الجلسة'}
          </span>
          <div className="flex items-center gap-2">
            {queuedSales.length > 0 && (
              <button
                type="button"
                onClick={() => offlinePosEngine.exportPendingSalesToJson()}
                className="px-3.5 py-2 rounded-xl border border-teal-200 bg-teal-50 text-teal-800 font-bold hover:bg-teal-100 transition cursor-pointer"
                title="تنزيل نسخة احتياطية من فواتير الأوفلاين على القرص الصلب أو فلاش ميموري"
              >
                💾 تنزيل نسخة احتياطية للفواتير (JSON)
              </button>
            )}
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-slate-800 text-white font-bold hover:bg-slate-900 transition cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
