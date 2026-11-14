import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, Navigate } from 'react-router-dom';
import { openingBalanceApi, OpeningBalanceDocument } from '../../api/opening-balance';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable } from '../../components/common/DataTable';
import { OpeningBalanceWizard } from '../../components/opening-balance/OpeningBalanceWizard';
import { Plus, Eye, CheckCircle2, Clock, XCircle, AlertTriangle } from 'lucide-react';
import { useAuthStore } from '../../stores/auth.store';

export const OpeningBalancePage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  // ✅ استخراج companyId من السياق الآمن
  const companyId = useAuthStore((s) => s.user?.companyId);
  const token = useAuthStore((s) => s.token);

  // ✅ إذا لم يكن المستخدم مسجلاً، وجّهه لصفحة الدخول
  if (!companyId || !token) {
    return <Navigate to="/login" replace />;
  }

  const { data, isLoading } = useQuery({
    queryKey: ['opening-balances', companyId],
    queryFn: () => openingBalanceApi.getAll({ companyId }),
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock size={12} /> مسودة
          </span>
        );
      case 'POSTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 size={12} /> معتمد ومرحّل
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle size={12} /> ملغي
          </span>
        );
      default:
        return null;
    }
  };

  const columns = [
    {
      header: 'رقم المستند',
      accessor: (item: OpeningBalanceDocument) => (
        <span className="font-mono font-bold text-violet-700">{item.documentNumber}</span>
      ),
    },
    {
      header: 'الفرع',
      accessor: (item: OpeningBalanceDocument) => item.branch?.name || '-',
    },
    {
      header: 'تاريخ السريان',
      accessor: (item: OpeningBalanceDocument) =>
        new Date(item.effectiveDate).toLocaleDateString('ar-EG'),
    },
    {
      header: 'إجمالي المدين',
      accessor: (item: OpeningBalanceDocument) => (
        <span className="font-mono text-slate-700">
          {Number(item.totalDebit).toLocaleString()} ج.س
        </span>
      ),
    },
    {
      header: 'إجمالي الدائن',
      accessor: (item: OpeningBalanceDocument) => (
        <span className="font-mono text-slate-700">
          {Number(item.totalCredit).toLocaleString()} ج.س
        </span>
      ),
    },
    {
      header: 'الفرق المالي',
      accessor: (item: OpeningBalanceDocument) => {
        const diff = Number(item.difference);
        return (
          <span
            className={`font-mono font-semibold ${
              Math.abs(diff) < 0.01 ? 'text-emerald-600' : 'text-rose-600'
            }`}
          >
            {diff.toLocaleString()} ج.س
          </span>
        );
      },
    },
    {
      header: 'الحالة',
      accessor: (item: OpeningBalanceDocument) => getStatusBadge(item.status),
    },
    {
      header: 'الإجراءات',
      accessor: (item: OpeningBalanceDocument) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/opening-balance/${item.id}`);
          }}
          className="p-1.5 text-violet-600 hover:bg-violet-50 rounded-lg transition-colors cursor-pointer"
          title="عرض التفاصيل"
        >
          <Eye size={16} />
        </button>
      ),
    },
  ];

  const hasPostedDocument = Array.isArray(data) && data.some((d: OpeningBalanceDocument) => d.status === 'POSTED');

  return (
    <div className="p-6" dir="rtl">
      <PageHeader
        title="الأرصدة الافتتاحية للمنشأة"
        subtitle="حجر الأساس المالي لافتتاح الحسابات، تقييم المخزون البدئي، وضبط ميزان المراجعة"
        action={
          <button
            onClick={() => setIsWizardOpen(true)}
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-4 py-2.5 rounded-lg transition-colors text-sm font-medium cursor-pointer"
          >
            <Plus size={18} /> بدء إدخال أرصدة فرع
          </button>
        }
      />

      {hasPostedDocument && (
        <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-2">
          <CheckCircle2 size={18} className="text-emerald-600 mt-0.5" />
          <div className="text-xs text-emerald-800">
            <p className="font-bold">✅ تم اعتماد وترحيل الأرصدة الافتتاحية</p>
            <p>الفروع المعتمدة محمية من التكرار، ويمكنك إدخال رصيد افتتاحي لفرع آخر غير معتمد.</p>
          </div>
        </div>
      )}

      {!hasPostedDocument && !isLoading && (!data || data.length === 0) && (
        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
          <AlertTriangle size={18} className="text-amber-600 mt-0.5" />
          <div className="text-xs text-amber-800">
            <p className="font-bold">⚠️ تنبيه: لم يتم إدخال الأرصدة الافتتاحية بعد</p>
            <p>يجب إدخال رصيد المخزن والخزينة قبل تسجيل أول فاتورة مبيعات أو مشتريات لضمان دقة الأرباح.</p>
          </div>
        </div>
      )}

      <div className="mt-4 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <DataTable data={data || []} columns={columns} isLoading={isLoading} />
      </div>

      <OpeningBalanceWizard
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        onSuccess={(documentId: string) => {
          queryClient.invalidateQueries({ queryKey: ['opening-balances'] });
          navigate(`/opening-balance/${documentId}`);
        }}
      />
    </div>
  );
};
