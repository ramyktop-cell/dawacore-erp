import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { openingBalanceApi } from '../../api/opening-balance';
import {
  ArrowRight,
  CheckCircle2,
  Printer,
  AlertTriangle,
  XCircle,
  BookOpen,
} from 'lucide-react';

export const OpeningBalanceDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const { data: doc, isLoading } = useQuery({
    queryKey: ['opening-balance', id],
    queryFn: () => openingBalanceApi.getOne(id!),
    enabled: !!id,
  });

  const postMutation = useMutation({
    mutationFn: () => openingBalanceApi.post(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opening-balance', id] });
      queryClient.invalidateQueries({ queryKey: ['opening-balances'] });
      alert('تم ترحيل الأرصدة الافتتاحية وإثبات القيد في دفتر اليومية بنجاح');
    },
    onError: (err: any) => {
      alert(err?.response?.data?.message || 'فشل الترحيل');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => openingBalanceApi.cancel(id!, cancelReason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opening-balance', id] });
      setIsCancelModalOpen(false);
    },
  });

  if (isLoading || !doc) {
    return <div className="p-8 text-center text-slate-500">جاري تحميل المستند...</div>;
  }

  const isBalanced = Math.abs(Number(doc.difference)) < 0.01;

  return (
    <div className="p-6" dir="rtl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/opening-balance')}
            className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
          >
            <ArrowRight size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <span className="font-mono text-violet-700">{doc.documentNumber}</span>
              {doc.status === 'POSTED' && (
                <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-50 text-emerald-700 border border-emerald-200">
                  معتمد ومرحل
                </span>
              )}
              {doc.status === 'DRAFT' && (
                <span className="px-2 py-0.5 rounded-full text-xs bg-amber-50 text-amber-700 border border-amber-200">
                  مسودة
                </span>
              )}
              {doc.status === 'CANCELLED' && (
                <span className="px-2 py-0.5 rounded-full text-xs bg-rose-50 text-rose-700 border border-rose-200">
                  ملغي
                </span>
              )}
            </h1>
            <p className="text-xs text-slate-500">
              {doc.branch?.name} • تاريخ السريان: {new Date(doc.effectiveDate).toLocaleDateString('ar-EG')}
            </p>
          </div>
        </div>

        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm cursor-pointer"
        >
          <Printer size={16} /> طباعة المستند
        </button>
      </div>

      {!isBalanced && (
        <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2">
          <AlertTriangle size={18} className="text-rose-600 mt-0.5" />
          <div className="text-xs text-rose-800">
            <p className="font-bold">❌ تنبيه: المستند غير متوازن حسابياً</p>
            <p>الفرق بين المدين والدائن: {Number(doc.difference).toLocaleString()} ج.س</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-white p-3 rounded-lg border border-slate-200">
          <span className="text-xs text-slate-500">إجمالي المدين</span>
          <p className="text-lg font-bold text-blue-600 font-mono">
            {Number(doc.totalDebit).toLocaleString()} ج.س
          </p>
        </div>
        <div className="bg-white p-3 rounded-lg border border-slate-200">
          <span className="text-xs text-slate-500">إجمالي الدائن</span>
          <p className="text-lg font-bold text-rose-600 font-mono">
            {Number(doc.totalCredit).toLocaleString()} ج.س
          </p>
        </div>
        <div className="bg-white p-3 rounded-lg border border-slate-200">
          <span className="text-xs text-slate-500">حالة التوازن</span>
          <p className={`text-lg font-bold ${isBalanced ? 'text-emerald-600' : 'text-rose-600'}`}>
            {isBalanced ? 'متوازن ✅' : 'غير متوازن ❌'}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="py-2 px-3 text-right font-semibold text-slate-600">الحساب</th>
              <th className="py-2 px-3 text-right font-semibold text-slate-600">البيان</th>
              <th className="py-2 px-3 text-center font-semibold text-slate-600">مدين</th>
              <th className="py-2 px-3 text-center font-semibold text-slate-600">دائن</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {doc.items?.map((item: any) => (
              <tr key={item.id} className="hover:bg-slate-50">
                <td className="py-2 px-3">
                  <span className="font-mono text-xs text-slate-500 ml-2">{item.account?.code}</span>
                  <span className="text-slate-800">{item.account?.name}</span>
                </td>
                <td className="py-2 px-3 text-slate-600 text-xs">{item.description}</td>
                <td className="py-2 px-3 text-center font-mono">
                  {Number(item.debit) > 0 ? Number(item.debit).toLocaleString() : '—'}
                </td>
                <td className="py-2 px-3 text-center font-mono">
                  {Number(item.credit) > 0 ? Number(item.credit).toLocaleString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-50 border-t-2 border-slate-300 font-bold">
            <tr>
              <td colSpan={2} className="py-2 px-3 text-left">الإجمالي المتوازن:</td>
              <td className="py-2 px-3 text-center font-mono text-violet-700">
                {Number(doc.totalDebit).toLocaleString()}
              </td>
              <td className="py-2 px-3 text-center font-mono text-violet-700">
                {Number(doc.totalCredit).toLocaleString()}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {doc.status === 'DRAFT' && (
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={() => setIsCancelModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-rose-300 text-rose-600 hover:bg-rose-50 text-sm font-medium cursor-pointer"
          >
            <XCircle size={16} /> إلغاء المسودة
          </button>
          <button
            onClick={() => {
              if (isBalanced && confirm('سيتم ترحيل الأرصدة وتعديل دفاتر الأستاذ نهائياً. هل أنت متأكد؟')) {
                postMutation.mutate();
              }
            }}
            disabled={!isBalanced || postMutation.isPending}
            className="flex items-center gap-2 px-6 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 text-sm font-medium cursor-pointer"
          >
            <CheckCircle2 size={16} />
            {postMutation.isPending ? 'جاري الترحيل...' : 'ترحيل نهائي إلى الحسابات'}
          </button>
        </div>
      )}

      {doc.status === 'POSTED' && doc.journalEntryId && (
        <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2">
          <BookOpen size={18} className="text-emerald-600" />
          <p className="text-sm text-emerald-800">
            تم إنشاء قيد اليومية بنجاح.{' '}
            <Link to={`/ledger?highlight=${doc.journalEntryId}`} className="font-bold underline text-emerald-900">
              اضغط هنا لعرض تفاصيل القيد في دفتر الأستاذ
            </Link>
          </p>
        </div>
      )}

      {isCancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" dir="rtl">
          <div className="w-[480px] bg-white rounded-2xl shadow-2xl p-6">
            <h2 className="text-xl font-bold text-slate-800 mb-4">إلغاء مسودة الأرصدة</h2>
            <label className="block text-sm font-medium text-slate-700 mb-1">سبب الإلغاء *</label>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-300 p-2.5 text-sm"
              placeholder="اكتب سبب إلغاء المسودة..."
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => setIsCancelModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm cursor-pointer"
              >
                رجوع
              </button>
              <button
                onClick={() => cancelMutation.mutate()}
                disabled={!cancelReason.trim()}
                className="px-6 py-2 rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 text-sm font-medium cursor-pointer"
              >
                تأكيد الإلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
