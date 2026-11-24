import { ChangePasswordModal } from '../components/auth/ChangePasswordModal';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth.store';
import { VirtualKeyboard } from '../components/common/VirtualKeyboard';
import { usePlatformBrand } from '../hooks/usePlatformBrand';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { platform, deploymentBadgeText, brandCssVars } = usePlatformBrand();
  const [logoError, setLogoError] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [activeField, setActiveField] = useState<'username' | 'password'>('username');
  const [showKeyboard, setShowKeyboard] = useState(true);
  const [companyChoices, setCompanyChoices] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    setLogoError(false);
  }, [platform.platformLogoUrl]);

  const handleSubmit = async (e?: React.FormEvent, companyId?: string) => {
    if (e) e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setErrorMsg('يرجى إدخال اسم المستخدم وكلمة المرور');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, ...(companyId ? { companyId } : {}) }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'فشل تسجيل الدخول');
      if (data.requiresCompanySelection) {
        setCompanyChoices(data.companies || []);
        return;
      }
      setCompanyChoices([]);

      // حفظ التوكن وبيانات المستخدم في التخزين الآمن
      localStorage.setItem('dawacore_token', data.accessToken);
      localStorage.setItem('dawacore_user', JSON.stringify(data.user));
      useAuthStore.getState().setAuth(data.user, data.accessToken);

      // تسجيل دخول المستخدم في سجل الرقابة
      try {
        await fetch('/api/dashboard/audit-logs/track', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${data.accessToken}`,
          },
          body: JSON.stringify({
            companyId: data.user.companyId,
            branchId: data.user.branchId,
            userId: data.user.id || data.user.username,
            userName: data.user.name || data.user.username,
            userRole: data.user.role,
            action: 'USER_LOGIN',
            actionLabel: 'تسجيل دخول',
            entityType: 'تسجيل الدخول',
            entityId: data.user.id,
            screenName: 'شاشة تسجيل الدخول',
            path: '/login',
            summary: `قام المستخدم (${data.user.name || data.user.username}) بتسجيل الدخول إلى النظام بنجاح`,
          }),
        });
      } catch {
        // ignore audit failure on login
      }

      // التوجيه المباشر بناءً على الصلاحيات
      const role = data.user.role || (data.user.roles && data.user.roles[0]);
      if (role === 'CASHIER') {
        navigate('/pos');
      } else if (role === 'INVENTORY' || role === 'STORE_KEEPER') {
        navigate('/medicines');
      } else {
        navigate('/dashboard');
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // معالجات لوحة المفاتيح الافتراضية لشاشات اللمس
  const handleVirtualKeyPress = (char: string) => {
    if (activeField === 'username') {
      setUsername((prev) => prev + char);
    } else {
      setPassword((prev) => prev + char);
    }
  };

  const handleVirtualBackspace = () => {
    if (activeField === 'username') {
      setUsername((prev) => prev.slice(0, -1));
    } else {
      setPassword((prev) => prev.slice(0, -1));
    }
  };

  const handleVirtualClear = () => {
    if (activeField === 'username') {
      setUsername('');
    } else {
      setPassword('');
    }
  };

  return (
    <div
      className="flex min-h-screen w-full justify-center overflow-x-hidden bg-[#F4F6F8] font-sans lg:justify-start"
      dir="rtl"
      style={brandCssVars}
    >
      {/* القسم الجانبي الأيمن: بطاقة الدخول وشاشة اللمس */}
      <div className="z-10 flex max-h-screen w-full max-w-[680px] flex-col justify-start overflow-y-auto bg-white px-4 py-6 shadow-xl sm:px-8 lg:w-[620px] lg:max-w-none lg:justify-center lg:px-10">
        <div className="mb-4 sm:mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {!logoError && platform.platformLogoUrl ? (
                <img
                  src={platform.platformLogoUrl}
                  alt={`${platform.platformName || 'MadarCore'} Logo`}
                  onError={() => setLogoError(true)}
                  className="h-11 w-11 sm:h-12 sm:w-12 rounded-2xl object-cover shadow-md border-2"
                  style={{ borderColor: platform.primaryColor }}
                />
              ) : (
                <div
                  className="flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-2xl text-white shadow-md font-bold text-xl"
                  style={{ backgroundColor: platform.primaryColor }}
                >
                  {(platform.platformName || 'MadarCore').charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <h1
                  className="text-xl sm:text-2xl font-black leading-tight"
                  style={{ color: platform.primaryColor }}
                >
                  {platform.platformName || 'MadarCore'}
                </h1>
                <p
                  className="text-[11px] sm:text-xs font-bold"
                  style={{ color: platform.secondaryColor }}
                >
                  منصة {platform.platformNameAr || 'مدار كور'} لإدارة الأعمال ونقاط البيع
                </p>
              </div>
            </div>

            {/* زر إظهار/إخفاء الكيبورد اللمسي */}
            <button
              type="button"
              onClick={() => setShowKeyboard(!showKeyboard)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer ${
                showKeyboard
                  ? 'bg-teal-50'
                  : 'bg-slate-50 border-slate-300 text-slate-600 hover:bg-slate-100'
              }`}
              style={
                showKeyboard
                  ? { borderColor: platform.secondaryColor, color: platform.secondaryColor }
                  : undefined
              }
              title="إظهار أو إخفاء لوحة المفاتيح الافتراضية"
            >
              <span>⌨️</span>
              <span className="hidden sm:inline">{showKeyboard ? 'إخفاء اللوحة' : 'لوحة اللمس'}</span>
            </button>
          </div>

          <div className="mt-4 sm:mt-5 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-800">تسجيل الدخول للمنظومة</h2>
              <p className="text-xs text-slate-500">مُهيّأ للأجهزة اللوحية (Tablet) وشاشات اللمس ونقاط البيع.</p>
            </div>
            <span
              className="rounded-full border px-2.5 py-1 text-[11px] font-bold lg:hidden"
              style={{ borderColor: platform.secondaryColor, color: platform.primaryColor }}
            >
              {deploymentBadgeText}
            </span>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs font-bold text-red-600 animate-shake">
            ⚠️ {errorMsg}
          </div>
        )}

        {companyChoices.length > 0 && (
          <div className="mb-3 rounded-xl border border-teal-200 bg-teal-50 p-3">
            <p className="mb-2 text-xs font-bold text-teal-800">اختر الشركة لإكمال تسجيل الدخول</p>
            <div className="grid gap-2">
              {companyChoices.map((company) => (
                <button key={company.id} type="button" disabled={isLoading} onClick={() => handleSubmit(undefined, company.id)}
                  className="rounded-lg border border-teal-300 bg-white p-2 text-sm font-bold text-teal-800 hover:bg-teal-100">
                  {company.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* حقل اسم المستخدم */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-700">اسم المستخدم</label>
              {activeField === 'username' && (
                <span
                  className="text-[10px] font-bold bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200"
                  style={{ color: platform.primaryColor, borderColor: platform.primaryColor }}
                >
                  ✏️ الحقل النشط للكتابة
                </span>
              )}
            </div>
            <div className="relative">
              <input
                type="text"
                autoFocus
                value={username}
                onFocus={() => setActiveField('username')}
                onClick={() => setActiveField('username')}
                onChange={(e) => { setUsername(e.target.value); setCompanyChoices([]); }}
                placeholder="مثال: cashier_01 أو admin"
                autoComplete="username"
                maxLength={64}
                className={`w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition font-medium ${
                  activeField === 'username'
                    ? 'ring-2 ring-purple-100 bg-purple-50/20'
                    : 'border-slate-300 hover:border-slate-400 bg-white'
                }`}
                style={activeField === 'username' ? { borderColor: platform.primaryColor } : undefined}
              />
              {username && (
                <button
                  type="button"
                  onClick={() => setUsername('')}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs px-1 py-0.5"
                  title="مسح"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* حقل كلمة المرور */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-700">كلمة المرور</label>
              {activeField === 'password' && (
                <span
                  className="text-[10px] font-bold bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200"
                  style={{ color: platform.secondaryColor, borderColor: platform.secondaryColor }}
                >
                  ✏️ الحقل النشط للكتابة
                </span>
              )}
            </div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onFocus={() => setActiveField('password')}
                onClick={() => setActiveField('password')}
                onChange={(e) => { setPassword(e.target.value); setCompanyChoices([]); }}
                placeholder="••••••••"
                autoComplete="current-password"
                maxLength={128}
                className={`w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition font-medium ${
                  activeField === 'password'
                    ? 'ring-2 ring-teal-100 bg-teal-50/20'
                    : 'border-slate-300 hover:border-slate-400 bg-white'
                }`}
                style={activeField === 'password' ? { borderColor: platform.secondaryColor } : undefined}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-sm p-1 cursor-pointer"
                title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              >
                {showPassword ? '👁️' : '🙈'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-xl py-3 text-sm font-bold text-white shadow-lg transition hover:opacity-95 active:scale-[0.99] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
            style={{ backgroundColor: platform.secondaryColor }}
          >
            {isLoading ? (
              <>
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>جارٍ التحقق...</span>
              </>
            ) : (
              <span>دخول المنظومة</span>
            )}
          </button>
        </form>

        <button
          type="button"
          onClick={() => setChangePasswordOpen(true)}
          className="mt-3 w-full rounded-xl border border-teal-200 py-2 text-sm font-bold hover:bg-teal-50"
          style={{ borderColor: platform.secondaryColor, color: platform.secondaryColor }}
        >
          تغيير كلمة المرور
        </button>
        {changePasswordOpen && <ChangePasswordModal initialUsername={username} onClose={() => setChangePasswordOpen(false)} />}

        {/* ⌨️ لوحة المفاتيح الافتراضية تحت اسم الدخول وكلمة المرور للشاشات اللمسية والتابلت */}
        {showKeyboard && (
          <VirtualKeyboard
            activeField={activeField}
            setActiveField={setActiveField}
            onKeyPress={handleVirtualKeyPress}
            onBackspace={handleVirtualBackspace}
            onClear={handleVirtualClear}
            onSubmit={() => handleSubmit()}
            onClose={() => setShowKeyboard(false)}
          />
        )}

        <div className="mt-4 text-center text-[10px] text-slate-400">
          {platform.platformName || 'MadarCore'} ERP & POS v1.0 • منصة {platform.platformNameAr || 'مدار كور'} • دعم شاشات اللمس والتابلت
        </div>
      </div>

      {/* القسم الأيسر: لوحة ترويجية جمالية تحمل الهوية البصرية */}
      <div
        className="hidden min-w-0 flex-1 flex-col justify-between p-12 text-white lg:flex"
        style={{
          background: `linear-gradient(135deg, ${platform.primaryColor}, #1e1b4b)`,
        }}
      >
        <div className="flex justify-end">
          <span
            className="rounded-full bg-white/10 px-3.5 py-1 text-xs font-bold backdrop-blur-xs text-white border"
            style={{ borderColor: platform.secondaryColor }}
          >
            {deploymentBadgeText}
          </span>
        </div>

        <div className="max-w-md space-y-4">
          <div
            className="inline-block rounded-2xl p-3 text-white shadow-lg text-2xl"
            style={{ backgroundColor: platform.secondaryColor }}
          >
            ⚡
          </div>
          <h2 className="text-3xl font-black leading-tight">
            سرعة، دقة، ورقابة صارمة على المخزون والمبيعات
          </h2>
          <p className="text-sm leading-relaxed text-pink-100/80">
            منصة متكاملة تربط المبيعات بالمخزون والدفعات، وتدقيق مالي مزدوج يضمن حماية الأرباح وتفادي العجز المخزني والمالي لمختلف الأنشطة التجارية.
          </p>
        </div>

        <div className="flex items-center justify-between border-t border-white/10 pt-4 text-xs text-pink-200/60">
          <span>دعم فني على مدار الساعة</span>
          <span>آمن ومشفر بنظام JWT & RBAC</span>
        </div>
      </div>
    </div>
  );
};
