import axios from 'axios';

const SCREEN_NAMES_MAP: Record<string, string> = {
  '/dashboard': 'لوحة تحكم المدير (Dashboard)',
  '/pos': 'شاشة نقطة البيع السريعة (POS)',
  '/pos/held': 'الفواتير المعلقة (Held Carts)',
  '/sales/invoices': 'سجل فواتير المبيعات',
  '/invoices': 'سجل فواتير المبيعات',
  '/shifts': 'الورديات والصندوق',
  '/sales/returns': 'مرتجع المبيعات',
  '/returns': 'مرتجع المبيعات',
  '/medicines': 'دليل الأصناف والمنتجات',
  '/batches': 'التشغيلات وتواريخ الصلاحية',
  '/stock-count': 'الجرد والتسويات المخزنية',
  '/transfers': 'تحويلات الفروع',
  '/purchasing/orders': 'أوامر الشراء',
  '/purchasing/receive': 'استلام المشتريات والتوريد',
  '/suppliers': 'إدارة الموردين',
  '/customers': 'العملاء والبيع الآجل',
  '/statement': 'كشف حساب تفصيلي',
  '/expenses': 'المصروفات وسندات الصرف',
  '/accounting/accounts': 'شجرة الحسابات (الدليل المحاسبي)',
  '/accounting/ledger': 'دفتر الأستاذ والقيود اليومية',
  '/accounting/reports': 'التقارير المالية الأساسية',
  '/accounting/fiscal-years': 'السنوات المالية والإقفال',
  '/opening-balance': 'الأرصدة الافتتاحية المحاسبية',
  '/reports': 'مركز التقارير الشامل',
  '/reports/balance-sheet': 'الميزانية العمومية (المركز المالي)',
  '/companies': 'الشركات والكيانات',
  '/branches': 'إدارة الفروع',
  '/users-management': 'المستخدمين والصلاحيات',
  '/audit-logs': 'سجل الرقابة ومتابعة المستخدمين',
  '/settings': 'إعدادات النظام والعملات',
};

let isAuditInterceptorInstalled = false;
let lastTrackedPath = '';
let lastTrackedTime = 0;

function getStoredUser() {
  try {
    const raw = localStorage.getItem('dawacore_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('dawacore_token') || localStorage.getItem('token');
}

/**
 * تفعيل إرسال هوية المستخدم والـ JWT Token تلقائياً مع جميع طلبات (axios & fetch)
 * لحماية الـ APIs وضمان عمل حارس المصادقة والتفويض
 */
export function installGlobalAuditHeaders(): void {
  if (isAuditInterceptorInstalled || typeof window === 'undefined') return;
  isAuditInterceptorInstalled = true;

  // 1. حقن الـ Token والهيدرز في جميع طلبات Axios
  axios.interceptors.request.use((config) => {
    const user = getStoredUser();
    const token = getStoredToken();
    if (config.headers) {
      if (token && !config.headers['Authorization']) {
        config.headers['Authorization'] = `Bearer ${token}`;
      }
      if (user) {
        config.headers['x-user-id'] = encodeURIComponent(user.id || user.username || 'user');
        config.headers['x-user-name'] = encodeURIComponent(user.name || user.username || 'مستخدم');
        config.headers['x-user-role'] = encodeURIComponent(user.role || 'USER');
        if (user.branchId) config.headers['x-branch-id'] = encodeURIComponent(user.branchId);
        if (user.companyId) config.headers['x-company-id'] = encodeURIComponent(user.companyId);
      }
    }
    return config;
  });

  // معالجة خطأ 401 لانتهاء الجلسة تلقائياً في Axios
  axios.interceptors.response.use(
    (response) => response,
    (error) => {
      if (
        error.response?.status === 401 &&
        window.location.pathname !== '/login' &&
        window.location.pathname !== '/customer-screen'
      ) {
        localStorage.removeItem('dawacore_token');
        localStorage.removeItem('token');
        window.location.href = '/login';
      }
      return Promise.reject(error);
    }
  );

  // 2. حقن الـ Token والهيدرز في جميع طلبات window.fetch الموجهة إلى /api
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (urlStr.startsWith('/api') || urlStr.startsWith('http://') || urlStr.startsWith('https://')) {
        const user = getStoredUser();
        const token = getStoredToken();
        const headers = new Headers(init?.headers || {});

        if (token && !headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${token}`);
        }

        if (user) {
          if (!headers.has('x-user-id')) {
            headers.set('x-user-id', encodeURIComponent(user.id || user.username || 'user'));
          }
          if (!headers.has('x-user-name')) {
            headers.set('x-user-name', encodeURIComponent(user.name || user.username || 'مستخدم'));
          }
          if (!headers.has('x-user-role')) {
            headers.set('x-user-role', encodeURIComponent(user.role || 'USER'));
          }
          if (user.branchId && !headers.has('x-branch-id')) {
            headers.set('x-branch-id', encodeURIComponent(user.branchId));
          }
          if (user.companyId && !headers.has('x-company-id')) {
            headers.set('x-company-id', encodeURIComponent(user.companyId));
          }
        }
        init = { ...(init || {}), headers };
      }
    } catch {
      // ignore header injection errors
    }
    return originalFetch(input, init);
  };
}

/**
 * تسجيل دخول المستخدم إلى أي شاشة في النظام (أين دخل ومتى ومن أي جهاز و IP)
 */
export async function trackScreenNavigation(pathname: string): Promise<void> {
  if (typeof window === 'undefined') return;
  if (pathname === '/login' || pathname === '/customer-screen') return;

  const now = Date.now();
  if (pathname === lastTrackedPath && now - lastTrackedTime < 5000) return;
  lastTrackedPath = pathname;
  lastTrackedTime = now;

  const user = getStoredUser();
  if (!user) return;

  const screenName =
    SCREEN_NAMES_MAP[pathname] ||
    (pathname.startsWith('/stock-count/')
      ? 'ورقة عمل الجرد المخزني'
      : pathname.startsWith('/opening-balance/')
      ? 'تفاصيل قيد الرصيد الافتتاحي'
      : `شاشة (${pathname})`);

  try {
    await fetch('/api/dashboard/audit-logs/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId: user.companyId,
        branchId: user.branchId,
        userId: user.id || user.username,
        userName: user.name || user.username,
        userRole: user.role,
        action: 'SCREEN_VIEW',
        actionLabel: 'دخول وتصفح شاشة',
        entityType: 'تصفح الشاشات',
        entityId: pathname,
        screenName,
        path: pathname,
        summary: `دخل المستخدم (${user.name || user.username}) إلى «${screenName}»`,
      }),
    });
  } catch {
    // ignore offline errors
  }
}
