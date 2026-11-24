import React, { useEffect, useState } from 'react';
import { ShieldAlert, ShieldCheck, Copy, Check, KeyRound, Laptop, Sparkles, Building2, Calendar } from 'lucide-react';
import { licensingApi, LicenseStatus } from '../api/licensing';
import { usePlatformBrand } from '../hooks/usePlatformBrand';

interface Props {
  initialStatus: LicenseStatus;
  onActivated: (newStatus: LicenseStatus) => void;
}

export const ActivationPage: React.FC<Props> = ({ initialStatus, onActivated }) => {
  const { platform, deploymentBadgeText, brandCssVars } = usePlatformBrand();
  const [logoError, setLogoError] = useState(false);
  const [licenseKey, setLicenseKey] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(initialStatus.error || '');
  const [successInfo, setSuccessInfo] = useState<LicenseStatus | null>(
    initialStatus.isActivated ? initialStatus : null
  );

  useEffect(() => {
    setLogoError(false);
  }, [platform.platformLogoUrl]);

  const hwid = initialStatus.hwid || 'جاري استخراج كود الجهاز...';

  const handleCopyHwid = () => {
    if (hwid) {
      navigator.clipboard.writeText(hwid);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!licenseKey.trim()) {
      setErrorMessage('يرجى لصق مفتاح الترخيص');
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      const res = await licensingApi.activate(licenseKey.trim());
      setSuccessInfo(res);
      setTimeout(() => {
        onActivated(res);
      }, 1500);
    } catch (err: any) {
      const msg =
        err.response?.data?.message ||
        err.message ||
        'فشل تفعيل الترخيص. يرجى التأكد من صحة المفتاح وكود الجهاز.';
      setErrorMessage(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen w-screen flex items-center justify-center p-4 font-sans text-slate-100"
      dir="rtl"
      style={{
        ...brandCssVars,
        background: `linear-gradient(135deg, #0f172a, ${platform.primaryColor}, #020617)`,
      }}
    >
      <div className="w-full max-w-xl bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
        {/* Glow effect */}
        <div
          className="absolute -top-24 -right-24 w-64 h-64 rounded-full blur-3xl pointer-events-none opacity-30"
          style={{ backgroundColor: platform.primaryColor }}
        />
        <div
          className="absolute -bottom-24 -left-24 w-64 h-64 rounded-full blur-3xl pointer-events-none opacity-25"
          style={{ backgroundColor: platform.secondaryColor }}
        />

        {/* Header */}
        <div className="text-center relative z-10">
          <div className="mb-3 flex justify-center">
            <span
              className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold text-white border"
              style={{ borderColor: platform.secondaryColor }}
            >
              {deploymentBadgeText}
            </span>
          </div>
          <div className="inline-block relative mb-3">
            {!logoError && platform.platformLogoUrl ? (
              <img
                src={platform.platformLogoUrl || '/logo.png'}
                alt={`${platform.platformName || 'MadarCore'} Logo`}
                onError={() => setLogoError(true)}
                className="w-20 h-20 rounded-2xl mx-auto shadow-2xl border-2 object-cover"
                style={{ borderColor: platform.secondaryColor }}
              />
            ) : (
              <div
                className="w-20 h-20 rounded-2xl mx-auto shadow-2xl border-2 flex items-center justify-center text-white text-3xl font-black"
                style={{
                  backgroundColor: platform.primaryColor,
                  borderColor: platform.secondaryColor,
                }}
              >
                {(platform.platformName || 'MadarCore').charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white flex items-center justify-center gap-2">
            <span>تفعيل منصة {platform.platformName || 'MadarCore'}</span>
            <span
              className="text-xs text-white px-2 py-0.5 rounded-md font-mono border"
              style={{
                backgroundColor: platform.primaryColor,
                borderColor: platform.secondaryColor,
              }}
            >
              v1.0
            </span>
          </h1>
          <p className="text-sm text-slate-300 mt-1">
            النظام محمي ومربوط بعتاد هذا الجهاز حصرياً لضمان أمان بياناتك
          </p>
        </div>

        {/* Step 1: Hardware ID */}
        <div className="mt-6 bg-slate-900/60 border border-slate-700/50 rounded-2xl p-5 relative z-10">
          <div className="flex items-center gap-2 text-xs font-semibold text-violet-300 mb-2">
            <Laptop size={16} />
            <span>الخطوة 1: كود تعريف هذا الجهاز (Hardware ID)</span>
          </div>

          <div className="flex items-center justify-between gap-3 bg-black/40 border border-slate-700 rounded-xl px-4 py-3">
            <span
              className="font-mono text-base font-bold tracking-widest select-all"
              dir="ltr"
              style={{ color: platform.secondaryColor }}
            >
              {hwid}
            </span>
            <button
              type="button"
              onClick={handleCopyHwid}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-white text-xs font-medium transition hover:opacity-90"
              style={{
                backgroundColor: platform.primaryColor,
                borderColor: platform.secondaryColor,
              }}
            >
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              {copied ? 'تم النسخ!' : 'نسخ الكود'}
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            ℹ️ انسخ هذا الكود وأرسله للمطور للحصول على مفتاح التفعيل الخاص بمنشأتك.
          </p>
        </div>

        {/* Step 2: Input License Key */}
        <form onSubmit={handleActivate} className="mt-6 space-y-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-violet-300 mb-2">
              <KeyRound size={16} />
              <span>الخطوة 2: الصق مفتاح التفعيل هنا</span>
            </div>
            <textarea
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value)}
              placeholder="الصق المفتاح المشفر المرسل لك من المطور..."
              rows={3}
              dir="ltr"
              className="w-full rounded-xl bg-black/40 border border-slate-700 p-3 text-xs font-mono text-slate-200 placeholder:text-slate-500 outline-none resize-none transition"
              style={licenseKey ? { borderColor: platform.secondaryColor } : undefined}
            />
          </div>

          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-red-950/70 border border-red-500/50 text-red-200 text-xs flex items-center gap-2">
              <ShieldAlert size={18} className="text-red-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successInfo?.isActivated && (
            <div className="p-4 rounded-xl bg-emerald-950/70 border border-emerald-500/50 text-emerald-200 text-xs space-y-1">
              <div className="flex items-center gap-2 font-bold text-emerald-300">
                <ShieldCheck size={18} />
                <span>تم التفعيل بنجاح! جاري فتح النظام...</span>
              </div>
              {successInfo.clientName && (
                <div className="flex items-center gap-1.5 text-slate-300 pt-1">
                  <Building2 size={14} />
                  <span>المنشأة: {successInfo.clientName}</span>
                </div>
              )}
              {successInfo.expiresAt && (
                <div className="flex items-center gap-1.5 text-slate-300">
                  <Calendar size={14} />
                  <span>النوع: {successInfo.expiresAt}</span>
                </div>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !licenseKey.trim() || !!successInfo?.isActivated}
            className="w-full py-3.5 px-6 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed font-bold text-sm text-white shadow-lg flex items-center justify-center gap-2 transition-all transform active:scale-[0.99]"
            style={{
              background: `linear-gradient(90deg, ${platform.primaryColor}, ${platform.secondaryColor})`,
            }}
          >
            {loading ? (
              'جاري التحقق والتفعيل...'
            ) : successInfo?.isActivated ? (
              <>
                <ShieldCheck size={18} />
                <span>تم التفعيل بنجاح</span>
              </>
            ) : (
              <>
                <Sparkles size={18} />
                <span>تفعيل النظام والبدء</span>
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="text-center text-[11px] text-slate-400 mt-6 border-t border-white/10 pt-4 relative z-10">
          منصة {platform.platformName || 'MadarCore'} ({platform.platformNameAr || 'مدار كور'}) لإدارة الأعمال والمخازن • جميع الحقوق محفوظة 2026
        </div>
      </div>
    </div>
  );
};
