import React, { useState } from 'react';
import { useAuthStore } from '../../stores/auth.store';

export const ChangePasswordModal: React.FC<{ initialUsername: string; onClose: () => void }> = ({ initialUsername, onClose }) => {
  const [username, setUsername] = useState(initialUsername);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (newPassword !== confirmation) { setError('تأكيد كلمة المرور غير مطابق'); return; }
    if (new TextEncoder().encode(newPassword).length > 72) { setError('كلمة المرور تتجاوز الحد المسموح؛ استخدم كلمة أقصر'); return; }
    setBusy(true);
    try {
      const response = await fetch('/api/auth/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: username.trim(), currentPassword, newPassword }) });
      const data = await response.json();
      if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join('، ') : data.message || 'تعذر تغيير كلمة المرور');
      localStorage.removeItem('dawacore_token');
      localStorage.removeItem('dawacore_user');
      useAuthStore.getState().logout();
      setCurrentPassword(''); setNewPassword(''); setConfirmation('');
      setSuccess('تم تغيير كلمة المرور بنجاح. سجل الدخول باستخدام كلمة المرور الجديدة.');
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر الاتصال بالخادم'); }
    finally { setBusy(false); }
  };
  const inputClass = 'w-full rounded-xl border border-slate-300 p-3 text-sm';
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" dir="rtl">
    <section role="dialog" aria-modal="true" aria-labelledby="change-password-title" className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
      <h2 id="change-password-title" className="mb-2 text-xl font-bold text-slate-800">تغيير كلمة المرور</h2>
      <p className="mb-4 text-sm text-slate-600">يمكن لكل مستخدم تغيير كلمة مروره بعد إدخال الكلمة الحالية. إذا نسيتها، تواصل مع مدير النظام.</p>
      {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {success ? <p role="status" className="rounded-lg bg-green-50 p-3 text-green-800">{success}</p> : <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm">اسم المستخدم<input autoFocus required maxLength={100} autoComplete="username" className={inputClass} value={username} onChange={e => setUsername(e.target.value)} disabled={busy} /></label>
        <label className="block text-sm">كلمة المرور الحالية<input required type="password" maxLength={256} autoComplete="current-password" className={inputClass} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} disabled={busy} /></label>
        <label className="block text-sm">كلمة المرور الجديدة (12 حرفاً على الأقل)<input required type="password" minLength={12} maxLength={72} autoComplete="new-password" className={inputClass} value={newPassword} onChange={e => setNewPassword(e.target.value)} disabled={busy} /></label>
        <label className="block text-sm">تأكيد كلمة المرور الجديدة<input required type="password" minLength={12} maxLength={72} autoComplete="new-password" className={inputClass} value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={busy} /></label>
        <button type="submit" disabled={busy} className="w-full rounded-xl bg-teal-600 p-3 font-bold text-white disabled:opacity-50">{busy ? 'جارٍ التغيير...' : 'حفظ كلمة المرور الجديدة'}</button>
      </form>}
      <button type="button" onClick={onClose} disabled={busy} className="mt-4 w-full rounded-xl bg-slate-100 p-2 text-sm">{success ? 'العودة لتسجيل الدخول' : 'إلغاء'}</button>
    </section>
  </div>;
};
