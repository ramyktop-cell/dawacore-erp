import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  Search,
  RefreshCw,
  User,
  Monitor,
  Globe,
  Clock,
  Eye,
  X,
  Filter,
  AlertTriangle,
  FileSpreadsheet,
  Activity,
} from 'lucide-react';
import { ROLE_LABELS } from '../utils/permissions';

interface AuditLogEntry {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  branchId?: string | null;
  action: string;
  actionLabel: string;
  entityType: string;
  entityId: string;
  summary: string;
  path: string;
  method: string;
  ipAddress: string;
  userAgent: string;
  deviceSummary: string;
  inputData: any;
  resultSummary: any;
  createdAt: string;
}

interface AuditLogsResponse {
  kpis: {
    totalLogs: number;
    uniqueUsers: number;
    uniqueIps: number;
    securityAlertsCount: number;
    mutationsCount: number;
    screenViewsCount: number;
  };
  usersList: Array<{ id: string; name: string; username: string; role: string }>;
  items: AuditLogEntry[];
}

const FIELD_ARABIC_LABELS: Record<string, string> = {
  tradeName: 'الاسم التجاري للصنف',
  scientificName: 'الاسم العلمي / الوصف',
  barcode: 'الباركود',
  code: 'الكود',
  category: 'التصنيف',
  minStockLevel: 'حد الطلب الأدنى',
  price: 'السعر',
  salePrice: 'سعر البيع',
  costPrice: 'سعر التكلفة',
  quantity: 'الكمية',
  quantityInBase: 'الكمية بالوحدة الأساسية',
  batchNumber: 'رقم التشغيلة',
  expiryDate: 'تاريخ الصلاحية',
  grandTotal: 'الإجمالي النهائي',
  subTotal: 'المجموع الفرعي',
  paidAmount: 'المبلغ المدفوع',
  discountTotal: 'إجمالي الخصم',
  paymentMethod: 'طريقة الدفع',
  items: 'الأصناف / البنود المدخلة',
  name: 'الاسم',
  username: 'اسم الدخول',
  role: 'الدور الوظيفي',
  phone: 'رقم الهاتف',
  amount: 'المبلغ',
  expenseType: 'نوع المصروف',
  description: 'البيان / الوصف',
  openingCash: 'رصيد العهدة الافتتاحي',
  closingCash: 'النقدية الفعلية عند الإغلاق',
  reason: 'السبب / التفاصيل',
  screenName: 'اسم الشاشة',
  path: 'مسار الرابط',
  cartItemsCount: 'عدد الأصناف بالسلة',
  cartTotal: 'قيمة السلة',
};

