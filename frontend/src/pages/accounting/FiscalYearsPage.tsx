import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  Plus,
  Lock,
  Unlock,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  BookOpen,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import {
  fiscalYearsApi,
  FiscalYearSummary,
  FiscalYearStatus,
} from '../../api/fiscal-years';
import { OpenFiscalYearModal } from '../../components/fiscal/OpenFiscalYearModal';
import { CloseFiscalYearModal } from '../../components/fiscal/CloseFiscalYearModal';
import { ReopenFiscalYearModal } from '../../components/fiscal/ReopenFiscalYearModal';

const STATUS_CONFIG: Record<
  FiscalYearStatus,
  { label: string; bg: string; text: string; border: string; icon: React.ReactNode }
> = {
  OPEN: {
    label: 'مفتوحة',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-300',
    icon: <CheckCircle2 className="w-4 h-4" />,
  },
  CLOSING: {
    label: 'تحت الإقفال',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-300',
    icon: <Clock className="w-4 h-4" />,
  },
  CLOSED: {
    label: 'مقفلة',
    bg: 'bg-slate-100',
    text: 'text-slate-600',
    border: 'border-slate-300',
    icon: <Lock className="w-4 h-4" />,
  },
};

export const FiscalYearsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [isOpenModalOpen, setIsOpenModalOpen] = useState(false);
  const [closingYear, setClosingYear] = useState<FiscalYearSummary | null>(null);
  const [reopeningYear, setReopeningYear] = useState<FiscalYearSummary | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['fiscal-years'],
    queryFn: fiscalYearsApi.list,
  });

  const fiscalYears = data || [];

  const handleSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['fiscal-years'] });
    refetch();
  };

  return (
    <div className="p-6 space-y-6 pb-12">
      <PageHeader
        title="السنوات المالية"
        subtitle="إدارة السنوات المالية، فتح سنة جديدة، الإقفال السنوي، وترحيل الأرصدة"
        action={
          <button
            onClick={() => setIsOpenModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-semibold text-sm shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            فتح سنة مالية جديدة
          </button>
        }
      />

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800 space-y-1">
          <p className="font-semibold">آلية إدارة السنوات المالية:</p>
          <ul className="list-disc list-inside space-y-0.5 text-xs">
            <li>لا يمكن فتح سنة جديدة قبل إقفال السنة السابقة نهائياً.</li>
            <li>عند الفتح، يتم ترحيل الأرصدة الافتتاحية تلقائياً.</li>
            <li>عند الإقفال، تُصفَّر الإيرادات والمصروفات ويُرحَّل الصافي للأرباح المحتجزة.</li>
            <li>يمكن للمشرف إعادة فتح سنة مقفلة عند الحاجة (مع تسجيل السبب).</li>
          </ul>
        </div>
      </div>

      {/* Loading / Error / Empty */}
      {isLoading && (
        <div className="text-center py-12 text-slate-500">جاري التحميل...</div>
      )}

      {error && (
        <div className="text-center py-12 text-rose-600">
          فشل تحميل السنوات المالية
        </div>
      )}

      {!isLoading && fiscalYears.length === 0 && (
        <div className="text-center py-12 text-slate-500 bg-white rounded-xl border border-slate-200">
          <Calendar className="w-12 h-12 mx-auto text-slate-300 mb-3" />
          <p className="font-semibold">لا توجد سنوات مالية</p>
          <p className="text-xs mt-1">ابدأ بفتح السنة المالية الأولى</p>
        </div>
      )}

      {/* Cards Grid */}
      {fiscalYears.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {fiscalYears.map((fy) => {
            const cfg = STATUS_CONFIG[fy.status];
            return (
              <div
                key={fy.id}
                className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition"
              >
                {/* Header */}
                <div className="p-4 border-b border-slate-200 flex justify-between items-start">
                  <div>
                    <h3 className="text-2xl font-black text-slate-800">
                      {fy.year}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      {fy.startDate} → {fy.endDate}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${cfg.bg} ${cfg.text} ${cfg.border}`}
                  >
                    {cfg.icon}
                    {cfg.label}
                  </span>
                </div>

                {/* Body */}
                <div className="p-4 space-y-2 text-xs">
                  {fy.openedAt && (
                    <div className="flex justify-between text-slate-600">
                      <span>فُتحت في:</span>
                      <span className="font-mono">
                        {new Date(fy.openedAt).toLocaleDateString('ar-SD')}
                      </span>
                    </div>
                  )}
                  {fy.closedAt && (
                    <div className="flex justify-between text-slate-600">
                      <span>أُقفلت في:</span>
                      <span className="font-mono">
                        {new Date(fy.closedAt).toLocaleDateString('ar-SD')}
                      </span>
                    </div>
                  )}
                  {fy.openingEntryId && (
                    <div className="flex items-center gap-1.5 text-emerald-700">
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>قيد افتتاحي مرحّل</span>
                    </div>
                  )}
                  {fy.closingEntryId && (
                    <div className="flex items-center gap-1.5 text-slate-600">
                      <FileText className="w-3.5 h-3.5" />
                      <span>قيد إقفال مُنشأ</span>
                    </div>
                  )}
                  {fy.notes && (
                    <p className="text-slate-500 italic border-t border-slate-100 pt-2 mt-2">
                      {fy.notes}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex gap-2">
                  {fy.status === 'OPEN' && (
                    <button
                      onClick={() => setClosingYear(fy)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      إقفال السنة
                    </button>
                  )}
                  {fy.status === 'CLOSED' && (
                    <button
                      onClick={() => setReopeningYear(fy)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition border border-slate-300"
                    >
                      <Unlock className="w-3.5 h-3.5" />
                      إعادة فتح
                    </button>
                  )}
                  {fy.status === 'CLOSING' && (
                    <div className="flex-1 text-center text-xs text-amber-700 font-bold py-2">
                      ⏳ قيد المعالجة...
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      <OpenFiscalYearModal
        isOpen={isOpenModalOpen}
        onClose={() => setIsOpenModalOpen(false)}
        onSuccess={handleSuccess}
      />

      <CloseFiscalYearModal
        fiscalYear={closingYear}
        onClose={() => setClosingYear(null)}
        onSuccess={handleSuccess}
      />

      <ReopenFiscalYearModal
        fiscalYear={reopeningYear}
        onClose={() => setReopeningYear(null)}
        onSuccess={handleSuccess}
      />
    </div>
  );
};
export default FiscalYearsPage;
