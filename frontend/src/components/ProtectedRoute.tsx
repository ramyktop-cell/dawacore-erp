// frontend/src/components/ProtectedRoute.tsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getCurrentUser, getUserRole, hasPermission, getDefaultRouteForRole, ROLE_LABELS } from '../utils/permissions';
import { ShieldAlert } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const location = useLocation();
  const user = getCurrentUser();
  const role = getUserRole();

  // 1. إذا لم يكن مسجل دخول، التوجيه لصفحة تسجيل الدخول
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 2. التحقق من صلاحيات الدور الوظيفي
  if (allowedRoles && allowedRoles.length > 0 && !hasPermission(allowedRoles)) {
    const defaultRoute = getDefaultRouteForRole(role);
    const roleName = role ? ROLE_LABELS[role] || role : 'مستخدم';

    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center" dir="rtl">
        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-rose-50 text-rose-600 shadow-inner">
          <ShieldAlert size={40} />
        </div>
        <h2 className="text-2xl font-black text-slate-800">غير مصرح بالوصول</h2>
        <p className="mt-2 text-sm text-slate-500 max-w-md">
          عذراً، حسابك الحالي مسجل بدور <strong className="text-violet-700">({roleName})</strong> ولا يملك الصلاحيات الكافية للوصول إلى هذه الصفحة.
        </p>
        <a
          href={defaultRoute}
          className="mt-6 rounded-xl bg-violet-600 px-6 py-2.5 text-xs font-bold text-white shadow hover:bg-violet-700 transition"
        >
          العودة لشاشتك الرئيسية المعتمدة
        </a>
      </div>
    );
  }

  return <>{children}</>;
};