export const AuditLogsPage: React.FC = () => {
  const [data, setData] = useState<AuditLogsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState('ALL');
  const [selectedAction, setSelectedAction] = useState('ALL');
  const [selectedEntity, setSelectedEntity] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedUser !== 'ALL') params.set('userId', selectedUser);
      if (selectedAction !== 'ALL') params.set('action', selectedAction);
      if (selectedEntity !== 'ALL') params.set('entityType', selectedEntity);
      if (search.trim()) params.set('search', search.trim());
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      params.set('limit', '200');

      const res = await fetch(`/api/dashboard/audit-logs?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error('Failed to load audit logs:', e);
    } finally {
      setLoading(false);
    }
  }, [selectedUser, selectedAction, selectedEntity, search, dateFrom, dateTo]);

  useEffect(() => {
    fetchLogs();
    const timer = window.setInterval(fetchLogs, 12000);
    return () => window.clearInterval(timer);
  }, [fetchLogs]);

  const getActionBadgeClass = (action: string) => {
    if (action === 'POS_SECURITY_ALERT') {
      return 'bg-rose-600 text-white border-rose-700 animate-pulse';
    }
    if (action === 'DELETE_RECORD') {
      return 'bg-red-100 text-red-800 border-red-300';
    }
    if (action === 'UPDATE_RECORD') {
      return 'bg-amber-100 text-amber-800 border-amber-300';
    }
    if (action === 'CREATE_RECORD' || action === 'POS_SALE' || action === 'SALE_CREATED') {
      return 'bg-emerald-100 text-emerald-800 border-emerald-300';
    }
    if (action === 'USER_LOGIN') {
      return 'bg-purple-100 text-purple-800 border-purple-300';
    }
    if (action === 'SCREEN_VIEW') {
      return 'bg-sky-100 text-sky-800 border-sky-300';
    }
    return 'bg-slate-100 text-slate-700 border-slate-300';
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 font-sans" dir="rtl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white rounded-3xl p-6 shadow-xs border border-slate-200">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#582949] text-white shadow-md">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900">
              سجل الرقابة الشامل ومتابعة حركات المستخدمين والأجهزة (Audit Trail)
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              متابعة لحظية لكل مستخدم: أين دخل، ماذا أدخل، ماذا عدّل، ومن أي جهاز وعنوان IP على الشبكة
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={fetchLogs}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl bg-[#582949] hover:bg-[#431f38] text-white px-4 py-2.5 text-xs font-bold shadow transition cursor-pointer disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>تحديث السجل الآن</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500">إجمالي الحركات المرصودة</p>
            <p className="text-2xl font-black font-mono text-slate-900 mt-1">
              {data?.kpis?.totalLogs ?? 0}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              دخول شاشات: {data?.kpis?.screenViewsCount ?? 0}
            </p>
          </div>
          <div className="h-12 w-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Activity className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500">عمليات الإدخال والتعديل والبيع</p>
            <p className="text-2xl font-black font-mono text-emerald-700 mt-1">
              {data?.kpis?.mutationsCount ?? 0}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">إضافة وتعديل وحذف وفواتير</p>
          </div>
          <div className="h-12 w-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500">المستخدمون والأجهزة (IPs)</p>
            <p className="text-2xl font-black font-mono text-[#582949] mt-1">
              {data?.kpis?.uniqueUsers ?? 0} مستخدم / {data?.kpis?.uniqueIps ?? 0} IP
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">عناوين الأجهزة المتصلة بالنظام</p>
          </div>
          <div className="h-12 w-12 rounded-2xl bg-purple-50 text-[#582949] flex items-center justify-center">
            <Globe className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-rose-200 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-rose-600">التنبيهات الأمنية وفتح الكونسول</p>
            <p className="text-2xl font-black font-mono text-rose-600 mt-1">
              {data?.kpis?.securityAlertsCount ?? 0}
            </p>
            <p className="text-[11px] text-rose-400 mt-0.5">محاولات فتح F12 / DevTools</p>
          </div>
          <div className="h-12 w-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-2xs space-y-4">
        <div className="flex items-center gap-2 text-xs font-black text-slate-700">
          <Filter className="w-4 h-4 text-[#00A8A8]" />
          <span>تصفية وبحث متقدم في سجل حركات المستخدمين</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {/* Search input */}
          <div className="relative md:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث باسم الموظف، رقم الـ IP، اسم الصنف، أو الشاشة..."
              className="w-full rounded-xl border border-slate-300 bg-slate-50 pr-10 pl-3 py-2 text-xs font-bold text-slate-800 focus:border-[#00A8A8] focus:bg-white focus:outline-none"
            />
          </div>

          {/* Action filter */}
          <select
            value={selectedAction}
            onChange={(e) => setSelectedAction(e.target.value)}
            className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800 focus:border-[#00A8A8] focus:outline-none"
          >
            <option value="ALL">كل أنواع الحركات</option>
            <option value="SCREEN_VIEW">🖥️ دخول وتصفح شاشة</option>
            <option value="USER_LOGIN">🔑 تسجيل دخول</option>
            <option value="CREATE_RECORD">➕ إضافة / إدخال جديد</option>
            <option value="UPDATE_RECORD">✏️ تعديل بيانات</option>
            <option value="DELETE_RECORD">🗑️ حذف سجل</option>
            <option value="POS_SALE">🛒 إصدار فاتورة مبيعات</option>
            <option value="POS_SECURITY_ALERT">🚨 تنبيه أمني / فتح الكونسول</option>
          </select>

          {/* Entity filter */}
          <select
            value={selectedEntity}
            onChange={(e) => setSelectedEntity(e.target.value)}
            className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800 focus:border-[#00A8A8] focus:outline-none"
          >
            <option value="ALL">كل الأقسام والشاشات</option>
            <option value="تصفح الشاشات">تصفح الشاشات</option>
            <option value="الأصناف والمنتجات">الأصناف والمنتجات</option>
            <option value="التشغيلات والمخزون">التشغيلات والمخزون</option>
            <option value="المبيعات ونقاط البيع">المبيعات ونقاط البيع</option>
            <option value="المرتجعات">المرتجعات</option>
            <option value="المشتريات والتوريد">المشتريات والتوريد</option>
            <option value="المصروفات وسندات الصرف">المصروفات وسندات الصرف</option>
            <option value="الورديات والصندوق">الورديات والصندوق</option>
            <option value="المستخدمين والصلاحيات">المستخدمين والصلاحيات</option>
            <option value="العملاء والمديونيات">العملاء والمديونيات</option>
            <option value="إعدادات النظام">إعدادات النظام</option>
            <option value="POS_TERMINAL">تنبيهات أمان نقاط البيع</option>
          </select>

          {/* Date filter */}
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-2.5 py-2 text-xs font-bold text-slate-800 focus:border-[#00A8A8] focus:outline-none"
              title="من تاريخ"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-2.5 py-2 text-xs font-bold text-slate-800 focus:border-[#00A8A8] focus:outline-none"
              title="إلى تاريخ"
            />
          </div>
        </div>
      </div>

      {/* Table of Audit Logs */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white text-xs font-bold">
                <th className="py-3.5 px-4">التاريخ والوقت</th>
                <th className="py-3.5 px-4">المستخدم والدور</th>
                <th className="py-3.5 px-4">نوع الحركة</th>
                <th className="py-3.5 px-4">القسم / الشاشة</th>
                <th className="py-3.5 px-4">ماذا فعل / ماذا أدخل أو عدّل</th>
                <th className="py-3.5 px-4">الجهاز والمتصفح</th>
                <th className="py-3.5 px-4">عنوان الـ IP</th>
                <th className="py-3.5 px-4 text-center">التفاصيل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loading && (!data?.items || data.items.length === 0) ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 font-bold">
                    جاري تحميل سجل الرقابة وحركات المستخدمين...
                  </td>
                </tr>
              ) : !data?.items || data.items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 font-bold">
                    لا توجد حركات مطابقة لمعايير البحث الحالية.
                  </td>
                </tr>
              ) : (
                data.items.map((row) => (
                  <tr
                    key={row.id}
                    className={`hover:bg-slate-50 transition ${
                      row.action === 'POS_SECURITY_ALERT' ? 'bg-rose-50/60' : ''
                    }`}
                  >
                    <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-slate-600">
                      <div className="font-bold text-slate-800">
                        {new Date(row.createdAt).toLocaleTimeString('ar-EG')}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {new Date(row.createdAt).toLocaleDateString('ar-EG')}
                      </div>
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-[#582949]/10 text-[#582949] flex items-center justify-center font-black text-[11px]">
                          <User className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="font-black text-slate-900">{row.userName}</div>
                          <div className="text-[10px] text-slate-500">
                            {ROLE_LABELS[row.userRole] || row.userRole}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-black ${getActionBadgeClass(
                          row.action,
                        )}`}
                      >
                        {row.actionLabel}
                      </span>
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap font-bold text-slate-700">
                      {row.entityType}
                    </td>

                    <td className="py-3 px-4 max-w-md">
                      <p className="font-bold text-slate-800 line-clamp-2">{row.summary}</p>
                      {row.path && (
                        <span className="text-[10px] font-mono text-slate-400">{row.path}</span>
                      )}
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700">
                        <Monitor className="w-3.5 h-3.5 text-slate-400" />
                        <span>{row.deviceSummary}</span>
                      </div>
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 border border-slate-200 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-700">
                        <Globe className="w-3 h-3 text-teal-600" />
                        {row.ipAddress}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setSelectedEntry(row)}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#00A8A8]/10 hover:bg-[#00A8A8] text-[#00A8A8] hover:text-white px-2.5 py-1 text-[11px] font-bold transition cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>عرض ما أُدخل</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Detailed View of What the User Entered / Modified */}
      {selectedEntry && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-4"
          dir="rtl"
        >
          <div className="w-full max-w-2xl rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between bg-[#582949] text-white px-6 py-4">
              <div>
                <h3 className="text-base font-black">
                  تفاصيل الحركة والبيانات المدخلة / المعدلة
                </h3>
                <p className="text-xs text-white/75 mt-0.5">
                  المستخدم: {selectedEntry.userName} —{' '}
                  {new Date(selectedEntry.createdAt).toLocaleString('ar-EG')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEntry(null)}
                className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1 bg-slate-50 text-xs">
              {/* Metadata Grid */}
              <div className="grid grid-cols-2 gap-3 bg-white p-4 rounded-2xl border border-slate-200">
                <div>
                  <span className="text-slate-400 font-bold block">المستخدم:</span>
                  <span className="font-black text-slate-900 text-sm">
                    {selectedEntry.userName} ({ROLE_LABELS[selectedEntry.userRole] || selectedEntry.userRole})
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold block">نوع العملية:</span>
                  <span className="font-black text-[#582949] text-sm">
                    {selectedEntry.actionLabel}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold block">عنوان الـ IP:</span>
                  <span className="font-mono font-bold text-teal-700">
                    {selectedEntry.ipAddress}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold block">الجهاز والمتصفح:</span>
                  <span className="font-bold text-slate-800">{selectedEntry.deviceSummary}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-400 font-bold block">ملخص الحركة:</span>
                  <span className="font-bold text-slate-900">{selectedEntry.summary}</span>
                </div>
              </div>

              {/* Input / Modified Data */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-2.5">
                <h4 className="font-black text-slate-900 border-b border-slate-100 pb-2">
                  📋 البيانات والقيم التي أدخلها أو عدّلها المستخدم:
                </h4>
                {selectedEntry.inputData &&
                typeof selectedEntry.inputData === 'object' &&
                Object.keys(selectedEntry.inputData).length > 0 ? (
                  <div className="divide-y divide-slate-100">
                    {Object.entries(selectedEntry.inputData).map(([k, v]) => (
                      <div key={k} className="py-2 flex items-start justify-between gap-4">
                        <span className="font-bold text-slate-600 shrink-0">
                          {FIELD_ARABIC_LABELS[k] || k}:
                        </span>
                        <span className="font-mono font-bold text-slate-900 text-left break-all">
                          {typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v ?? '-')}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-400 font-bold py-2">
                    عملية تصفح / استعلام بدون قيم مدخلة إضافية.
                  </p>
                )}
              </div>

              {/* Raw User Agent */}
              {selectedEntry.userAgent && (
                <div className="bg-slate-100 p-3 rounded-xl border border-slate-200 text-[11px] text-slate-500 font-mono break-all">
                  <strong>بصمة الجهاز الكاملة (User-Agent):</strong> {selectedEntry.userAgent}
                </div>
              )}
            </div>

            <div className="bg-white px-6 py-3.5 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedEntry(null)}
                className="rounded-xl bg-slate-800 hover:bg-slate-700 text-white px-5 py-2 text-xs font-bold transition cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
