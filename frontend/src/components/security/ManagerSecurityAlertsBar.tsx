import React, { useEffect, useState, useCallback, useRef } from 'react';
import { ShieldAlert, Bell, CheckCircle2, Clock, User, ShoppingCart, X, Eye } from 'lucide-react';
import { dashboardApi, PosSecurityAlert } from '../../api/dashboard';
import {
  getLocalSecurityAlerts,
  acknowledgeLocalSecurityAlert,
  playManagerSecurityAlarmSound,
} from '../../utils/pos-security';
import { getCurrentUser, getUserRole } from '../../utils/permissions';

export const ManagerSecurityAlertsBar: React.FC = () => {
  const role = getUserRole();
  const isManager =
    role === 'SUPER_ADMIN' || role === 'COMPANY_ADMIN' || role === 'BRANCH_MANAGER';

  const [alerts, setAlerts] = useState<PosSecurityAlert[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const lastUnreadCountRef = useRef<number>(0);

  const loadAlerts = useCallback(async () => {
    if (!isManager) return;
    const currentUser = getCurrentUser();
    const localList = getLocalSecurityAlerts() as PosSecurityAlert[];

    try {
      const serverData = await dashboardApi.getSecurityAlerts({
        companyId: currentUser?.companyId,
        limit: 25,
      });
      const serverList = Array.isArray(serverData?.alerts) ? serverData.alerts : [];

      // دمج التنبيهات المحلية (أوفلاين) مع تنبيهات قاعدة البيانات بدون تكرار
      const mergedMap = new Map<string, PosSecurityAlert>();
      for (const item of [...serverList, ...localList]) {
        const dedupKey = `${item.userId}-${item.reason}-${new Date(item.createdAt).toISOString().slice(0, 16)}`;
        if (!mergedMap.has(dedupKey)) {
          mergedMap.set(dedupKey, item);
        }
      }

      const merged = Array.from(mergedMap.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      const unread = merged.filter((a) => !a.acknowledged).length;
      if (unread > lastUnreadCountRef.current) {
        playManagerSecurityAlarmSound();
      }
      lastUnreadCountRef.current = unread;
      setAlerts(merged);
    } catch {
      const unread = localList.filter((a) => !a.acknowledged).length;
      if (unread > lastUnreadCountRef.current) {
        playManagerSecurityAlarmSound();
      }
      lastUnreadCountRef.current = unread;
      setAlerts(localList);
    }
  }, [isManager]);

  useEffect(() => {
    if (!isManager) return;
    loadAlerts();

    const interval = window.setInterval(loadAlerts, 6000);

    const handleCustomAlert = () => {
      playManagerSecurityAlarmSound();
      loadAlerts();
    };

    window.addEventListener('dawacore-security-alert', handleCustomAlert);
    window.addEventListener('dawacore-security-alert-updated', loadAlerts);

    let bc: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel('dawacore_security_alerts_channel');
      bc.onmessage = (ev) => {
        if (ev.data?.type === 'NEW_SECURITY_ALERT') {
          playManagerSecurityAlarmSound();
          loadAlerts();
        }
      };
    }

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('dawacore-security-alert', handleCustomAlert);
      window.removeEventListener('dawacore-security-alert-updated', loadAlerts);
      bc?.close();
    };
  }, [isManager, loadAlerts]);

  if (!isManager) return null;

  const unreadAlerts = alerts.filter((a) => !a.acknowledged);
  const latestUnread = unreadAlerts[0];

  const handleAcknowledgeOne = async (alertItem: PosSecurityAlert) => {
    const currentUser = getCurrentUser();
    acknowledgeLocalSecurityAlert(alertItem.id);
    try {
      if (!String(alertItem.id).startsWith('local-sec-')) {
        await dashboardApi.acknowledgeSecurityAlert(
          alertItem.id,
          currentUser?.name || currentUser?.username || 'المدير',
        );
      }
    } catch {
      // ignore offline
    }
    loadAlerts();
  };

  const handleAcknowledgeAll = async () => {
    const currentUser = getCurrentUser();
    acknowledgeLocalSecurityAlert();
    try {
      await dashboardApi.acknowledgeAllSecurityAlerts(
        currentUser?.companyId,
        currentUser?.name || currentUser?.username || 'المدير',
      );
    } catch {
      // ignore offline
    }
    lastUnreadCountRef.current = 0;
    loadAlerts();
  };

  return (
    <>
      {/* 🚨 شريط التنبيه الأمني العاجل أعلى الشاشة للمدير عند وجود محاولة فتح كونسول غير مقروءة */}
      {latestUnread && (
        <div
          className="bg-gradient-to-r from-rose-700 via-red-600 to-rose-800 text-white px-5 py-3 shadow-lg border-b border-rose-400/40 flex flex-wrap items-center justify-between gap-3 z-50 print:hidden"
          dir="rtl"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 border border-white/30 animate-bounce">
              <ShieldAlert className="w-5 h-5 text-amber-200" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-black bg-amber-400 text-slate-950 px-2 py-0.5 rounded-full">
                  إشعار أمني فوري للمدير ({unreadAlerts.length} غير مقروء)
                </span>
                <span className="text-sm font-black">
                  {latestUnread.reason}
                </span>
              </div>
              <div className="flex items-center gap-4 text-[11px] text-rose-100 mt-1 font-medium flex-wrap">
                <span className="flex items-center gap-1">
                  <User className="w-3.5 h-3.5" />
                  المستخدم/الكاشير: <strong>{latestUnread.cashierName}</strong>
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  الوقت:{' '}
                  <strong>
                    {new Date(latestUnread.createdAt).toLocaleTimeString('ar-EG')} —{' '}
                    {new Date(latestUnread.createdAt).toLocaleDateString('ar-EG')}
                  </strong>
                </span>
                <span className="flex items-center gap-1">
                  <ShoppingCart className="w-3.5 h-3.5" />
                  السلة وقت الحدث:{' '}
                  <strong>
                    {latestUnread.cartItemsCount} أصناف ({Number(latestUnread.cartTotal || 0).toLocaleString()} ج.س)
                  </strong>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-1.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/25 px-3.5 py-1.5 text-xs font-bold text-white transition cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>سجل الرقابة ({alerts.length})</span>
            </button>
            <button
              type="button"
              onClick={handleAcknowledgeAll}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-3.5 py-1.5 text-xs font-black shadow transition cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>تمت المراجعة وإخفاء التنبيه</span>
            </button>
          </div>
        </div>
      )}

      {/* نافذة تفاصيل جميع التنبيهات الأمنية للمدير */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-4 print:hidden"
          dir="rtl"
        >
          <div className="w-full max-w-3xl rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between bg-slate-900 text-white px-6 py-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-400">
                  <Bell className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black">
                    سجل إشعارات الرقابة الأمنية لنقاط البيع (POS Console Alerts)
                  </h3>
                  <p className="text-xs text-slate-400">
                    يرصد هذا السجل أي محاولة لفتح الكونسول (F12 / DevTools) أو تعديل قيم المبيعات في أجهزة الكاشير
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-3 flex-1 bg-slate-50">
              {alerts.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-sm font-bold">
                  لا توجد أي تنبيهات أمنية مسجلة حتى الآن.
                </div>
              ) : (
                alerts.map((item) => (
                  <div
                    key={item.id}
                    className={`rounded-2xl border p-4 transition flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                      item.acknowledged
                        ? 'bg-white border-slate-200 text-slate-600'
                        : 'bg-rose-50/90 border-rose-300 text-slate-900 shadow-xs'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-[10px] font-black px-2.5 py-0.5 rounded-full ${
                            item.acknowledged
                              ? 'bg-slate-200 text-slate-700'
                              : 'bg-rose-600 text-white animate-pulse'
                          }`}
                        >
                          {item.acknowledged ? 'تمت المراجعة' : 'تنبيه جديد غير مقروء'}
                        </span>
                        <span className="text-xs font-black text-rose-800">
                          المستخدم: {item.cashierName}
                        </span>
                        <span className="text-[11px] font-mono text-slate-500">
                          {new Date(item.createdAt).toLocaleString('ar-EG')}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-slate-800">{item.reason}</p>
                      <div className="flex items-center gap-4 text-[11px] text-slate-500">
                        <span>عدد الأصناف بالسلة: {item.cartItemsCount}</span>
                        <span>إجمالي السلة: {Number(item.cartTotal || 0).toLocaleString()} ج.س</span>
                        {item.ipAddress && <span>IP: {item.ipAddress}</span>}
                      </div>
                    </div>

                    {!item.acknowledged && (
                      <button
                        type="button"
                        onClick={() => handleAcknowledgeOne(item)}
                        className="shrink-0 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 text-xs font-bold shadow-xs transition cursor-pointer"
                      >
                        ✓ تأكيد المراجعة
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center justify-between bg-white px-6 py-3.5 border-t border-slate-200">
              <span className="text-xs text-slate-500 font-bold">
                إجمالي السجلات: {alerts.length} | غير مقروء: {unreadAlerts.length}
              </span>
              <div className="flex items-center gap-2">
                {unreadAlerts.length > 0 && (
                  <button
                    type="button"
                    onClick={handleAcknowledgeAll}
                    className="rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 text-xs font-bold transition cursor-pointer"
                  >
                    تحديد الكل كمقروء
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 px-4 py-2 text-xs font-bold transition cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
