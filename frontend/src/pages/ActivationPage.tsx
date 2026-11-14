import React, { useState } from 'react';
import { ShieldAlert, ShieldCheck, Copy, Check, KeyRound, Laptop, Sparkles, Building2, Calendar } from 'lucide-react';
import { licensingApi, LicenseStatus } from '../api/licensing';

interface Props {
  initialStatus: LicenseStatus;
  onActivated: (newStatus: LicenseStatus) => void;
}

export const ActivationPage: React.FC<Props> = ({ initialStatus, onActivated }) => {
  const [licenseKey, setLicenseKey] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(initialStatus.error || '');
  const [successInfo, setSuccessInfo] = useState<LicenseStatus | null>(
    initialStatus.isActivated ? initialStatus : null
  );

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
    <div className="min-h-screen w-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-[#1e1b4b] to-slate-950 p-4 font-sans text-slate-100" dir="rtl">
      <div className="w-full max-w-xl bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
        
        {/* Glow effect */}
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-violet-600/30 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-teal-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="text-center relative z-10">
          <div className="inline-block relative mb-3">
            <img
              src="/logo.png"
              alt="DawaCore Logo"
              className="w-20 h-20 rounded-2xl mx-auto shadow-2xl border-2 border-white/20 object-cover"
            />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white flex items-center justify-center gap-2">
            <span>تفعيل نظام DawaCore</span>
            <span className="text-xs bg-violet-500/40 text-violet-200 px-2 py-0.5 rounded-md font-mono border border-violet-400/30">v1.0</span>
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
            <span className="font-mono text-base font-bold tracking-widest text-teal-300 select-all" dir="ltr">
              {hwid}
            </span>
            <button
              type="button"
              onClick={handleCopyHwid}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600/30 hover:bg-violet-600/50 border border-violet-400/30 text-violet-200 text-xs font-medium transition"
            >
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              {copied ? 'تم النسخ!' : 'نسخ الكود'}
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            ℹ️ انسخ هذا الكود وأرسله للمطور للحصول على مفتاح التفعيل الخاص بصيدليتك.
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
              className="w-full rounded-xl bg-black/40 border border-slate-700 p-3 text-xs font-mono text-slate-200 placeholder:text-slate-500 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 outline-none resize-none transition"
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
            className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed font-bold text-sm text-white shadow-lg shadow-violet-600/30 flex items-center justify-center gap-2 transition-all transform active:scale-[0.99]"
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
          نظام DawaCore لإدارة الصيدليات والمخازن • جميع الحقوق محفوظة 2026
        </div>

      </div>
    </div>
  );
};
